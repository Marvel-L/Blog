import { useEffect, useRef, useState } from 'react';
import { Cloud, Github, RefreshCw } from 'lucide-react';
import {
  clearAuthorization,
  parseAuthorization,
  readAuthorization,
  saveAuthorization,
  type Authorization,
} from '../trend/authorization';
import type { MonthlyPlannerState } from './model';
import {
  PlannerSyncError,
  PlannerSynchronizer,
  parsePlannerResponse,
  type PlannerMutation,
  type PlannerSyncUser,
  type PlannerSyncView,
  type PlannerTransport,
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
const apiOrigin = () => {
  const configured = import.meta.env.VITE_PLANNER_API_ORIGIN as string | undefined;
  const origin =
    configured || (import.meta.env.VITE_DEPLOY_TARGET === 'cloud' ? window.location.origin : 'https://43.138.216.53');
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
  )
    throw new Error('月度计划云端地址配置无效');
  return origin;
};
const request = async (
  origin: string,
  token: string,
  path: string,
  signal: AbortSignal,
  mutation?: PlannerMutation,
) => {
  const response = await fetch(`${origin}/api/v1/planner${path}`, {
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
  if (response.status === 409) throw new PlannerSyncError(409, parsePlannerResponse(await response.json()));
  if (!response.ok) throw new PlannerSyncError(response.status);
  return parsePlannerResponse(await response.json());
};
const transportFor = (origin: string, token: string): PlannerTransport => ({
  load: (signal) => request(origin, token, '/dashboard', signal),
  save: (mutation, signal) => request(origin, token, '/dashboard', signal, mutation),
});
const authorizationStorage = {
  getItem: (key: string) => sessionStorage.getItem(key),
  setItem: (key: string, value: string) => sessionStorage.setItem(key, value),
  removeItem: (key: string) => sessionStorage.removeItem(key),
};

const initialView: PlannerSyncView = {
  user: null,
  status: '连接后自动同步到云端',
  conflict: null,
  connecting: false,
  githubStatus: 'disabled',
};

export default function PlannerSync({
  state,
  onApply,
}: {
  state: MonthlyPlannerState;
  onApply: (state: MonthlyPlannerState, user: PlannerSyncUser | null) => void;
}) {
  const [view, setView] = useState<PlannerSyncView>(initialView);
  const [error, setError] = useState('');
  const [authorizing, setAuthorizing] = useState(false);
  const engine = useRef<PlannerSynchronizer | null>(null);
  const mounted = useRef(false);
  const applyRef = useRef(onApply);
  const initial = useRef(state);
  const authorization = useRef<Authorization | null>(null);
  const popupCleanup = useRef<() => void>(() => {});
  const connectGeneration = useRef(0);
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
    return () => {
      mounted.current = false;
      connectGeneration.current += 1;
      popupCleanup.current();
      synchronizer.stop();
      clearInterval(interval);
      window.removeEventListener('focus', tick);
      window.removeEventListener('online', tick);
    };
  }, []);
  useEffect(() => {
    engine.current?.edit(state);
  }, [state]);

  const connect = async () => {
    popupCleanup.current();
    const generation = ++connectGeneration.current;
    const origin = apiOrigin();
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
  return (
    <section className="planner-sync" aria-label="月度计划同步">
      <div className="planner-sync-copy">
        <Cloud aria-hidden="true" />
        <div>
          <strong>{view.user ? `${view.user.login} · 云端同步` : '云端同步'}</strong>
          <span role="status" aria-live="polite">
            {authorizing ? '请在登录窗口完成 GitHub 授权' : view.status}
          </span>
        </div>
      </div>
      <div className="planner-sync-actions">
        {view.user ? (
          <button type="button" onClick={() => void engine.current?.tick()}>
            <RefreshCw />
            立即同步
          </button>
        ) : (
          <button type="button" disabled={authorizing || view.connecting} onClick={() => void connect()}>
            <Github />
            {authorizing || view.connecting ? '正在连接' : '使用 GitHub 连接同步'}
          </button>
        )}
      </div>
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
      {error && (
        <p role="alert" className="planner-error">
          {error}
        </p>
      )}
    </section>
  );
}
