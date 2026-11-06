import { useEffect, useRef, useState } from 'react';
import { Cloud, Github, RefreshCw, X } from 'lucide-react';
import {
  clearAuthorization,
  parseAuthorization,
  readAuthorization,
  saveAuthorization,
  type Authorization,
} from '../trend/authorization';
import { parsePlannerState, type MonthlyPlannerState } from './model';
import { apiOrigin, authorizationStorage, plannerTransport } from './api';
import { useDailyPlanner } from './useDailyPlanner';
import { DailyPanel } from './DailyPanel';
import { PlannerSyncError, PlannerSynchronizer, type PlannerSyncUser, type PlannerSyncView } from './sync';

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
const transportFor = (origin: string, token: string) =>
  plannerTransport(origin, token, '/dashboard', parsePlannerState);

const initialView: PlannerSyncView = {
  user: null,
  status: '连接后自动同步到云端',
  conflict: null,
  connecting: false,
  githubStatus: 'disabled',
  pending: false,
  syncing: false,
  error: null,
  confirmedAt: null,
};

export default function PlannerSync({
  state,
  onApply,
  user,
  today,
  notify,
}: {
  state: MonthlyPlannerState;
  onApply: (state: MonthlyPlannerState, user: PlannerSyncUser | null) => void;
  user: PlannerSyncUser | null;
  today: string;
  notify: (message: string, undo?: () => void) => void;
}) {
  const daily = useDailyPlanner(user);
  const [view, setView] = useState<PlannerSyncView>(initialView);
  const [error, setError] = useState('');
  const [authorizing, setAuthorizing] = useState(false);
  const [localAccount, setLocalAccount] = useState(false);
  const engine = useRef<PlannerSynchronizer | null>(null);
  const mounted = useRef(false);
  const applyRef = useRef(onApply);
  const initial = useRef(state);
  const authorization = useRef<Authorization | null>(null);
  const popupCleanup = useRef<() => void>(() => {});
  const connectGeneration = useRef(0);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const orb = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('dblog-planner-sync-open', show);
    return () => window.removeEventListener('dblog-planner-sync-open', show);
  }, []);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        orb.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !orb.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open]);
  useEffect(() => {
    applyRef.current = onApply;
  }, [onApply]);
  useEffect(() => {
    mounted.current = true;
    const synchronizer = new PlannerSynchronizer(
      initial.current,
      (next, user) => {
        if (mounted.current) applyRef.current(next, user);
      },
      (next) => {
        if (mounted.current) setView(next);
      },
      { getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
    );
    engine.current = synchronizer;
    let origin = '';
    const connectSaved = async () => {
      const saved = authorization.current;
      if (!saved) return;
      await synchronizer.connect(transportFor(origin, saved.token));
    };
    try {
      origin = apiOrigin();
      setLocalAccount(import.meta.env.VITE_DEPLOY_TARGET === 'cloud' && origin === window.location.origin);
      try {
        authorization.current = readAuthorization(authorizationStorage, origin, Date.now());
      } catch (cause) {
        setError((cause as Error).message);
      }
      if (authorization.current) void connectSaved();
      else if (import.meta.env.VITE_DEPLOY_TARGET === 'cloud' && origin === window.location.origin)
        void synchronizer.connect(transportFor(origin, ''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '云端配置无效');
    }
    const tick = () => {
      if (authorization.current && authorization.current.expiresAt <= Date.now()) {
        try {
          clearAuthorization(authorizationStorage, origin);
        } catch {
          /* surfaced on next connection */
        }
        authorization.current = null;
        synchronizer.disconnect();
        setError('授权已到期，请重新连接');
      } else void synchronizer.tick();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') tick();
    }, 15_000);
    window.addEventListener('focus', tick);
    window.addEventListener('online', tick);
    const accountChange = () => {
      connectGeneration.current += 1;
      popupCleanup.current();
      setAuthorizing(false);
      synchronizer.disconnect();
      authorization.current = null;
      try {
        clearAuthorization(authorizationStorage, origin);
      } catch {
        setError('账号授权缓存清理失败，请刷新页面');
        return;
      }
      if (origin === window.location.origin && import.meta.env.VITE_DEPLOY_TARGET === 'cloud')
        void synchronizer.connect(transportFor(origin, ''));
    };
    window.addEventListener('dblog-account-change', accountChange);
    return () => {
      mounted.current = false;
      connectGeneration.current += 1;
      popupCleanup.current();
      synchronizer.stop();
      clearInterval(interval);
      window.removeEventListener('focus', tick);
      window.removeEventListener('online', tick);
      window.removeEventListener('dblog-account-change', accountChange);
    };
  }, []);
  useEffect(() => {
    engine.current?.edit(state);
  }, [state]);

  const connect = async () => {
    try {
      if (import.meta.env.VITE_DEPLOY_TARGET === 'cloud' && apiOrigin() === window.location.origin) {
        window.dispatchEvent(new Event('dblog-account-open'));
        return;
      }
    } catch (cause) {
      setError((cause as Error).message);
      return;
    }
    popupCleanup.current();
    const generation = ++connectGeneration.current;
    let origin: string;
    try {
      origin = apiOrigin();
    } catch (cause) {
      setError((cause as Error).message);
      return;
    }
    const popup = window.open('about:blank', '_blank', 'popup,width=600,height=740');
    if (!popup) {
      setError('登录窗口被拦截，请允许弹出窗口后重试');
      return;
    }
    setAuthorizing(true);
    setError('');
    const stateSecret = secret();
    const verifier = secret();
    const controller = new AbortController();
    try {
      const challenge = await challengeFor(verifier);
      let received = false;
      const cleanup = () => {
        clearInterval(closed);
        clearTimeout(timeout);
        window.removeEventListener('message', receive);
        controller.abort();
        popup.close();
      };
      const fail = (message: string) => {
        cleanup();
        if (mounted.current && generation === connectGeneration.current) {
          setAuthorizing(false);
          setError(message);
        }
      };
      const receive = (event: MessageEvent) => {
        if (
          received ||
          event.origin !== origin ||
          event.source !== popup ||
          event.data?.type !== 'dblog-trend-code' ||
          event.data.state !== stateSecret ||
          !/^[A-Za-z0-9_-]{43}$/.test(event.data.code)
        )
          return;
        received = true;
        clearInterval(closed);
        popup.close();
        void (async () => {
          try {
            const response = await fetch(`${origin}/api/v1/trend/exchange`, {
              method: 'POST',
              credentials: 'omit',
              cache: 'no-store',
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: event.data.code, verifier }),
            });
            if (!response.ok) throw new PlannerSyncError(response.status);
            const data = parseAuthorization(await response.json(), Date.now());
            if (!mounted.current || generation !== connectGeneration.current) return;
            authorization.current = data;
            saveAuthorization(authorizationStorage, origin, data);
            cleanup();
            setAuthorizing(false);
            await engine.current?.connect(transportFor(origin, data.token));
          } catch (cause) {
            fail(cause instanceof Error ? cause.message : '授权失败，请重试');
          }
        })();
      };
      const closed = window.setInterval(() => {
        if (!received && popup.closed) fail('登录窗口已关闭，可重新连接');
      }, 500);
      const timeout = window.setTimeout(() => fail('登录等待超时，请重新连接'), 10 * 60 * 1000);
      popupCleanup.current = cleanup;
      window.addEventListener('message', receive);
      popup.location.href = `${origin}/api/v1/trend/connect?${new URLSearchParams({ origin: window.location.origin, state: stateSecret, challenge })}`;
    } catch (cause) {
      popup.close();
      controller.abort();
      setAuthorizing(false);
      setError(cause instanceof Error ? cause.message : '当前浏览器无法完成授权');
    }
  };
  const githubText =
    view.githubStatus === 'synced'
      ? 'GitHub 已提交'
      : view.githubStatus === 'pending'
        ? 'GitHub 提交排队中'
        : view.githubStatus === 'failed'
          ? 'GitHub 提交失败，后台会重试'
          : '未配置 GitHub 回写';
  const conflict = !!view.conflict || !!daily.view.conflict;
  const failed = error || (!view.user && view.errorStatus === 401 ? null : view.error) || daily.view.error;
  const busy = authorizing || view.connecting || view.syncing || daily.view.connecting || daily.view.syncing;
  const pending = view.pending || daily.view.pending;
  const synced =
    !!view.user &&
    !!view.confirmedAt &&
    !!daily.view.user &&
    !!daily.view.confirmedAt &&
    !pending &&
    !busy &&
    !failed &&
    !conflict;
  const status = conflict
    ? '存在版本冲突'
    : failed
      ? '同步需要重试'
      : busy
        ? '正在同步'
        : pending
          ? '有修改待上传'
          : synced
            ? '已同步到云端'
            : '连接云端同步';
  return (
    <>
      <DailyPanel
        key={user?.id ?? 'guest'}
        daily={daily}
        today={today}
        notify={notify}
        onConnect={() => setOpen(true)}
      />
      <section className="planner-sync-float" aria-label="计划同步">
        <button
          ref={orb}
          className={`planner-sync-orb ${busy ? 'is-busy' : ''} ${failed || conflict ? 'is-error' : ''} ${synced ? 'is-synced' : ''}`}
          aria-label={`云端同步：${status}`}
          title={status}
          aria-expanded={open}
          aria-controls="planner-sync-panel"
          onClick={() => setOpen((value) => !value)}
        >
          {busy ? <RefreshCw /> : <Cloud />}
          <i />
        </button>
        {open && (
          <div
            className="planner-sync-panel"
            id="planner-sync-panel"
            role="region"
            aria-label="云端同步详情"
            tabIndex={-1}
            ref={panel}
          >
            <header>
              <h2>云端同步</h2>
              <button
                className="planner-icon"
                aria-label="关闭同步详情"
                onClick={() => {
                  setOpen(false);
                  orb.current?.focus();
                }}
              >
                <X />
              </button>
            </header>
            <div className="planner-sync-copy">
              <Cloud aria-hidden="true" />
              <div>
                <strong>{view.user ? `${view.user.login}` : '连接你的账号'}</strong>
                <span role="status" aria-live="polite">
                  {authorizing ? '请在登录窗口完成 GitHub 授权' : `月度目标：${view.status}`}
                </span>
              </div>
            </div>
            <div className="planner-sync-actions">
              {view.user ? (
                <button
                  className="planner-button planner-soft"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setError('');
                    void engine.current?.tick();
                    daily.sync();
                  }}
                >
                  <RefreshCw />
                  立即同步
                </button>
              ) : (
                <button
                  className="planner-button planner-primary"
                  type="button"
                  disabled={authorizing || view.connecting}
                  onClick={() => void connect()}
                >
                  {localAccount ? <Cloud /> : <Github />}
                  {authorizing || view.connecting
                    ? '正在连接'
                    : localAccount
                      ? '登录账号并连接'
                      : '使用 GitHub 连接同步'}
                </button>
              )}
            </div>
            <p className="planner-sync-detail">每日遗留：{daily.view.error || daily.view.status}</p>
            {synced && view.confirmedAt && (
              <p className="planner-sync-detail">
                最近确认：
                {new Date(view.confirmedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            <p className={`planner-github-status is-${view.githubStatus}`}>
              <Github aria-hidden="true" />
              {githubText}
            </p>
            {view.conflict && (
              <div className="planner-conflict">
                <p>本地计划与云端版本 {view.conflict.revision} 不同，请选择保留内容。</p>
                <button onClick={() => engine.current?.resolve(true)}>采用云端</button>
                <button onClick={() => engine.current?.resolve(false)}>保留本地并上传</button>
              </div>
            )}
            {daily.view.conflict && (
              <div className="planner-conflict">
                <p>每日遗留与云端版本 {daily.view.conflict.revision} 不同，请选择保留内容。</p>
                <button onClick={() => daily.resolve(true)}>遗留采用云端</button>
                <button onClick={() => daily.resolve(false)}>遗留保留本地并上传</button>
              </div>
            )}
            {error && (
              <p role="alert" className="planner-error">
                {error}
              </p>
            )}
            {view.user && (
              <button
                className="planner-sync-disconnect"
                onClick={() => {
                  connectGeneration.current += 1;
                  popupCleanup.current();
                  authorization.current = null;
                  try {
                    clearAuthorization(authorizationStorage, apiOrigin());
                  } catch {
                    setError('授权缓存清理失败');
                  }
                  engine.current?.disconnect();
                }}
              >
                断开计划同步
              </button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
