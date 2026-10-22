import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { cloudRequest, pageEvent, type CloudUser, type CloudEvent } from './api';

export default function CloudAccount() {
  const { pathname } = useLocation();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState(false);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const lastPage = useRef('');

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    cloudRequest<{ user: CloudUser | null }>('/me', { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setUser(data.user);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('无法连接账号服务，可继续浏览博客');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
      generation.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!user || !tracking) return;
    const key = `${user.id}:${pathname}`;
    if (lastPage.current === key) return;
    const current = generation.current;
    // A delayed dispatch lets StrictMode clean up the first effect before a request is sent.
    let controller: AbortController | undefined;
    const timer = window.setTimeout(() => {
      controller = new AbortController();
      try {
        const event = pageEvent(`${import.meta.env.BASE_URL.replace(/\/$/, '')}${pathname}`);
        lastPage.current = key;
        // Retries retain the event ID; server insertion is idempotent.
        void (async () => {
          for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
              await cloudRequest('/events/batch', {
                method: 'POST',
                body: JSON.stringify({ events: [event] }),
                signal: controller?.signal,
              });
              return;
            } catch {
              if (controller?.signal.aborted || current !== generation.current) return;
            }
          }
          if (mounted.current && current === generation.current) setError('本次访问记录同步失败，博客仍可正常使用');
        })();
      } catch {
        if (mounted.current) setError('当前浏览器无法记录访问行为');
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      controller?.abort();
    };
  }, [pathname, user, tracking]);

  const action = useCallback(
    async (operation: () => Promise<void>) => {
      if (busy) return;
      const current = ++generation.current;
      setBusy(true);
      setError('');
      try {
        await operation();
      } catch (cause) {
        if (mounted.current && current === generation.current)
          setError(cause instanceof Error ? cause.message : '操作失败，请重试');
      } finally {
        if (mounted.current && current === generation.current) setBusy(false);
      }
    },
    [busy],
  );

  const logout = () => {
    setTracking(false);
    return action(async () => {
      await cloudRequest('/auth/logout', { method: 'POST' });
      window.dispatchEvent(new Event('dblog-account-change'));
      if (mounted.current) {
        setUser(null);
        setEvents([]);
        lastPage.current = '';
      }
    });
  };
  const showEvents = () =>
    action(async () => {
      const data = await cloudRequest<{ events: CloudEvent[] }>('/me/events');
      if (mounted.current) setEvents(data.events);
    });

  return (
    <aside
      aria-label="云端账号"
      className="border-b border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <details className="mx-auto max-w-6xl">
        <summary className="cursor-pointer">
          云端增强版 · {loading ? '正在检查登录状态' : user ? user.name || user.login : '账号登录'}
        </summary>
        <div className="mt-3 space-y-3">
          {!loading && !user && (
            <a className="underline" href="/api/v1/auth/github/start">
              使用 GitHub 登录
            </a>
          )}
          {user && (
            <>
              <p>已登录：{user.login}。登录安全记录由服务器保存，页面访问记录可自行开启。</p>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={tracking}
                  disabled={busy}
                  onChange={(event) => {
                    generation.current += 1;
                    lastPage.current = '';
                    setTracking(event.target.checked);
                  }}
                />
                本次使用期间记录页面访问（不含搜索参数）
              </label>
              <div className="flex gap-4">
                <button className="underline" disabled={busy} onClick={showEvents}>
                  查看最近记录
                </button>
                <button className="underline" disabled={busy} onClick={logout}>
                  退出登录
                </button>
              </div>
              {events.length > 0 && (
                <ul className="space-y-1" aria-label="最近行为记录">
                  {events.map((event) => (
                    <li key={event.eventId}>
                      {event.name === 'login_success' ? '登录' : '访问'} · {event.path} ·{' '}
                      {new Date(event.occurredAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <p>文章和工具支持未登录使用；阅读进度目前保存在本机。</p>
          <p role="status" aria-live="polite">
            {error}
          </p>
        </div>
      </details>
    </aside>
  );
}
