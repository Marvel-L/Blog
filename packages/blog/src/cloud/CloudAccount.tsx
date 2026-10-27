import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { LoaderCircle, LogIn, UserRound, X } from 'lucide-react';
import { useModalOverlay } from '../hooks/useModalOverlay';
import { cloudRequest, pageEvent, type CloudUser, type CloudEvent } from './api';

export default function CloudAccount() {
  const { pathname } = useLocation();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState(false);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closePanel = useCallback(() => setIsOpen(false), []);
  useModalOverlay({ isOpen, onClose: closePanel, containerRef: panelRef, initialFocusRef: closeButtonRef });
  const mounted = useRef(false);
  const generation = useRef(0);
  const lastPage = useRef('');

  useEffect(() => {
    setIsClient(true);
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

  if (!isClient) return null;

  const accountLabel = loading ? '正在检查登录状态' : user ? user.name || user.login : '账号登录';
  const floatingStyle = {
    bottom:
      'calc(var(--tab-bar-height, 0px) + max(1.25rem, var(--cookie-notice-height, 0px) + var(--service-worker-prompt-height, 0px) + env(safe-area-inset-bottom, 0px) + 1.25rem) + 4rem)',
    right: 'max(1rem, calc(env(safe-area-inset-right, 0px) + 1rem))',
  };

  // Portal keeps both the launcher and panel outside the page layout and its transformed ancestors.
  return createPortal(
    <>
      <button
        type="button"
        aria-label={`打开云端账号：${accountLabel}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        title={accountLabel}
        style={floatingStyle}
        className="frosted-control fixed z-floating inline-flex h-14 w-14 flex-col items-center justify-center gap-1 !rounded-full text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 motion-safe:transition-transform motion-safe:hover:-translate-y-1"
        onClick={() => setIsOpen(true)}
      >
        {loading ? (
          <LoaderCircle size={19} aria-hidden="true" className="motion-safe:animate-spin" />
        ) : user ? (
          <UserRound size={19} aria-hidden="true" />
        ) : (
          <LogIn size={19} aria-hidden="true" />
        )}
        <span>{loading ? '检查中' : user ? '账号' : '登录'}</span>
        {error && <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />}
      </button>
      {isOpen && (
        <div
          className="fixed inset-0 z-modal"
          style={{ '--account-bottom': floatingStyle.bottom } as React.CSSProperties}
        >
          <div className="absolute inset-0 bg-black/15" aria-hidden="true" onClick={closePanel} />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${panelId}-title`}
            tabIndex={-1}
            style={{ right: floatingStyle.right }}
            className="frosted-panel absolute bottom-[calc(var(--account-bottom)+4.5rem)] max-h-[calc(100dvh-var(--account-bottom)-5.5rem)] w-[min(22rem,calc(100vw-2rem-env(safe-area-inset-right,0px)))] overflow-y-auto overscroll-contain p-5 text-sm outline-none"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id={`${panelId}-title`} className="font-semibold">
                  云端账号
                </h2>
                <p className="mt-1 text-xs opacity-70">云端增强版 · {accountLabel}</p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="frosted-control inline-flex h-9 w-9 shrink-0 items-center justify-center"
                aria-label="关闭云端账号"
                onClick={closePanel}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-3 leading-relaxed">
              {!loading && !user && (
                <a
                  className="frosted-control flex items-center justify-center gap-2 px-4 py-3 font-medium"
                  href="/api/v1/auth/github/start"
                >
                  <LogIn size={16} aria-hidden="true" />
                  使用 GitHub 登录
                </a>
              )}
              {user && (
                <>
                  <p>已登录：{user.login}。登录安全记录由服务器保存，页面访问记录可自行开启。</p>
                  <label className="flex items-start gap-2">
                    <input
                      className="mt-1"
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="frosted-control px-3 py-2 disabled:opacity-50"
                      disabled={busy}
                      onClick={showEvents}
                    >
                      查看最近记录
                    </button>
                    <button className="frosted-control px-3 py-2 disabled:opacity-50" disabled={busy} onClick={logout}>
                      退出登录
                    </button>
                  </div>
                  {events.length > 0 && (
                    <ul className="space-y-2 break-words" aria-label="最近行为记录">
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
              <p className="text-xs opacity-70">文章和工具支持未登录使用；阅读进度目前保存在本机。</p>
              <p role="status" aria-live="polite">
                {error}
              </p>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
