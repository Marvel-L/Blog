import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { renderToString } from 'react-dom/server';
import { BookPage } from './Book';
import { catalog } from '@/books/book-fixtures';
import { getInitialPosts } from '@/services/posts';
import * as bookService from '@/services/books';

vi.mock('@/services/posts', () => ({ getInitialPosts: vi.fn() }));
const Probe = () => <output data-testid="path">{useLocation().pathname}</output>;
const app = (path: string, basename = '/') => (
  <HelmetProvider>
    <MemoryRouter basename={basename} initialEntries={[path]}>
      <Routes>
        <Route path="/book" element={<BookPage />} />
        <Route path="/book/:bookId" element={<BookPage />} />
        <Route path="/book/:bookId/chapter/:chapterId" element={<BookPage />} />
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

describe('Book package detail', () => {
  it('opens an independently configured package from the shelf', async () => {
    const user = userEvent.setup();
    render(app('/book'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('把零散的内容');
    await user.click(screen.getByRole('link', { name: '打开 算法学习手册，3 个章节' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/book/algorithms');
    expect(screen.getByRole('navigation', { name: '算法学习手册章节目录' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '阅读指南' })).toBeInTheDocument();
  });

  it('switches package chapters and renders Markdown content plus related Blog posts', async () => {
    const user = userEvent.setup();
    render(app('/book/algorithms'));
    const tree = screen.getByRole('navigation', { name: '算法学习手册章节目录' });
    const toggle = within(tree).getByRole('button', { name: '数据结构' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    await user.click(within(tree).getByRole('link', { name: '链表：从指针关系入手' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/book/algorithms/chapter/linked-list');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('链表：从指针关系入手');
    expect(screen.getByRole('heading', { name: '常见题型' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '你可能还喜欢' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /反转链表/ })).toHaveAttribute('href', '/post/lcsaf-reverse-link-0x01');
  });

  it('supports old post chapter links and /Blog base paths', () => {
    render(app('/Blog/book/algorithms/chapter/lcsaf-reverse-link-0x01', '/Blog'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('链表：从指针关系入手');
    expect(screen.getByRole('link', { name: /反转链表/ })).toHaveAttribute(
      'href',
      '/Blog/post/lcsaf-reverse-link-0x01',
    );
    expect(screen.getByRole('link', { name: '返回书架' })).toHaveAttribute('href', '/Blog/book');
  });

  it.each(['/book/missing', '/book/golang/chapter/missing'])('handles unknown routes: %s', (path) => {
    render(app(path));
    expect(screen.getByRole('heading', { name: '页面走丢了' })).toBeInTheDocument();
  });

  it('keeps packages visible even when no related Blog post exists', () => {
    vi.mocked(getInitialPosts).mockReturnValue([]);
    render(app('/book'));
    expect(screen.getByRole('link', { name: '打开 算法学习手册，3 个章节' })).toBeInTheDocument();
    expect(screen.queryByText(/书架还空着/)).not.toBeInTheDocument();
  });

  it('renders newly discovered packages from the generated snapshot', () => {
    vi.spyOn(bookService, 'getBookPackageDefinitions').mockReturnValue([
      {
        id: 'local',
        name: '本地手册',
        subtitle: '',
        edition: 'LOCAL NOTES',
        accent: '#365348',
        chapters: [
          {
            id: 'intro',
            directory: [],
            title: '新建章节',
            content: '# 新建章节\n\n## 方法\n\n来自本地 Markdown 的正文。',
          },
        ],
      },
    ]);
    render(app('/book/local/chapter/intro'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('新建章节');
    expect(screen.getByText('来自本地 Markdown 的正文。')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '本地手册章节目录' })).toBeInTheDocument();
  });

  it('shows the empty shelf when there are no local packages', () => {
    vi.spyOn(bookService, 'getBookPackageDefinitions').mockReturnValue([]);
    render(app('/book'));
    expect(screen.getByText(/书架还空着/)).toBeInTheDocument();
  });

  it('renders and collapses multiple levels of physical subpackages', async () => {
    const definition = bookService.getBookPackageDefinitions()[0];
    vi.spyOn(bookService, 'getBookPackageDefinitions').mockReturnValue([
      {
        ...definition,
        chapters: [{ id: 'nested', directory: ['并发', '取消'], title: '取消机制', content: '# 取消机制\n\n正文。' }],
      },
    ]);
    render(app(`/book/${definition.id}/chapter/nested`));
    const user = userEvent.setup();
    const tree = screen.getByRole('navigation', { name: `${definition.name}章节目录` });
    const parent = within(tree).getByRole('button', { name: '并发' });
    const child = within(tree).getByRole('button', { name: '取消' });
    expect(screen.getByText('并发 / 取消')).toBeInTheDocument();
    await user.click(child);
    expect(child).toHaveAttribute('aria-expanded', 'false');
    expect(within(tree).queryByRole('link', { name: '取消机制' })).not.toBeInTheDocument();
    await user.click(parent);
    expect(within(tree).queryByRole('button', { name: '取消' })).not.toBeInTheDocument();
    await user.click(parent);
    await user.click(child);
    expect(within(tree).getByRole('link', { name: '取消机制' })).toHaveAttribute('aria-current', 'page');
  });

  it('SSR exposes deterministic package content and routes', () => {
    const a = renderToString(app('/book/algorithms/chapter/linked-list'));
    const b = renderToString(app('/book/algorithms/chapter/linked-list'));
    expect(a).toBe(b);
    expect(a).toContain('算法学习手册章节目录');
    expect(a).toContain('链表：从指针关系入手');
    expect(a).toContain('/book/algorithms/chapter/linked-list');
  });
});
