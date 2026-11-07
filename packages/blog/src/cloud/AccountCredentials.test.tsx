import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountCredentials, GitHubBinding } from './AccountCredentials';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const credentials = () => {
  fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'test-user' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test-password-strong' } });
};
describe('account credentials', () => {
  it.each([
    [403, 'origin_mismatch', '当前访问地址与服务端配置不一致，请使用配置的站点地址'],
    [429, 'rate_limited', '请求过于频繁，请等待 60 秒后重试'],
  ])('distinguishes login failure %s without claiming success', async (status, code, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ code, error: '请求无效或过于频繁' }), { status })),
    );
    const onUser = vi.fn();
    render(<AccountCredentials user={null} onUser={onUser} />);
    credentials();
    fireEvent.click(screen.getByRole('button', { name: '使用账号密码登录' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onUser).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '使用账号密码登录' })).toBeEnabled();
  });

  it('logs in with same-origin cookies and clears the password after success', async () => {
    const user = { id: 'u1', login: 'test-user', name: 'Test', username: 'test-user', githubBound: false };
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user })));
    vi.stubGlobal('fetch', request);
    const onUser = vi.fn();
    render(<AccountCredentials user={null} onUser={onUser} />);
    credentials();
    fireEvent.click(screen.getByRole('button', { name: '使用账号密码登录' }));
    await waitFor(() => expect(onUser).toHaveBeenCalledWith(user));
    expect(request).toHaveBeenCalledWith(
      '/api/v1/auth/account/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ username: 'test-user', password: 'test-password-strong' }),
      }),
    );
    expect(screen.getByLabelText('密码')).toHaveValue('');
  });
  it('registers and does not claim success when the service rejects it', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: '账号已存在或已绑定，不能重复绑定或替换' }), { status: 409 }),
      );
    vi.stubGlobal('fetch', request);
    const onUser = vi.fn();
    render(<AccountCredentials user={null} onUser={onUser} />);
    fireEvent.click(screen.getByText('没有账号，注册账号'));
    credentials();
    fireEvent.click(screen.getByRole('button', { name: '注册并登录' }));
    expect(await screen.findByText('账号已存在或已绑定，不能重复绑定或替换')).toBeInTheDocument();
    expect(onUser).not.toHaveBeenCalled();
    expect(request.mock.calls[0][0]).toBe('/api/v1/auth/account/register');
  });
  it('shows credential attachment only for GitHub users without a system account', () => {
    const view = render(
      <AccountCredentials user={{ id: 'u1', login: 'alice', name: 'Alice', githubBound: false }} onUser={vi.fn()} />,
    );
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('密码')).not.toBeInTheDocument();
    view.rerender(
      <AccountCredentials user={{ id: 'u1', login: 'alice', name: 'Alice', githubBound: true }} onUser={vi.fn()} />,
    );
    expect(screen.getByText('绑定系统账号')).toBeInTheDocument();
    view.rerender(
      <AccountCredentials
        user={{ id: 'u1', login: 'alice', name: 'Alice', githubBound: true, username: 'test-user' }}
        onUser={vi.fn()}
      />,
    );
    expect(screen.getByText('系统账号：test-user')).toBeInTheDocument();
    expect(screen.queryByLabelText('密码')).not.toBeInTheDocument();
  });
  it('cancels pending credentials on unmount', () => {
    const request = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', request);
    const view = render(<AccountCredentials user={null} onUser={vi.fn()} />);
    credentials();
    fireEvent.click(screen.getByRole('button', { name: '使用账号密码登录' }));
    const signal = request.mock.calls[0][1].signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
  it('rejects a non-GitHub authorization address', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://evil.example/login' })));
    vi.stubGlobal('fetch', request);
    const onError = vi.fn();
    render(<GitHubBinding onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: '绑定 GitHub' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('授权地址无效'));
    expect(request.mock.calls[0][0]).toBe('/api/v1/auth/github/bind');
    expect(request.mock.calls[0][1].method).toBe('POST');
  });
});
