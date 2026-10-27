import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import userEvent from '@testing-library/user-event';
import { hasOpenOverlay } from '../hooks/useModalOverlay';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CloudAccount from './CloudAccount';
import { cloudRequest, pageEvent } from './api';

const user = { id: 'u1', login: 'alice', name: 'Alice' };
let request: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const path = String(input);
    if (path.endsWith('/me')) return new Response(JSON.stringify({ user }));
    if (path.endsWith('/logout')) return new Response(null, { status: 204 });
    if (path.endsWith('/me/events'))
      return new Response(
        JSON.stringify({
          events: [{ eventId: 'e1', name: 'page_view', path: '/Blog/post/a', occurredAt: '2026-01-01T00:00:00Z' }],
        }),
      );
    return new Response(JSON.stringify({ accepted: 1 }));
  });
  vi.stubGlobal('fetch', request);
  vi.stubEnv('BASE_URL', '/Blog/');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const mount = () =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={['/post/a?secret=hidden']}>
        <CloudAccount />
        <Link to="/post/b">下一篇</Link>
      </MemoryRouter>
    </StrictMode>,
  );
const openAccount = () => fireEvent.click(screen.getByRole('button', { name: /打开云端账号/ }));
const eventRequests = () => request.mock.calls.filter(([path]) => String(path).endsWith('/events/batch'));

describe('cloud account', () => {
  it('renders only a portaled floating ball and leaves no account placeholder in the page', async () => {
    const view = mount();
    const ball = await screen.findByRole('button', { name: '打开云端账号：Alice' });
    expect(ball).toHaveClass('fixed', '!rounded-full');
    expect(view.container).not.toContainElement(ball);
    expect(view.container.querySelector('aside, details')).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/已登录：alice/)).not.toBeInTheDocument();
    openAccount();
    expect(screen.getByRole('dialog', { name: '云端账号' })).toBeInTheDocument();
    expect(ball).toHaveAttribute('aria-expanded', 'true');
    expect(ball).toHaveAttribute('aria-controls', screen.getByRole('dialog').id);
  });
  it('preserves the same-origin GitHub login link behind the ball', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ user: null })));
    mount();
    await screen.findByRole('button', { name: '打开云端账号：账号登录' });
    expect(screen.queryByText('使用 GitHub 登录')).not.toBeInTheDocument();
    openAccount();
    expect(screen.getByText('使用 GitHub 登录')).toHaveAttribute('href', '/api/v1/auth/github/start');
  });
  it('supports focus trapping, Escape and backdrop closing, and restores focus and scrolling', async () => {
    const keyboard = userEvent.setup();
    mount();
    const ball = await screen.findByRole('button', { name: '打开云端账号：Alice' });
    await keyboard.click(ball);
    const closeButton = screen.getByRole('button', { name: '关闭云端账号' });
    await waitFor(() => expect(closeButton).toHaveFocus());
    expect(hasOpenOverlay()).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    await keyboard.tab({ shift: true });
    expect(screen.getByRole('button', { name: '退出登录' })).toHaveFocus();
    await keyboard.tab();
    expect(closeButton).toHaveFocus();
    await keyboard.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hasOpenOverlay()).toBe(false);
    expect(document.body.style.overflow).not.toBe('hidden');
    await waitFor(() => expect(ball).toHaveFocus());
    await keyboard.click(ball);
    const backdrop = screen.getByRole('dialog').previousElementSibling;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    openAccount();
    fireEvent.click(screen.getByRole('button', { name: '关闭云端账号' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('keeps SSR empty and does not request account data before mounting', () => {
    const html = renderToString(
      <MemoryRouter>
        <CloudAccount />
      </MemoryRouter>,
    );
    expect(html).toBe('');
    expect(request).not.toHaveBeenCalled();
  });
  it('does not collect page events until explicitly enabled and excludes search parameters', async () => {
    mount();
    openAccount();
    expect(await screen.findByText(/已登录：alice/)).toBeInTheDocument();
    expect(eventRequests()).toHaveLength(0);
    fireEvent.click(screen.getByLabelText(/本次使用期间记录/));
    await waitFor(() => expect(eventRequests()).toHaveLength(1));
    const payload = JSON.parse(String(eventRequests()[0][1]?.body));
    expect(payload.events[0].path).toBe('/Blog/post/a');
    expect(JSON.stringify(payload)).not.toContain('secret');
    expect(payload.events[0]).not.toHaveProperty('user_id');
    fireEvent.click(screen.getByText('下一篇'));
    await waitFor(() => expect(eventRequests()).toHaveLength(2));
    fireEvent.click(screen.getByLabelText(/本次使用期间记录/));
    fireEvent.click(screen.getByText('下一篇'));
    expect(eventRequests()).toHaveLength(2);
  });
  it('displays only records returned by the account endpoint and clears them on logout', async () => {
    mount();
    openAccount();
    await screen.findByText(/已登录：alice/);
    fireEvent.click(screen.getByText('查看最近记录'));
    expect(await screen.findByText(/访问 · \/Blog\/post\/a/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('退出登录'));
    expect(await screen.findByText('使用 GitHub 登录')).toHaveAttribute('href', '/api/v1/auth/github/start');
    expect(screen.queryByLabelText('最近行为记录')).not.toBeInTheDocument();
    const logout = request.mock.calls.find(([path]) => String(path).endsWith('/logout'));
    expect(logout?.[1]?.method).toBe('POST');
  });
  it('reports account service failure without blocking the blog', async () => {
    request.mockRejectedValue(new Error('offline'));
    mount();
    openAccount();
    expect(await screen.findByText(/无法连接账号服务/)).toBeInTheDocument();
    expect(screen.getByText('下一篇')).toBeInTheDocument();
  });
  it('retries the same event ID and reports persistent sync failure', async () => {
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (path, init) =>
      String(path).endsWith('/events/batch') ? new Response('', { status: 503 }) : original(path, init),
    );
    mount();
    openAccount();
    await screen.findByText(/已登录：alice/);
    fireEvent.click(screen.getByLabelText(/本次使用期间记录/));
    expect(await screen.findByText(/本次访问记录同步失败/)).toBeInTheDocument();
    expect(eventRequests()).toHaveLength(2);
    expect(eventRequests()[0][1]?.body).toBe(eventRequests()[1][1]?.body);
  });
  it('aborts account reads when unmounted', () => {
    request.mockImplementation(() => new Promise(() => {}));
    const view = mount();
    const signal = request.mock.calls.at(-1)?.[1]?.signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});

describe('API transport', () => {
  it('uses same-origin credentials and never caches private responses', async () => {
    await cloudRequest('/me');
    expect(request.mock.calls[0]).toEqual([
      '/api/v1/me',
      expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
    ]);
  });
  it('rejects unauthorized and invalid JSON responses', async () => {
    request.mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(cloudRequest('/me')).rejects.toThrow('登录已失效');
    request.mockResolvedValueOnce(new Response('invalid json'));
    await expect(cloudRequest('/me')).rejects.toThrow();
  });
  it('creates unique event IDs', () => {
    expect(pageEvent('/Blog/').eventId).not.toBe(pageEvent('/Blog/').eventId);
  });
});
