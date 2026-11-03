import { useEffect, useId, useRef, useState } from 'react';
import { cloudRequest, type CloudUser } from './api';

export function AccountCredentials({ user, onUser }: { user: CloudUser | null; onUser: (user: CloudUser) => void }) {
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const id = useId();
  useEffect(() => () => request.current?.abort(), []);
  const githubBound = user?.githubBound === true;
  if (user?.username) return <p>系统账号：{user.username}</p>;
  if (user && !githubBound) return null;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true);
        setError('');
        const endpoint = user ? '/auth/account/bind' : register ? '/auth/account/register' : '/auth/account/login';
        void cloudRequest<{ user: CloudUser }>(endpoint, {
          method: 'POST',
          body: JSON.stringify({ username, password }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        })
          .then((data) => {
            if (controller.signal.aborted) return;
            setPassword('');
            onUser(data.user);
            window.dispatchEvent(new CustomEvent('dblog-account-change', { detail: { user: data.user } }));
          })
          .catch((cause) => {
            if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '账号操作失败，请重试');
          })
          .finally(() => {
            if (!controller.signal.aborted) setBusy(false);
            if (request.current === controller) request.current = null;
          });
      }}
    >
      <h3 className="font-medium">{user ? '绑定系统账号' : register ? '注册系统账号' : '账号密码登录'}</h3>
      {user && <p className="text-xs opacity-70">可创建新账号，或输入已有未绑定账号的密码验证后绑定。</p>}
      <label className="block" htmlFor={`${id}-username`}>
        账号
      </label>
      <input
        id={`${id}-username`}
        name="username"
        autoComplete="username"
        required
        minLength={3}
        maxLength={32}
        pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}"
        value={username}
        disabled={busy}
        onChange={(event) => setUsername(event.target.value)}
        className="frosted-control w-full px-3 py-2"
      />
      <label className="block" htmlFor={`${id}-password`}>
        密码
      </label>
      <input
        id={`${id}-password`}
        name="password"
        type="password"
        autoComplete={!user && register ? 'new-password' : 'current-password'}
        required
        minLength={8}
        maxLength={128}
        value={password}
        disabled={busy}
        onChange={(event) => setPassword(event.target.value)}
        className="frosted-control w-full px-3 py-2"
      />
      <button type="submit" disabled={busy} className="frosted-control w-full px-4 py-3 disabled:opacity-50">
        {busy ? '处理中…' : user ? '验证并绑定' : register ? '注册并登录' : '使用账号密码登录'}
      </button>
      {!user && (
        <button
          type="button"
          disabled={busy}
          className="underline"
          onClick={() => {
            setRegister(!register);
            setPassword('');
            setError('');
          }}
        >
          {register ? '已有账号，去登录' : '没有账号，注册账号'}
        </button>
      )}
      <p role="status" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
export function GitHubBinding({ onError }: { onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  return (
    <button
      type="button"
      disabled={busy}
      className="frosted-control w-full px-4 py-3 disabled:opacity-50"
      onClick={() => {
        if (request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true);
        void cloudRequest<{ url: string }>('/auth/github/bind', {
          method: 'POST',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        })
          .then((data) => {
            if (controller.signal.aborted) return;
            const destination = new URL(data.url);
            if (destination.origin !== 'https://github.com' || destination.pathname !== '/login/oauth/authorize')
              throw new Error('授权地址无效');
            window.location.assign(destination.href);
          })
          .catch((cause) => {
            if (!controller.signal.aborted) onError(cause instanceof Error ? cause.message : '绑定发起失败，请重试');
          })
          .finally(() => {
            if (!controller.signal.aborted) setBusy(false);
            if (request.current === controller) request.current = null;
          });
      }}
    >
      {busy ? '正在发起授权…' : '绑定 GitHub'}
    </button>
  );
}
