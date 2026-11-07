import { useEffect, useRef, useState } from 'react';
import { Cloud, RefreshCw, X } from 'lucide-react';
import type { TrendState } from './model';
import {
  clearAuthorization,
  parseAuthorization,
  readAuthorization,
  saveAuthorization,
  type Authorization,
} from './authorization';
import {
  parseResponse,
  SyncError,
  TrendSynchronizer,
  type Mutation,
  type SyncUser,
  type SyncView,
  type Transport,
} from './sync';

const secret = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const challengeFor = async (verifier: string) =>
  btoa(
    String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

// All endpoint references stay in this optional, route-specific bundle.
function apiOrigin() {
  const configured = import.meta.env.VITE_TREND_API_ORIGIN as string | undefined;
  const origin =
    configured || (import.meta.env.VITE_DEPLOY_TARGET === 'cloud' ? window.location.origin : 'https://43.138.216.53');
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
  ) {
    throw new Error('Trend 云端地址配置无效');
  }
  return origin;
}
async function request(origin: string, token: string, path: string, signal: AbortSignal, mutation?: Mutation) {
  const response = await fetch(`${origin}/api/v1/trend${path}`, {
    method: mutation ? 'PUT' : 'GET',
    credentials: token ? 'omit' : 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(mutation ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(mutation ? { body: JSON.stringify(mutation) } : {}),
  });
  if (response.status === 409) throw new SyncError(409, parseResponse(await response.json()));
  if (!response.ok) throw new SyncError(response.status);
  return parseResponse(await response.json());
}
const transportFor = (origin: string, token: string, onUnauthorized = () => {}): Transport => {
  const send = async (signal: AbortSignal, mutation?: Mutation) => {
    try {
      return await request(origin, token, '/dashboard', signal, mutation);
    } catch (cause) {
      if (cause instanceof SyncError && cause.status === 401) onUnauthorized();
      throw cause;
    }
  };
  return { load: (signal) => send(signal), save: (mutation, signal) => send(signal, mutation) };
};
// Retrieving sessionStorage itself can throw, so access it inside guarded helpers.
const authorizationStorage = {
  getItem: (key: string) => window.sessionStorage.getItem(key),
  setItem: (key: string, value: string) => window.sessionStorage.setItem(key, value),
  removeItem: (key: string) => window.sessionStorage.removeItem(key),
};

export default function TrendSync({
  state,
  onApply,
}: {
  state: TrendState;
  onApply: (state: TrendState, user: SyncUser | null) => void;
}) {
  const [view, setView] = useState<SyncView>({
    user: null,
    status: '连接后自动同步到云端',
    conflict: null,
    connecting: false,
    syncing: false,
    pending: false,
    error: false,
    confirmedAt: null,
  });
  const [error, setError] = useState('');
  const [authorizing, setAuthorizing] = useState(false);
  const [open, setOpen] = useState(false);
  const [localAccount, setLocalAccount] = useState(false);
  const orb = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const syncView = useRef(view);
  const engine = useRef<TrendSynchronizer | null>(null);
  const initial = useRef(state);
  const applyRef = useRef(onApply);
  const authorization = useRef<Authorization | null>(null);
  const authorizingRef = useRef(false);
  const connectSaved = useRef<() => Promise<void>>(async () => {});
  const connectCookie = useRef<() => Promise<void>>(async () => {});
  const cookieRetry = useRef(false);
  const clearSaved = useRef<() => void>(() => {});
  const tickRef = useRef<() => void>(() => {});
  const mounted = useRef(false);
  const connectGeneration = useRef(0);
  const popupCleanup = useRef<() => void>(() => {});
  useEffect(() => {
    applyRef.current = onApply;
  }, [onApply]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !orb.current?.contains(event.target as Node))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        orb.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const synchronizer = new TrendSynchronizer(
      initial.current,
      (next, user) => {
        if (mounted.current) applyRef.current(next, user);
      },
      (next) => {
        if (active) {
          syncView.current = next;
          setView(next);
        }
      },
      // Wrap access: even retrieving window.localStorage can fail in privacy mode.
      {
        getItem: (key) => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
      },
    );
    engine.current = synchronizer;
    try {
      const origin = apiOrigin();
      const sameOriginAccount = import.meta.env.VITE_DEPLOY_TARGET === 'cloud' && origin === window.location.origin;
      setLocalAccount(sameOriginAccount);
      clearSaved.current = () => {
        authorization.current = null;
        try {
          clearAuthorization(authorizationStorage, origin);
        } catch (cause) {
          if (active) setError((cause as Error).message);
        }
      };
      connectSaved.current = async () => {
        const saved = authorization.current;
        if (!active || !saved || authorizingRef.current) return;
        const generation = ++connectGeneration.current;
        await synchronizer.connect(
          transportFor(origin, saved.token, () => {
            if (active && generation === connectGeneration.current && authorization.current?.token === saved.token)
              clearSaved.current();
          }),
        );
      };
      connectCookie.current = async () => {
        if (!active || !sameOriginAccount || authorizingRef.current) return;
        cookieRetry.current = true;
        const generation = ++connectGeneration.current;
        await synchronizer.connect(
          transportFor(origin, '', () => {
            if (active && generation === connectGeneration.current) cookieRetry.current = false;
          }),
        );
      };
      try {
        authorization.current = readAuthorization(authorizationStorage, origin, Date.now());
      } catch (cause) {
        setError((cause as Error).message);
      }
      if (authorization.current) {
        void connectSaved.current();
      } else if (sameOriginAccount) {
        void connectCookie.current();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '云端配置无效');
    }
    const tick = () => {
      if (authorizingRef.current) return;
      if (authorization.current && authorization.current.expiresAt <= Date.now()) {
        connectGeneration.current += 1;
        clearSaved.current();
        synchronizer.disconnect();
        setError((previous) => previous || '授权已到期，请重新连接');
      } else if (authorization.current && !syncView.current.user && !syncView.current.connecting) {
        void connectSaved.current();
      } else if (cookieRetry.current && !syncView.current.user && !syncView.current.connecting) {
        void connectCookie.current();
      } else void synchronizer.tick();
    };
    tickRef.current = tick;
    const accountChanged = (event: Event) => {
      connectGeneration.current += 1;
      popupCleanup.current();
      setError('');
      clearSaved.current();
      cookieRetry.current = false;
      authorizingRef.current = false;
      setAuthorizing(false);
      synchronizer.disconnect();
      // Account events only trigger a reload; the API verifies the actual identity.
      if ((event as CustomEvent<{ user?: unknown }>).detail?.user) void connectCookie.current();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') tick();
    }, 15000);
    window.addEventListener('focus', tick);
    window.addEventListener('online', tick);
    window.addEventListener('dblog-account-change', accountChanged);
    return () => {
      active = false;
      mounted.current = false;
      connectGeneration.current += 1;
      popupCleanup.current();
      synchronizer.stop();
      authorization.current = null;
      cookieRetry.current = false;
      authorizingRef.current = false;
      connectSaved.current = async () => {};
      connectCookie.current = async () => {};
      clearSaved.current = () => {};
      tickRef.current = () => {};
      clearInterval(interval);
      window.removeEventListener('focus', tick);
      window.removeEventListener('online', tick);
      window.removeEventListener('dblog-account-change', accountChanged);
    };
  }, []);
  useEffect(() => {
    engine.current?.edit(state);
  }, [state]);

  const connect = async () => {
    popupCleanup.current();
    const generation = ++connectGeneration.current;
    engine.current?.stop();
    authorizingRef.current = true;
    let popup: Window | null = null;
    let controller: AbortController | undefined;
    try {
      const origin = apiOrigin();
      if (import.meta.env.VITE_DEPLOY_TARGET === 'cloud' && origin === window.location.origin) {
        authorizingRef.current = false;
        setError('');
        if (syncView.current.errorStatus === 401) {
          window.dispatchEvent(new Event('dblog-account-open'));
        } else {
          const cookieGeneration = connectGeneration.current + 1;
          await connectCookie.current();
          if (mounted.current && cookieGeneration === connectGeneration.current && syncView.current.errorStatus === 401)
            window.dispatchEvent(new Event('dblog-account-open'));
        }
        return;
      }
      popup = window.open('about:blank', '_blank', 'popup,width=600,height=740');
      if (!popup) throw new Error('登录窗口被拦截，请允许弹出窗口后重试');
      setError('');
      setAuthorizing(true);
      const stateSecret = secret();
      const verifier = secret();
      controller = new AbortController();
      const challenge = await challengeFor(verifier);
      if (!mounted.current || generation !== connectGeneration.current) {
        popup.close();
        return;
      }
      const opened = popup;
      const currentController = controller;
      let received = false;
      const cleanup = () => {
        clearInterval(closed);
        clearTimeout(timeout);
        window.removeEventListener('message', receive);
        currentController.abort();
        opened.close();
      };
      const fail = (message: string) => {
        cleanup();
        if (mounted.current && generation === connectGeneration.current) {
          authorizingRef.current = false;
          setAuthorizing(false);
          setError(message);
        }
      };
      const receive = (event: MessageEvent) => {
        if (
          received ||
          event.origin !== origin ||
          event.source !== opened ||
          event.data?.type !== 'dblog-trend-code' ||
          event.data.state !== stateSecret ||
          !/^[A-Za-z0-9_-]{43}$/.test(event.data.code)
        )
          return;
        received = true;
        clearInterval(closed);
        opened.close();
        void (async () => {
          try {
            const response = await fetch(`${origin}/api/v1/trend/exchange`, {
              method: 'POST',
              credentials: 'omit',
              cache: 'no-store',
              signal: AbortSignal.any([currentController.signal, AbortSignal.timeout(10000)]),
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: event.data.code, verifier }),
            });
            if (!response.ok) throw new SyncError(response.status);
            const data = parseAuthorization(await response.json(), Date.now());
            if (!mounted.current || generation !== connectGeneration.current) return;
            authorization.current = data;
            try {
              saveAuthorization(authorizationStorage, origin, data);
            } catch (cause) {
              setError((cause as Error).message);
            }
            cleanup();
            authorizingRef.current = false;
            setAuthorizing(false);
            await connectSaved.current();
          } catch (cause) {
            fail(cause instanceof Error ? cause.message : '授权失败，请重试');
          }
        })();
      };
      const closed = window.setInterval(() => {
        if (!received && opened.closed) fail('登录窗口已关闭，可重新连接');
      }, 500);
      const timeout = window.setTimeout(() => fail('登录等待超时，请重新连接'), 10 * 60 * 1000);
      popupCleanup.current = cleanup;
      window.addEventListener('message', receive);
      opened.location.href = `${origin}/api/v1/trend/connect?${new URLSearchParams({ origin: window.location.origin, state: stateSecret, challenge })}`;
    } catch (cause) {
      popup?.close();
      controller?.abort();
      if (mounted.current && generation === connectGeneration.current) {
        authorizingRef.current = false;
        setAuthorizing(false);
        setError(cause instanceof Error ? cause.message : '当前浏览器无法完成授权');
      }
    }
  };
  const disconnect = () => {
    popupCleanup.current();
    const generation = ++connectGeneration.current;
    const previous = authorization.current?.token;
    setError('');
    clearSaved.current();
    cookieRetry.current = false;
    authorizingRef.current = false;
    setAuthorizing(false);
    engine.current?.disconnect();
    if (previous) {
      try {
        void fetch(`${apiOrigin()}/api/v1/trend/session`, {
          method: 'DELETE',
          credentials: 'omit',
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${previous}` },
        })
          .then((response) => {
            if (!response.ok) throw new Error('远端授权撤销失败');
          })
          .catch(() => {
            if (mounted.current && generation === connectGeneration.current)
              setError((message) =>
                [message, '本机已断开；远端授权撤销失败，将在到期或退出云端账号后失效'].filter(Boolean).join('；'),
              );
          });
      } catch {
        setError('本机已断开，远端授权撤销失败');
      }
    }
  };
  const busy = authorizing || view.connecting || view.syncing;
  const loginNeeded = localAccount && !view.user && view.errorStatus === 401 && !error;
  const failed = !!error || (view.error && !loginNeeded);
  const synced = !!view.user && !!view.confirmedAt && !view.pending && !busy && !failed && !view.conflict;
  const status = view.conflict
    ? '存在版本冲突'
    : failed
      ? '同步需要重试'
      : busy
        ? '正在同步'
        : view.pending
          ? '有修改待上传'
          : synced
            ? '已同步到云端'
            : '连接云端同步';
  const detail = authorizing ? '请在登录窗口完成 GitHub 授权' : loginNeeded ? '登录账号后自动同步' : view.status;
  return (
    <section className="trend-sync-float" aria-label="Trend 云端同步">
      <button
        ref={orb}
        className={`trend-sync-orb ${busy ? 'is-busy' : ''} ${failed || view.conflict ? 'is-error' : ''} ${synced ? 'is-synced' : ''} ${view.pending ? 'is-pending' : ''}`}
        aria-label={`云端同步：${status}`}
        title={status}
        aria-expanded={open}
        aria-controls="trend-sync-panel"
        onClick={() => setOpen((value) => !value)}
      >
        {busy ? <RefreshCw aria-hidden="true" /> : <Cloud aria-hidden="true" />}
        <i aria-hidden="true" />
      </button>
      {!open && (
        <span className="sr-only" role="status" aria-live="polite">
          {detail}
          {error ? `；${error}` : ''}
        </span>
      )}
      {open && (
        <div
          ref={panel}
          className="trend-sync-panel"
          id="trend-sync-panel"
          role="region"
          aria-label="云端同步详情"
          tabIndex={-1}
        >
          <header>
            <h2>云端同步</h2>
            <button
              className="trend-sync-close"
              aria-label="关闭同步详情"
              onClick={() => {
                setOpen(false);
                orb.current?.focus();
              }}
            >
              <X size={17} />
            </button>
          </header>
          <div className="trend-sync-heading">
            <Cloud size={19} aria-hidden="true" />
            <div>
              <strong>{view.user ? `${view.user.login} · 云端同步` : '连接你的账号'}</strong>
              <span role="status" aria-live="polite" className={view.error && !loginNeeded ? 'is-error' : undefined}>
                {detail}
              </span>
            </div>
          </div>
          <div className="trend-inline-actions">
            {view.user ? (
              <>
                <button
                  className="trend-button trend-button-primary"
                  disabled={busy || !!view.conflict}
                  onClick={() => {
                    setError('');
                    tickRef.current();
                  }}
                >
                  <RefreshCw size={14} />
                  立即同步
                </button>
                <button className="trend-button" onClick={disconnect}>
                  断开同步
                </button>
              </>
            ) : (
              <button
                className="trend-button trend-button-primary"
                disabled={authorizing || view.connecting}
                onClick={() => void connect()}
              >
                {authorizing || view.connecting
                  ? '正在连接'
                  : localAccount
                    ? view.error && !loginNeeded
                      ? '重试连接'
                      : '登录账号并连接'
                    : '使用 GitHub 连接同步'}
              </button>
            )}
            {authorizing && (
              <button className="trend-button" onClick={disconnect}>
                取消连接
              </button>
            )}
          </div>
          {view.conflict && (
            <div className="trend-sync-conflict">
              <p>本地草稿与云端版本 {view.conflict.revision} 不同。请选择保留哪一份。</p>
              <div className="trend-inline-actions">
                <button className="trend-button" onClick={() => engine.current?.resolve(true)}>
                  采用云端版本
                </button>
                <button className="trend-button" onClick={() => engine.current?.resolve(false)}>
                  保留本地并上传
                </button>
              </div>
            </div>
          )}
          <p className="trend-sync-note">
            {view.user
              ? '修改后自动保存。类别、条目和图表配置会同步到你的账号。'
              : localAccount
                ? '登录后自动同步类别、条目和图表配置；当前配置保存在此浏览器。'
                : '连接同一个 GitHub 账号，即可在 GitHub Pages、本地和云端同步类别与条目。'}
          </p>
          {view.user && view.confirmedAt && (
            <p className="trend-sync-note">最近确认：{new Date(view.confirmedAt).toLocaleTimeString('zh-CN')}</p>
          )}
          {error && (
            <p role="alert" className="trend-field-error">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
