import { webcrypto } from 'node:crypto';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrendSync from './TrendSync';
import { defaultState } from './model';
import { authorizationKey } from './authorization';
import { draftKey } from './sync';

const user = { id: 'alice', login: 'alice', name: 'Alice' };
const api = 'https://api.example.com';
const token = 'A'.repeat(43);
const dashboard = (state = defaultState(), revision = 1) =>
  new Response(JSON.stringify({ user, dashboard: { state, revision, updatedAt: null } }), { status: 200 });
function cacheAuthorization(expiresAt = Date.now() + 3600000, value = token) {
  sessionStorage.setItem(authorizationKey(api), JSON.stringify({ token: value, expiresAt }));
}
async function authorize(popup: Window) {
  fireEvent.click(screen.getByRole('button', { name: '使用 GitHub 连接同步' }));
  await waitFor(() => expect(popup.location.href).toContain('/connect?'));
  act(() =>
    message(popup, {
      type: 'dblog-trend-code',
      code: 'B'.repeat(43),
      state: new URL(popup.location.href).searchParams.get('state'),
    }),
  );
}
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
    sessionStorage.clear();
    vi.stubEnv('VITE_DEPLOY_TARGET', 'pages');
    vi.stubEnv('VITE_TREND_API_ORIGIN', api);
    vi.stubGlobal('crypto', webcrypto);
  });
  afterEach(() => {
    vi.useRealTimers();
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

  it('仅接收匹配 origin/source/state 的授权消息，PKCE 交换后授权只保存在标签页', async () => {
    const popup = mockPopup();
    const token = 'A'.repeat(43);
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/exchange')) return new Response(JSON.stringify({ token, expiresIn: 3600 }), { status: 200 });
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
    expect(JSON.parse(sessionStorage.getItem(authorizationKey(api))!)).toEqual({
      token,
      expiresAt: expect.any(Number),
    });
    fireEvent.click(screen.getByRole('button', { name: '断开同步' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '使用 GitHub 连接同步' })).toBeEnabled());
    expect(apply).toHaveBeenLastCalledWith(defaultState(), null);
    expect(sessionStorage.getItem(authorizationKey(api))).toBeNull();
  });

  it('授权后卸载并重新挂载自动恢复账号和草稿，继续上传编辑，不再打开弹窗', async () => {
    const popup = mockPopup();
    let remote = defaultState();
    let revision = 1;
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/exchange')) return new Response(JSON.stringify({ token, expiresIn: 3600 }), { status: 200 });
      if (options.method === 'PUT') {
        remote = JSON.parse(String(options.body)).state;
        revision += 1;
      }
      return dashboard(remote, revision);
    });
    vi.stubGlobal('fetch', fetch);
    const first = render(<TrendSync state={defaultState()} onApply={vi.fn()} />);
    await authorize(popup);
    await screen.findByText('alice · 云端同步');
    const saved = sessionStorage.getItem(authorizationKey(api));
    first.unmount();
    expect(sessionStorage.getItem(authorizationKey(api))).toBe(saved);
    const apply = vi.fn();
    const refreshed = render(<TrendSync state={defaultState()} onApply={apply} />);
    await screen.findByText('alice · 云端同步');
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(defaultState(), user);
    const next = defaultState();
    next.categories[0].name = '刷新后的编辑';
    refreshed.rerender(<TrendSync state={next} onApply={apply} />);
    fireEvent.click(screen.getByRole('button', { name: '立即同步' }));
    await waitFor(() => expect(remote.categories[0].name).toBe('刷新后的编辑'));
    expect(fetch.mock.calls.at(-1)?.[1].headers).toEqual({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(localStorage.getItem(draftKey(user.id))!).state.categories[0].name).toBe('刷新后的编辑');
  });

  it('API 地址不同不复用缓存授权，也不自动打开登录窗口', () => {
    cacheAuthorization();
    vi.stubEnv('VITE_TREND_API_ORIGIN', 'https://other.example.com');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    mockPopup();
    render(<TrendSync state={defaultState()} onApply={vi.fn()} />);
    expect(fetch).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(authorizationKey(api))).not.toBeNull();
  });

  it.each(['expired', 'broken'])('%s 缓存不请求 API，删除记录并要求重新连接', async (kind) => {
    cacheAuthorization(Date.now() - 1);
    if (kind === 'broken') sessionStorage.setItem(authorizationKey(api), '{invalid');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(<TrendSync state={defaultState()} onApply={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('请重新连接');
    expect(fetch).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(authorizationKey(api))).toBeNull();
  });

  it('服务端拒绝恢复授权后删除缓存，聚焦和网络恢复不循环请求', async () => {
    cacheAuthorization();
    const fetch = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    render(<TrendSync state={defaultState()} onApply={vi.fn()} />);
    await screen.findByText('授权已失效，请重新连接');
    expect(sessionStorage.getItem(authorizationKey(api))).toBeNull();
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['online', 'focus'])('恢复网络失败保留授权与账号草稿，%s 自动重连并上传离线草稿', async (event) => {
    cacheAuthorization();
    const base = defaultState();
    const offline = defaultState();
    offline.categories[0].name = '离线草稿';
    localStorage.setItem(
      draftKey(user.id),
      JSON.stringify({ state: offline, base: { state: base, revision: 1, updatedAt: null }, pending: null }),
    );
    const fetch = vi.fn(async (_url: string, options: RequestInit) =>
      dashboard(options.method === 'PUT' ? offline : base, options.method === 'PUT' ? 2 : 1),
    );
    fetch.mockRejectedValueOnce(new TypeError('网络不可用'));
    vi.stubGlobal('fetch', fetch);
    const apply = vi.fn();
    render(<TrendSync state={base} onApply={apply} />);
    await screen.findByText('网络不可用');
    expect(sessionStorage.getItem(authorizationKey(api))).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(draftKey(user.id))!).state).toEqual(offline);
    fireEvent(window, new Event(event));
    await screen.findByText('alice · 云端同步');
    expect(apply).toHaveBeenCalledWith(offline, user);
    fireEvent.click(screen.getByRole('button', { name: '立即同步' }));
    await screen.findByText('已同步到云端');
    expect(fetch.mock.calls.at(-1)?.[1].method).toBe('PUT');
  });

  it('恢复暂时失败时，每 15 秒轮询可自动重连', async () => {
    vi.useFakeTimers();
    cacheAuthorization();
    const fetch = vi.fn(async () => dashboard());
    fetch.mockRejectedValueOnce(new Error('暂时离线'));
    vi.stubGlobal('fetch', fetch);
    await act(async () => {
      render(<TrendSync state={defaultState()} onApply={vi.fn()} />);
    });
    expect(screen.getByText('暂时离线')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(screen.getByText('alice · 云端同步')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('已连接授权到期后停止同步、删除记录并保留账号草稿', async () => {
    const now = Date.now();
    cacheAuthorization(now + 1000);
    const fetch = vi.fn(async () => dashboard());
    vi.stubGlobal('fetch', fetch);
    render(<TrendSync state={defaultState()} onApply={vi.fn()} />);
    await screen.findByText('alice · 云端同步');
    vi.spyOn(Date, 'now').mockReturnValue(now + 1000);
    fireEvent.click(screen.getByRole('button', { name: '立即同步' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('授权已到期');
    expect(sessionStorage.getItem(authorizationKey(api))).toBeNull();
    expect(localStorage.getItem(draftKey(user.id))).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('alice · 云端同步')).not.toBeInTheDocument();
  });

  it('恢复尚未返回时退出账号，迟到响应不能恢复身份或缓存', async () => {
    cacheAuthorization();
    let finish!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)));
    vi.stubGlobal('fetch', fetch);
    const apply = vi.fn();
    render(<TrendSync state={defaultState()} onApply={apply} />);
    act(() => window.dispatchEvent(new Event('dblog-account-change')));
    await act(async () => finish(dashboard()));
    expect(apply).toHaveBeenLastCalledWith(defaultState(), null);
    expect(apply).not.toHaveBeenCalledWith(defaultState(), user);
    expect(sessionStorage.getItem(authorizationKey(api))).toBeNull();
    fireEvent(window, new Event('focus'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('旧请求迟到的 401 不清除新授权，迟到撤销失败不覆盖新连接', async () => {
    cacheAuthorization();
    let rejectOld!: (response: Response) => void;
    let revokeOld!: (response: Response) => void;
    let loads = 0;
    const nextToken = 'C'.repeat(43);
    const fetch = vi.fn((url: string, options: RequestInit) => {
      if (options.method === 'DELETE') return new Promise<Response>((resolve) => (revokeOld = resolve));
      if (url.endsWith('/exchange'))
        return Promise.resolve(new Response(JSON.stringify({ token: nextToken, expiresIn: 3600 })));
      if (++loads === 2) return new Promise<Response>((resolve) => (rejectOld = resolve));
      return Promise.resolve(dashboard());
    });
    vi.stubGlobal('fetch', fetch);
    const popup = mockPopup();
    render(<TrendSync state={defaultState()} onApply={vi.fn()} />);
    await screen.findByText('alice · 云端同步');
    fireEvent.click(screen.getByRole('button', { name: '立即同步' }));
    fireEvent.click(screen.getByRole('button', { name: '断开同步' }));
    await authorize(popup);
    await screen.findByText('alice · 云端同步');
    await act(async () => {
      rejectOld(new Response(null, { status: 401 }));
      revokeOld(new Response(null, { status: 503 }));
    });
    expect(JSON.parse(sessionStorage.getItem(authorizationKey(api))!).token).toBe(nextToken);
    expect(screen.getByText('alice · 云端同步')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('标签页授权保存失败仍能本次同步，但明确提示刷新需要重新连接', async () => {
    const popup = mockPopup();
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/exchange') ? new Response(JSON.stringify({ token, expiresIn: 3600 })) : dashboard(),
    );
    vi.stubGlobal('fetch', fetch);
    const saved = sessionStorage;
    vi.spyOn(window, 'sessionStorage', 'get').mockReturnValue({
      getItem: saved.getItem.bind(saved),
      removeItem: saved.removeItem.bind(saved),
      setItem: () => {
        throw new Error('quota');
      },
    } as unknown as Storage);
    render(<TrendSync state={defaultState()} onApply={vi.fn()} />);
    await authorize(popup);
    await screen.findByText('alice · 云端同步');
    expect(screen.getByRole('alert')).toHaveTextContent('刷新后需重新连接');
    expect(saved.getItem(authorizationKey(api))).toBeNull();
  });

  it('获取 sessionStorage 失败时显示错误，读取失败不请求云端', async () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('denied');
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(<TrendSync state={defaultState()} onApply={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取标签页授权');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('清除授权失败仍停止本次同步，并显示存储错误', async () => {
    cacheAuthorization();
    const saved = sessionStorage;
    vi.spyOn(window, 'sessionStorage', 'get').mockReturnValue({
      getItem: saved.getItem.bind(saved),
      setItem: saved.setItem.bind(saved),
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage);
    const fetch = vi.fn(async (_url: string, options: RequestInit) =>
      options.method === 'DELETE' ? new Response(null, { status: 204 }) : dashboard(),
    );
    vi.stubGlobal('fetch', fetch);
    render(<TrendSync state={defaultState()} onApply={vi.fn()} />);
    await screen.findByText('alice · 云端同步');
    fireEvent.click(screen.getByRole('button', { name: '断开同步' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('无法清除标签页授权');
    fireEvent(window, new Event('focus'));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('alice · 云端同步')).not.toBeInTheDocument();
  });

  it('StrictMode 清理旧请求不删除缓存，只有有效挂载应用账号状态', async () => {
    cacheAuthorization();
    const signals: AbortSignal[] = [];
    const fetch = vi.fn(async (_url: string, options: RequestInit) => {
      signals.push(options.signal as AbortSignal);
      return dashboard();
    });
    vi.stubGlobal('fetch', fetch);
    const apply = vi.fn();
    const rendered = render(
      <StrictMode>
        <TrendSync state={defaultState()} onApply={apply} />
      </StrictMode>,
    );
    await screen.findByText('alice · 云端同步');
    expect(signals[0].aborted).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(defaultState(), user);
    rendered.unmount();
    expect(sessionStorage.getItem(authorizationKey(api))).not.toBeNull();
  });

  it('SSR 首帧不读取时钟和浏览器授权，也不显示未经 API 验证的账号', () => {
    cacheAuthorization();
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('render clock');
    });
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('render storage');
    });
    const html = renderToString(<TrendSync state={defaultState()} onApply={vi.fn()} />);
    expect(html).toContain('连接后自动同步到云端');
    expect(html).not.toContain('alice');
    expect(html).not.toContain(token);
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
