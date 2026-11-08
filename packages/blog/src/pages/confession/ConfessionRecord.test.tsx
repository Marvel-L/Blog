import { act, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ConfessionDetail } from '../Confession';
import { emptyConfession } from './model';
const requests = vi.hoisted(() => {
  vi.stubEnv('VITE_DEPLOY_TARGET', 'cloud');
  return { fetch: vi.fn() };
});
vi.mock('@/cloud/api', async (original) => ({
  ...(await original<typeof import('@/cloud/api')>()),
  cloudRequest: requests.fetch,
}));
const id = '20000000-0000-4000-8000-000000000001';
const archive = emptyConfession();
archive.entries.push({
  id,
  categoryId: archive.categories[1].id,
  content: '私密的第一行\n第二段。<script>alert(1)</script>',
  createdAt: '2026-11-08T03:00:00Z',
});
const view = () => (
  <HelmetProvider>
    <MemoryRouter initialEntries={[`/confession/entry/${id}`]}>
      <Routes>
        <Route path="/confession/entry/:id" element={<ConfessionDetail />} />
      </Routes>
    </MemoryRouter>
  </HelmetProvider>
);
beforeEach(() => {
  requests.fetch.mockReset();
  vi.stubEnv('VITE_DEPLOY_TARGET', 'cloud');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('private confession reading route', () => {
  it('requires login on a direct URL and never fetches guest archives', async () => {
    requests.fetch.mockResolvedValue({ user: null });
    render(view());
    await waitFor(() => expect(screen.getByRole('button', { name: '登录后阅读' })).toBeInTheDocument());
    expect(requests.fetch).not.toHaveBeenCalledWith('/confessions', expect.anything());
    expect(screen.getByRole('link', { name: '返回忏悔场景' })).toHaveAttribute('href', '/confession');
  });
  it('reads the authenticated account only, renders safe plain text, and clears on logout', async () => {
    const user = { id: 'alice', name: 'Alice', login: 'alice' };
    requests.fetch.mockImplementation(async (path: string) =>
      path === '/me' ? { user } : { user, archive: { state: archive, revision: 1 } },
    );
    const { container } = render(view());
    await waitFor(() => expect(screen.getByText(/第二段。/)).toBeInTheDocument());
    expect(container.querySelector('.confession-record-content script')).toBeNull();
    expect(container.querySelector('.confession-record-content')).toHaveTextContent('<script>alert(1)</script>');
    expect(container.querySelector('.confession-record-content')).toHaveTextContent('私密的第一行');
    await waitFor(() =>
      expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow'),
    );
    expect(document.head.innerHTML).not.toContain('私密的第一行');
    expect(document.head.querySelector('script[type="application/ld+json"]')).toBeNull();
    requests.fetch.mockResolvedValue({ user: null });
    act(() => window.dispatchEvent(new Event('dblog-account-change')));
    expect(screen.queryByText(/第二段。/)).not.toBeInTheDocument();
  });
  it('does not reveal another account archive or existence', async () => {
    const user = { id: 'bob', name: 'Bob', login: 'bob' };
    requests.fetch.mockImplementation(async (path: string) =>
      path === '/me' ? { user } : { user, archive: { state: emptyConfession(), revision: 0 } },
    );
    render(view());
    await waitFor(() => expect(screen.getByRole('heading', { name: '无法查看这则记事' })).toBeInTheDocument());
    expect(screen.queryByText(/第二段。/)).not.toBeInTheDocument();
  });
  it('SSR contains no private entry or transport', () => {
    const html = renderToString(view());
    expect(html).not.toContain('私密的第一行');
    expect(requests.fetch).not.toHaveBeenCalled();
  });
  it('Pages reading route makes no account requests', async () => {
    vi.stubEnv('VITE_DEPLOY_TARGET', 'pages');
    render(view());
    await waitFor(() => expect(screen.getByText('请登录')).toBeInTheDocument());
    expect(requests.fetch).not.toHaveBeenCalled();
  });
});
