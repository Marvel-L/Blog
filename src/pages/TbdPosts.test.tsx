import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import type { PostMetadata } from '@/types';
import { TbdPosts } from './TbdPosts';

let probeSearch = '';
const SearchParamsProbe = () => {
  const [searchParams] = useSearchParams();
  probeSearch = searchParams.toString();
  return null;
};

const makePost = (partial: Partial<PostMetadata> & Pick<PostMetadata, 'id' | 'title' | 'date' | 'category'>): PostMetadata => ({
  excerpt: '摘要',
  filePath: `/posts/${partial.id}.md`,
  readTime: '1 分钟',
  tags: [],
  ...partial,
});

const renderTbdPosts = (posts: PostMetadata[], initialEntry = '/tbd') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/tbd"
          element={
            <>
              <TbdPosts posts={posts} />
              <SearchParamsProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('TbdPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    Object.defineProperty(window, 'scrollTo', {
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, 'requestAnimationFrame', {
      writable: true,
      value: vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
    });
  });

  it('只展示 tbd=true 的文章，并按延期天数从高到低排列', () => {
    renderTbdPosts([
      makePost({ id: 'post-a', title: '较新待补完', date: '2026-10-01', category: '日常', tbd: true, tbdAgeDays: 5 }),
      makePost({ id: 'post-b', title: '较旧待补完', date: '2026-04-01', category: '技术', tbd: true, tbdAgeDays: 180 }),
      makePost({ id: 'post-c', title: '正常文章', date: '2026-10-03', category: '技术' }),
    ]);

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings[0]).toHaveTextContent('较旧待补完');
    expect(headings[1]).toHaveTextContent('较新待补完');
    expect(screen.queryByRole('link', { name: /正常文章/ })).not.toBeInTheDocument();
  });

  it('支持分页并把页码写入 URL', async () => {
    const user = userEvent.setup();
    const posts = Array.from({ length: 7 }, (_, index) =>
      makePost({
        id: `post-${index + 1}`,
        title: `待补完文章 ${index + 1}`,
        date: `2026-01-${String(index + 1).padStart(2, '0')}`,
        category: '技术',
        tbd: true,
        tbdAgeDays: 200 - index,
      }),
    );

    renderTbdPosts(posts);

    expect(screen.getByRole('heading', { name: '待补完文章 1', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '待补完文章 7', level: 2 })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '第 2 页' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '待补完文章 7', level: 2 })).toBeInTheDocument();
      expect(probeSearch).toContain('page=2');
    });
  });

  it('不同延期时长展示不同红色强度等级', () => {
    renderTbdPosts([
      makePost({ id: 'post-a', title: '刚挂起', date: '2026-10-01', category: '技术', tbd: true, tbdAgeDays: 10 }),
      makePost({ id: 'post-b', title: '已经很久', date: '2026-01-01', category: '技术', tbd: true, tbdAgeDays: 220 }),
    ]);

    expect(screen.getByRole('link', { name: /刚挂起/ })).toHaveAttribute('data-age-level', 'fresh');
    expect(screen.getByRole('link', { name: /已经很久/ })).toHaveAttribute('data-age-level', 'overdue');
  });
});
