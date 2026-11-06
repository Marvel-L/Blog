import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { Articles } from './Articles';
import * as privacyPostsService from '@/services/privacyPosts';
import { getReadingHistory, saveReadingHistory } from '@/services/readingHistory';
import { getInitialPosts } from '@/services/posts';

// URL 探针：MemoryRouter 不更新 window.location，断言搜索参数必须经
// useSearchParams 读取（否则「清除搜索后参数移除」的断言恒真、无回归保护）。
let probeSearch = '';
const SearchParamsProbe = () => {
  const [searchParams] = useSearchParams();
  probeSearch = searchParams.toString();
  return null;
};

// 弹层与工具组件用 stub 替代，聚焦文章列表自身行为。
vi.mock('@/components/ShareModal', () => ({
  ShareModal: () => <div data-testid="mock-share-modal" />,
}));
vi.mock('@/services/busuanzi', () => ({
  pingBusuanzi: vi.fn(),
  fillBusuanziSpans: vi.fn(),
}));
const renderHome = (initialEntry = '/articles') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <Articles />
              <SearchParamsProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('Articles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    probeSearch = '';
    window.localStorage.clear();
    window.sessionStorage.clear();
    // jsdom 不实现 matchMedia：useReducedMotion/useMediaQuery 等依赖媒体查询。
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('移除可见大小标题，保留辅助阅读标题与返回首页入口', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1, name: '文章列表' })).toHaveClass('sr-only');
    expect(screen.queryByRole('heading', { level: 1, name: '文章' })).not.toBeInTheDocument();
    expect(screen.queryByText('技术笔记、学习记录与日常分享。')).not.toBeInTheDocument();
    expect(screen.queryByText('BLOG / ARTICLES')).not.toBeInTheDocument();
    expect(screen.queryByRole('figure', { name: '每日诗词与名言' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/');
  });

  it('文章列表每篇占一行，精选文章也只占一个分页名额', () => {
    renderHome();
    // 首页应有至少一个文章链接（卡片标题链接）
    const postLinks = screen.getAllByRole('link', { name: /阅读文章：/ });
    expect(postLinks.length).toBeGreaterThan(0);
    expect(document.getElementById('posts-list')).toHaveClass('flex-col');
    expect(document.querySelectorAll('#posts-list article')).toHaveLength(Math.min(9, getInitialPosts().length));
    expect(document.querySelectorAll('#posts-list [data-layout^="row-"]')).toHaveLength(
      Math.min(9, getInitialPosts().length),
    );
  });

  it('分类筛选：点击分类按钮后该分类被选中', async () => {
    const user = userEvent.setup();
    renderHome();
    const categoryButtons = screen.getAllByRole('button', { name: /^(算法|日常|Golang)$/ });
    expect(categoryButtons.length).toBeGreaterThan(0);

    await user.click(categoryButtons[0]);
    expect(categoryButtons[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('URL 带 ?category= 时应用 URL 分类筛选', async () => {
    renderHome('/articles?category=算法');
    // effect 同步 URL 分类后：算法选中、全部未选中
    const categoryButton = await screen.findByRole('button', { name: '算法' });
    expect(categoryButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('打开分享弹层：点击卡片分享按钮', async () => {
    const user = userEvent.setup();
    renderHome();
    const shareButtons = screen.getAllByRole('button', { name: /分享文章：/ });
    expect(shareButtons.length).toBeGreaterThan(0);
    await user.click(shareButtons[0]);
    expect(await screen.findByTestId('mock-share-modal')).toBeInTheDocument();
  });

  it('URL 带 ?q= 时同步到搜索框', async () => {
    renderHome('/articles?q=react');
    const input = await screen.findByRole('searchbox', { name: '搜索文章' });
    await waitFor(() => expect(input).toHaveValue('react'));
  });

  it('输入搜索词后输入框保持用户输入不被 URL 同步回退（v7_startTransition 竞态回归）', async () => {
    const user = userEvent.setup();
    renderHome();
    const input = screen.getByRole('searchbox', { name: '搜索文章' });

    await user.type(input, 'react');
    // 击键后 URL 异步提交期间，URL→state 回写不得把输入内容回退。
    await waitFor(() => expect(input).toHaveValue('react'));
    expect(input).toHaveValue('react');
  });

  it('清除搜索后 URL 的 q 参数被移除', async () => {
    const user = userEvent.setup();
    renderHome('/articles?q=react');
    const input = await screen.findByRole('searchbox', { name: '搜索文章' });
    await waitFor(() => expect(input).toHaveValue('react'));

    await user.click(screen.getByRole('button', { name: '清除搜索' }));
    await waitFor(() => expect(input).toHaveValue(''));
    // URL 中不再有 q 参数。
    await waitFor(() => {
      expect(probeSearch).not.toContain('q=');
    });
  });

  it('密码状态已解锁时，文章列表会重新加载并显示隐藏文章与分类', async () => {
    const hiddenPost = {
      id: 'hidden-post',
      title: '隐藏文章',
      excerpt: '仅密码通过后可见',
      date: '2026-12-01',
      category: '隐藏分类',
      filePath: '/posts/hidden-post.md',
      readTime: '3分钟阅读',
      tags: ['隐藏标签'],
      needHidden: true,
    };
    const readUnlockedPrivacyPostsSpy = vi.spyOn(privacyPostsService, 'readUnlockedPrivacyPosts').mockResolvedValue([
      {
        ...hiddenPost,
        content: '仅密码通过后可见的正文',
      },
    ]);
    const getCachedPrivacyPostMetadataSpy = vi
      .spyOn(privacyPostsService, 'getCachedPrivacyPostMetadata')
      .mockReturnValue([hiddenPost]);

    window.localStorage.setItem('d-blog-privacy-access', 'granted');
    window.localStorage.setItem('d-blog-privacy-password', 'Mx179516');
    renderHome();

    expect(await screen.findByRole('link', { name: '阅读文章：隐藏文章' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '隐藏分类' })).toBeInTheDocument();

    readUnlockedPrivacyPostsSpy.mockRestore();
    getCachedPrivacyPostMetadataSpy.mockRestore();
  });

  it('已有阅读进度时文章页不展示继续阅读，也不清除进度', () => {
    const [firstPost] = getInitialPosts();
    expect(firstPost).toBeTruthy();
    saveReadingHistory({ postId: firstPost.id, progress: 0.4, updatedAt: 1000 });
    renderHome();

    expect(screen.queryByRole('link', { name: /继续阅读：/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/已阅读 40%/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /放弃阅读：/ })).not.toBeInTheDocument();
    expect(getReadingHistory()).toEqual([{ postId: firstPost.id, progress: 0.4, updatedAt: 1000 }]);
  });

  it('翻页后不重复文章，并将页码写入 URL', async () => {
    const user = userEvent.setup();
    renderHome();
    const firstPage = Array.from(document.querySelectorAll('#posts-list h2')).map((heading) => heading.textContent);
    await user.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(probeSearch).toContain('page=2'));
    const secondPage = Array.from(document.querySelectorAll('#posts-list h2')).map((heading) => heading.textContent);
    expect(secondPage.length).toBeGreaterThan(0);
    expect(secondPage.some((title) => firstPage.includes(title))).toBe(false);
  });

  it('越界页码自愈并同步替换 URL', async () => {
    renderHome('/articles?page=9999');
    const totalPages = Math.ceil(getInitialPosts().length / 9);
    await waitFor(() => expect(probeSearch).toBe(`page=${totalPages}`));
    expect(document.querySelectorAll('#posts-list article').length).toBeGreaterThan(0);
  });
});
