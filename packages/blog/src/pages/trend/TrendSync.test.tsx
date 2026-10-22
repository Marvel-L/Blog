import { webcrypto } from 'node:crypto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrendSync from './TrendSync';
import { defaultState } from './model';

const user = { id: 'alice', login: 'alice', name: 'Alice' };
const api = 'https://api.example.com';
function mockPopup() {
  const popup = { location: { href: '' }, closed: false, close: vi.fn() } as unknown as Window;
  vi.spyOn(window, 'open').mockReturnValue(popup);
  return popup;
}
function message(popup: Window, data: unknown, origin = api) {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source: popup }));
}
describe('Trend 同步授权界面', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_DEPLOY_TARGET', 'pages');
    vi.stubEnv('VITE_TREND_API_ORIGIN', api);
    vi.stubGlobal('crypto', webcrypto);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('Pages 未连接不请求 API，弹窗被拦截给出可操作提示', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(window, 'open').mockReturnValue(null);
    render(<TrendSync state={defaultState()} onApply={vi.fn()} />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '使用 GitHub 连接同步' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('登录窗口被拦截');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cloud 同源自动使用会话加载，退出账号后取消同步并恢复匿名数据', async () => {
    vi.stubEnv('VITE_DEPLOY_TARGET', 'cloud');
    vi.stubEnv('VITE_TREND_API_ORIGIN', window.location.origin);
    const fetch = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(JSON.stringify({ user, dashboard: { state: defaultState(), revision: 1, updatedAt: null } }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const apply = vi.fn();
    render(<TrendSync state={defaultState()} onApply={apply} />);
    await screen.findByText('alice · 云端同步');
    expect(fetch.mock.calls[0][0]).toBe(`${window.location.origin}/api/v1/trend/dashboard`);
    const options = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(options.credentials).toBe('same-origin');
    expect(options.headers).toEqual({});
    act(() => window.dispatchEvent(new Event('dblog-account-change')));
    expect(screen.getByRole('button', { name: '使用 GitHub 连接同步' })).toBeEnabled();
    expect(apply).toHaveBeenLastCalledWith(defaultState(), null);
    const calls = fetch.mock.calls.length;
    fireEvent(window, new Event('focus'));
    expect(fetch).toHaveBeenCalledTimes(calls);
  });

  it('仅接收匹配 origin/source/state 的授权消息，PKCE 交换后加载云端且不持久化 token', async () => {
    const popup = mockPopup();
    const token = 'A'.repeat(43);
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/exchange')) return new Response(JSON.stringify({ token }), { status: 200 });
      return new Response(
        JSON.stringify({ user, dashboard: { state: defaultState(), revision: 1, updatedAt: null } }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetch);
    const apply = vi.fn();
    render(<TrendSync state={defaultState()} onApply={apply} />);
    fireEvent.click(screen.getByRole('button', { name: '使用 GitHub 连接同步' }));
    await waitFor(() => expect(popup.location.href).toContain('/api/v1/trend/connect?'));
    const url = new URL(popup.location.href);
    const data = { type: 'dblog-trend-code', code: 'B'.repeat(43), state: url.searchParams.get('state') };
    expect(url.searchParams.get('challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('origin')).toBe(window.location.origin);
    act(() => {
      message(popup, data, 'https://evil.example');
      message(null as unknown as Window, data);
      message(popup, { ...data, state: 'wrong' });
    });
    expect(fetch).not.toHaveBeenCalled();
    act(() => message(popup, data));
    await waitFor(() => expect(screen.getByText('alice · 云端同步')).toBeInTheDocument());
    expect(fetch.mock.calls[0][0]).toBe(`${api}/api/v1/trend/exchange`);
    const exchange = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(exchange.body)).verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(exchange.credentials).toBe('omit');
    const loaded = (fetch.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect(loaded.headers).toEqual({ Authorization: `Bearer ${token}` });
    expect(apply).toHaveBeenCalledWith(defaultState(), user);
    expect(Object.values(localStorage).join('')).not.toContain(token);
    fireEvent.click(screen.getByRole('button', { name: '断开同步' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '使用 GitHub 连接同步' })).toBeEnabled());
    expect(apply).toHaveBeenLastCalledWith(defaultState(), null);
  });

  it('取消和卸载都清理弹窗监听器，迟到的消息不触发交换', async () => {
    const popup = mockPopup();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const view = render(<TrendSync state={defaultState()} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '使用 GitHub 连接同步' }));
    await waitFor(() => expect(popup.location.href).toContain('/connect?'));
    const data = {
      type: 'dblog-trend-code',
      code: 'B'.repeat(43),
      state: new URL(popup.location.href).searchParams.get('state'),
    };
    fireEvent.click(screen.getByRole('button', { name: '取消连接' }));
    act(() => message(popup, data));
    expect(fetch).not.toHaveBeenCalled();
    view.unmount();
    act(() => message(popup, data));
    expect(fetch).not.toHaveBeenCalled();
    expect(popup.close).toHaveBeenCalled();
  });

  it('等待弹窗授权时退出账号会关闭弹窗，迟到授权消息不恢复同步', async () => {
    const popup = mockPopup();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(<TrendSync state={defaultState()} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '使用 GitHub 连接同步' }));
    await waitFor(() => expect(popup.location.href).toContain('/connect?'));
    const data = {
      type: 'dblog-trend-code',
      code: 'B'.repeat(43),
      state: new URL(popup.location.href).searchParams.get('state'),
    };
    act(() => window.dispatchEvent(new Event('dblog-account-change')));
    expect(popup.close).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '使用 GitHub 连接同步' })).toBeEnabled();
    act(() => message(popup, data));
    expect(fetch).not.toHaveBeenCalled();
  });
});
