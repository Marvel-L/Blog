import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { renderToString } from 'react-dom/server';
import { BookPage } from './Book';
import { catalog } from '@/books/book-fixtures';
import { getInitialPosts } from '@/services/posts';

vi.mock('@/services/posts', () => ({ getInitialPosts: vi.fn() }));
const Probe = () => <output data-testid="path">{useLocation().pathname}</output>;
const app = (path: string, basename = '/') => (
  <HelmetProvider>
    <MemoryRouter basename={basename} initialEntries={[path]}>
      <Routes>
        <Route path="/book" element={<BookPage />} />
        <Route path="/book/:bookId" element={<BookPage />} />
        <Route path="/book/:bookId/chapter/:postId" element={<BookPage />} />
        <Route path="/post/:id" element={<p>原文阅读页</p>} />
      </Routes>
      <Probe />
    </MemoryRouter>
  </HelmetProvider>
);

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  vi.mocked(getInitialPosts).mockReturnValue(catalog);
});

describe('Book navigation and preview', () => {
  it('opens a real category book from the shelf and changes sidebar on category navigation', async () => {
    const user = userEvent.setup();
    render(app('/book'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('把零散的思考');
    await user.click(screen.getByRole('link', { name: '打开 算法，3 篇文章' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/book/algorithms');
    expect(screen.getByRole('navigation', { name: '算法章节目录' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: '书籍分类' });
    await user.click(within(nav).getByRole('link', { name: 'Golang1' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/book/golang');
    expect(screen.getByRole('navigation', { name: 'Golang章节目录' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '算法章节目录' })).not.toBeInTheDocument();
  });
  it('supports nested directory toggles, chapter preview, neighboring chapters and original post navigation', async () => {
    const user = userEvent.setup();
    render(app('/book/algorithms'));
    const tree = screen.getByRole('navigation', { name: '算法章节目录' });
    const toggle = within(tree).getByRole('button', { name: '链表' });
    expect(toggle).not.toHaveClass('book-tree-current-group');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(tree).queryByRole('link', { name: '反转链表' })).not.toBeInTheDocument();
    await user.click(toggle);
    await user.click(within(tree).getByRole('link', { name: '反转链表' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('反转链表');
    expect(screen.getByRole('heading', { name: '章节摘要' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: '算法章节目录' })).getByRole('link', { name: '反转链表' }),
    ).toHaveAttribute('aria-current', 'page');
    const neighbors = screen.getByRole('navigation', { name: '相邻章节' });
    await user.click(within(neighbors).getByRole('link', { name: /下一章/ }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('两数相加');
    await user.click(screen.getByRole('link', { name: '阅读完整文章' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/post/merge');
    expect(screen.getByText('原文阅读页')).toBeInTheDocument();
  });
  it('supports deep links and /Blog base paths', () => {
    render(app('/Blog/book/algorithms/chapter/reverse', '/Blog'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('反转链表');
    expect(screen.getByRole('link', { name: '阅读完整文章' })).toHaveAttribute('href', '/Blog/post/reverse');
    expect(screen.getByRole('link', { name: '返回书架' })).toHaveAttribute('href', '/Blog/book');
  });
  it.each(['/book/missing', '/book/golang/chapter/reverse'])('handles unknown/cross-category routes: %s', (path) => {
    render(app(path));
    expect(screen.getByRole('heading', { name: '页面走丢了' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '章节摘要' })).not.toBeInTheDocument();
  });
  it('renders an honest empty shelf', () => {
    vi.mocked(getInitialPosts).mockReturnValue([]);
    render(app('/book'));
    expect(screen.getByText(/书架还空着/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /打开/ })).not.toBeInTheDocument();
  });
  it('SSR exposes the same deterministic shelf and directories before effects', () => {
    const a = renderToString(app('/book/algorithms'));
    const b = renderToString(app('/book/algorithms'));
    expect(a).toBe(b);
    expect(a).toContain('算法章节目录');
    expect(a).toContain('反转链表');
    expect(a).toContain('/book/algorithms/chapter/reverse');
  });
});
