import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArticlesV2 from './ArticlesV2';
import { CloudError, cloudRequest, type CloudUser } from '@/cloud/api';
import { emptyReadingState, type ReadingSnapshot } from '@/cloud/articleReading';
import type { PostMetadata } from '@/types';

const { posts } = vi.hoisted(() => ({
  posts: [
    {
      id: 'go',
      title: 'Go 切片',
      excerpt: '切片的底层数组',
      date: '2026-11-07',
      category: 'Go',
      tags: ['切片'],
      coverImage: '/posts-img/go.webp',
      readTime: '3 分钟',
      filePath: 'go.md',
    },
    {
      id: 'sql',
      title: 'SQL 事务',
      excerpt: '数据库隔离级别',
      date: '2026-11-06',
      category: '数据库',
      tags: ['SQL'],
      coverImage: '/posts-img/sql.webp',
      readTime: '5 分钟',
      filePath: 'sql.md',
    },
  ] satisfies PostMetadata[],
}));
vi.mock('@/hooks/useArticlePosts', () => ({
  useArticlePosts: () => ({
    allPosts: posts,
    categories: ['Go', '数据库'],
    loading: false,
    loadError: null,
    reload: vi.fn(),
  }),
}));
vi.mock('@/cloud/api', async (original) => ({
  ...(await original<typeof import('@/cloud/api')>()),
  cloudRequest: vi.fn(),
}));
vi.mock('@/services/busuanzi', () => ({ pingBusuanzi: vi.fn(), fillBusuanziSpans: vi.fn() }));
let account: CloudUser | null;
let snapshot: ReadingSnapshot;
const request = vi.mocked(cloudRequest);
const mount = (url = '/articles-v2') =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/articles-v2" element={<ArticlesV2 />} />
          <Route path="/post/:id" element={<p>原文章详情</p>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
const managed = () => within(screen.getByRole('region', { name: '管理文章：Go 切片' }));
beforeEach(() => {
  account = { id: 'alice', login: 'alice', name: 'Alice', githubBound: false };
  snapshot = { state: emptyReadingState(), revision: 0, updatedAt: null };
  request.mockReset();
  request.mockImplementation(async (path, init) => {
    if (path === '/me') return { user: account };
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      snapshot = { state: body.state, revision: snapshot.revision + 1, updatedAt: '2026-11-07T00:00:00Z' };
    }
    return { user: account, reading: snapshot };
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Articles V2', () => {
  it('keeps SSR and the initial client frame free of account data', () => {
    const html = renderToString(
      <HelmetProvider>
        <MemoryRouter>
          <ArticlesV2 />
        </MemoryRouter>
      </HelmetProvider>,
    );
    expect(html).toContain('正在检查账号与阅读记录');
    expect(html).not.toContain('Go 切片');
    expect(request).not.toHaveBeenCalled();
  });
  it('requires login and never requests private state for visitors', async () => {
    account = null;
    const open = vi.fn();
    window.addEventListener('dblog-account-open', open);
    try {
      mount();
      await screen.findByRole('button', { name: '登录账号' });
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(request.mock.calls.some(([path]) => path === '/articles/reading')).toBe(false);
      await userEvent.click(screen.getByRole('button', { name: '登录账号' }));
      expect(open).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('dblog-account-open', open);
    }
  });
  it('retains real card covers and navigates to the original detail without adding a read', async () => {
    mount();
    await screen.findByRole('region', { name: '管理文章：Go 切片' });
    expect(managed().getByRole('img', { name: 'Go 切片' })).toHaveAttribute('src', expect.stringContaining('go.webp'));
    const links = managed().getAllByRole('link', { name: '阅读文章：Go 切片' });
    expect(links).toHaveLength(2);
    await userEvent.click(links[0]);
    expect(screen.getByText('原文章详情')).toBeInTheDocument();
    expect(request.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
  });
  it('uses only three categories with no marketing headings or enclosing surface', async () => {
    const { container } = mount();
    await screen.findByRole('region', { name: '管理文章：Go 切片' });
    const tabs = within(screen.getByRole('navigation', { name: '阅读分类' })).getAllByRole('button');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['全部文章', '想看', '已看', '暂不看']);
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('sr-only');
    expect(screen.queryByText('ARTICLES / V2')).not.toBeInTheDocument();
    expect(screen.queryByText('把写过的，重新读进心里')).not.toBeInTheDocument();
    expect(screen.queryByText(/定期回看/)).not.toBeInTheDocument();
    const root = container.firstElementChild!;
    expect(root).toHaveClass('mx-auto', 'max-w-5xl');
    expect(root.className).not.toMatch(/bg-|border|rounded/);
    const controls = managed().getByRole('combobox', { name: '阅读分类' }).parentElement!.parentElement!;
    expect(controls.className).not.toMatch(/bg-|border|rounded/);
    expect(
      managed()
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['想看', '已看', '暂不看']);
  });
  it('marks a read as seen and restores the previous category on undo for unbound users', async () => {
    mount();
    await screen.findByRole('region', { name: '管理文章：Go 切片' });
    expect(managed().getByRole('combobox', { name: '阅读分类' })).toHaveValue('want');
    await userEvent.click(managed().getByRole('button', { name: '记录一次已读' }));
    await waitFor(() =>
      expect(managed().getByRole('button', { name: 'Go 切片的阅读记录' })).toHaveTextContent('已读 1 次'),
    );
    expect(managed().getByRole('combobox', { name: '阅读分类' })).toHaveValue('seen');
    await userEvent.click(managed().getByRole('button', { name: '撤销今日已读' }));
    await waitFor(() =>
      expect(managed().getByRole('button', { name: 'Go 切片的阅读记录' })).toHaveTextContent('已读 0 次'),
    );
    expect(managed().getByRole('combobox', { name: '阅读分类' })).toHaveValue('want');
  });
  it('filters by explicit categories without adding counts and handles empty categories', async () => {
    mount();
    await screen.findByRole('region', { name: '管理文章：Go 切片' });
    await userEvent.selectOptions(managed().getByRole('combobox', { name: '阅读分类' }), 'seen');
    await waitFor(() => expect(managed().getByRole('combobox', { name: '阅读分类' })).toHaveValue('seen'));
    expect(managed().getByRole('button', { name: 'Go 切片的阅读记录' })).toHaveTextContent('已读 0 次');
    const tabs = within(screen.getByRole('navigation', { name: '阅读分类' }));
    await userEvent.click(tabs.getByRole('button', { name: '想看' }));
    expect(screen.queryByRole('region', { name: '管理文章：Go 切片' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '管理文章：SQL 事务' })).toBeInTheDocument();
    await userEvent.click(tabs.getByRole('button', { name: '已看' }));
    expect(screen.getByRole('region', { name: '管理文章：Go 切片' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '管理文章：SQL 事务' })).not.toBeInTheDocument();
    await userEvent.click(tabs.getByRole('button', { name: '暂不看' }));
    expect(screen.getByText('这个分类还没有符合条件的文章。')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '浏览全部文章' }));
    await screen.findByRole('region', { name: '管理文章：Go 切片' });
    await userEvent.selectOptions(managed().getByRole('combobox', { name: '阅读分类' }), 'skip');
    await waitFor(() => expect(managed().getByRole('combobox', { name: '阅读分类' })).toHaveValue('skip'));
    await userEvent.click(tabs.getByRole('button', { name: '暂不看' }));
    expect(screen.getByRole('region', { name: '管理文章：Go 切片' })).toBeInTheDocument();
  });
  it('opens legacy view links as all articles', async () => {
    mount('/articles-v2?view=review');
    await screen.findByRole('region', { name: '管理文章：Go 切片' });
    expect(screen.getByRole('button', { name: '全部文章' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('region', { name: /管理文章/ })).toHaveLength(2);
  });
  it('does not claim success on failure and retries exactly the same mutation', async () => {
    mount();
    await screen.findByRole('region', { name: '管理文章：Go 切片' });
    request.mockRejectedValueOnce(new Error('offline'));
    await userEvent.click(managed().getByRole('button', { name: '记录一次已读' }));
    await screen.findByRole('button', { name: '重试保存' });
    expect(managed().getByRole('button', { name: 'Go 切片的阅读记录' })).toHaveTextContent('已读 0 次');
    expect(managed().getByRole('button', { name: '记录一次已读' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '重试保存' }));
    await waitFor(() =>
      expect(managed().getByRole('button', { name: 'Go 切片的阅读记录' })).toHaveTextContent('已读 1 次'),
    );
    const writes = request.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(writes[0][1]?.body).toBe(writes[1][1]?.body);
  });
  it('reports conflicts and discards stale requests on logout', async () => {
    mount();
    await screen.findByRole('region', { name: '管理文章：Go 切片' });
    request.mockRejectedValueOnce(new CloudError(409, '', 'conflict'));
    await userEvent.click(managed().getByRole('button', { name: '记录一次已读' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('其他设备');
    await userEvent.click(screen.getByRole('button', { name: '读取云端版本' }));
    await screen.findByRole('region', { name: '管理文章：Go 切片' });
    let resolve!: (value: unknown) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await userEvent.click(managed().getByRole('button', { name: '记录一次已读' }));
    account = null;
    act(() => window.dispatchEvent(new CustomEvent('dblog-account-change', { detail: { user: null } })));
    await screen.findByRole('button', { name: '登录账号' });
    await act(async () => {
      resolve({ user: { id: 'alice' }, reading: snapshot });
    });
    expect(screen.queryByRole('region', { name: '管理文章：Go 切片' })).not.toBeInTheDocument();
  });
  it('searches and changes read-count ordering', async () => {
    mount();
    await screen.findByRole('region', { name: '管理文章：Go 切片' });
    await userEvent.click(managed().getByRole('button', { name: '记录一次已读' }));
    await waitFor(() =>
      expect(managed().getByRole('button', { name: 'Go 切片的阅读记录' })).toHaveTextContent('已读 1 次'),
    );
    expect(screen.getAllByRole('region', { name: /管理文章/ })[0]).toHaveAttribute('aria-label', '管理文章：SQL 事务');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '排序' }), 'most');
    expect(screen.getAllByRole('region', { name: /管理文章/ })[0]).toHaveAttribute('aria-label', '管理文章：Go 切片');
    await userEvent.type(screen.getByRole('searchbox'), '事务');
    expect(screen.queryByRole('region', { name: '管理文章：Go 切片' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '管理文章：SQL 事务' })).toBeInTheDocument();
  });
});
