import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

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
    await user.click(
      within(screen.getByRole('navigation', { name: '算法学习手册栏目导航' })).getByRole('link', {
        name: '数据结构 1',
      }),
    );
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

  it('navigates the current package sections and follows the selected chapter', async () => {
    const user = userEvent.setup();
    render(app('/book/algorithms/chapter/linked-list'));
    const navigation = screen.getByRole('navigation', { name: '算法学习手册栏目导航' });
    expect(
      within(navigation)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['开始 1', '数据结构 1', '数学基础 1']);
    expect(within(navigation).getByRole('link', { name: '数据结构 1' })).toHaveAttribute('aria-current', 'page');
    await user.click(within(navigation).getByRole('link', { name: '数学基础 1' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/book/algorithms/chapter/number-theory');
    expect(screen.getByRole('heading', { level: 1, name: '数论：最大公约数' })).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: '数学基础 1' })).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getByRole('link', { name: '数据结构 1' })).not.toHaveAttribute('aria-current');
    const tree = screen.getByRole('navigation', { name: '算法学习手册章节目录' });
    expect(within(tree).getAllByRole('link')).toHaveLength(1);
    expect(within(tree).getByRole('link', { name: '数论：最大公约数' })).toHaveAttribute('aria-current', 'page');
    expect(within(tree).queryByRole('button', { name: '数据结构' })).not.toBeInTheDocument();
    expect(within(tree).queryByRole('button', { name: '开始' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: '相邻章节' })).queryByRole('link')).not.toBeInTheDocument();
    const toc = screen.getByRole('complementary', { name: '本页目录' });
    expect(within(toc).getByRole('link', { name: '实现' })).toHaveAttribute('href', '#实现');
    expect(within(toc).queryByRole('link', { name: '基础框架' })).not.toBeInTheDocument();
    await user.click(within(navigation).getByRole('link', { name: '开始 1' }));
    await user.click(
      within(screen.getByRole('navigation', { name: '算法学习手册章节目录' })).getByRole('link', { name: '阅读指南' }),
    );
    expect(within(navigation).getByRole('link', { name: '开始 1' })).toHaveAttribute('aria-current', 'page');
  });

  it('supports old post chapter links and /Blog base paths', () => {
    render(app('/Blog/book/algorithms/chapter/lcsaf-reverse-link-0x01', '/Blog'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('链表：从指针关系入手');
    expect(screen.getByRole('link', { name: /反转链表/ })).toHaveAttribute(
      'href',
      '/Blog/post/lcsaf-reverse-link-0x01',
    );
    expect(screen.getByRole('link', { name: '返回书架' })).toHaveAttribute('href', '/Blog/book');
    const navigation = screen.getByRole('navigation', { name: '算法学习手册栏目导航' });
    expect(within(navigation).getByRole('link', { name: '数据结构 1' })).toHaveAttribute(
      'href',
      '/Blog/book/algorithms/chapter/linked-list',
    );
    expect(within(navigation).getByRole('link', { name: '数据结构 1' })).toHaveAttribute('aria-current', 'page');
  });

  it.each(['/book/missing', '/book/algorithms/chapter/missing'])('handles unknown routes: %s', (path) => {
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
    const navigation = screen.getByRole('navigation', { name: '本地手册栏目导航' });
    expect(within(navigation).getByRole('link', { name: '新建章节 1' })).toHaveAttribute(
      'href',
      '/book/local/chapter/intro',
    );
  });

  it('shows the empty shelf when there are no local packages', () => {
    vi.spyOn(bookService, 'getBookPackageDefinitions').mockReturnValue([]);
    render(app('/book'));
    expect(screen.getByText(/书架还空着/)).toBeInTheDocument();
  });

  it.each(['/', '/Blog/'])('loads sibling chapter images and opens the viewer under %s', async (base) => {
    vi.stubEnv('BASE_URL', base);
    const definition = bookService.getBookPackageDefinitions()[0];
    vi.spyOn(bookService, 'getBookPackageDefinitions').mockReturnValue([
      {
        ...definition,
        chapters: [
          {
            id: 'images',
            directory: ['业务'],
            title: '图片章节',
            filePath: '/books/demo/业务/readme.md',
            content: '# 图片章节\n\n## 流程\n\n![业务流程](img.png){.small}{.no-dark}',
          },
        ],
      },
    ]);
    const user = userEvent.setup();
    const { container } = render(app(`${base}book/${definition.id}/chapter/images`, base.replace(/\/$/, '') || '/'));
    const expectedSrc = `${base}books-img/demo/${encodeURIComponent('业务')}/img.png`;
    const image = screen.getByRole('img', { name: '业务流程' });
    expect(image).toHaveAttribute('src', expectedSrc);
    expect(image).toHaveClass('no-dark-adapt');
    expect(image.closest('figure')).toHaveAttribute('data-size', 'small');
    expect(container.querySelector('p figure')).toBeNull();
    expect(container).not.toHaveTextContent('{.small}');
    await user.click(screen.getByRole('button', { name: '预览图片：业务流程' }));
    const viewer = screen.getByRole('dialog', { name: '图片预览：业务流程' });
    expect(within(viewer).getByRole('img', { name: '业务流程' })).toHaveAttribute('src', expectedSrc);
    await user.click(within(viewer).getByRole('button', { name: '关闭图片预览' }));
    expect(screen.queryByRole('dialog', { name: '图片预览：业务流程' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '业务流程' })).toBe(image);
    expect(screen.getByRole('heading', { name: '流程' })).toHaveAttribute('id', '流程');
  });

  it('SSR resolves inline images from the source directory and preserves external URLs', () => {
    vi.stubEnv('BASE_URL', '/Blog/');
    const definition = bookService.getBookPackageDefinitions()[0];
    vi.spyOn(bookService, 'getBookPackageDefinitions').mockReturnValue([
      {
        ...definition,
        chapters: [
          {
            id: 'images',
            directory: [],
            title: '图片章节',
            filePath: '/books/demo/readme.md',
            content: '# 图片章节\n\n![本地](./img.png){.inline} ![外链](https://example.com/img.png){.inline}{.medium}',
          },
        ],
      },
    ]);
    const html = renderToString(app(`/Blog/book/${definition.id}/chapter/images`, '/Blog'));
    expect(html).toContain('src="/Blog/books-img/demo/img.png"');
    expect(html).toContain('src="https://example.com/img.png"');
    expect(html).toContain('data-role="markdown-image-row"');
    expect(html).toContain('data-size="small" data-inline="true"');
    expect(html).toContain('data-size="medium" data-inline="true"');
    expect(html).not.toContain('{.inline}');
    expect(html).not.toContain('<p><figure');
  });

  it('renders and collapses multiple levels of physical subpackages', async () => {
    const definition = bookService.getBookPackageDefinitions()[0];
    vi.spyOn(bookService, 'getBookPackageDefinitions').mockReturnValue([
      {
        ...definition,
        chapters: [
          { id: 'nested', directory: ['并发', '取消'], title: '取消机制', content: '# 取消机制\n\n正文。' },
          { id: 'timeout', directory: ['并发', '取消'], title: '超时处理', content: '# 超时处理\n\n正文。' },
        ],
      },
    ]);
    render(app(`/book/${definition.id}/chapter/timeout`));
    const user = userEvent.setup();
    const tree = screen.getByRole('navigation', { name: `${definition.name}章节目录` });
    const navigation = screen.getByRole('navigation', { name: `${definition.name}栏目导航` });
    const section = within(navigation).getByRole('link', { name: '并发 2' });
    expect(section).toHaveAttribute('href', `/book/${definition.id}/chapter/nested`);
    expect(section).toHaveAttribute('aria-current', 'page');
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
    expect(within(tree).getByRole('link', { name: '超时处理' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps navigation in the active module and switches the article table of contents', async () => {
    const definition = bookService.getBookPackageDefinitions()[0];
    vi.spyOn(bookService, 'getBookPackageDefinitions').mockReturnValue([
      {
        ...definition,
        chapters: [
          { id: 'intro', directory: ['开始'], title: '阅读指南', content: '# 阅读指南\n\n## 使用方法\n\n正文。' },
          {
            id: 'gcd',
            directory: ['数学基础', '数论'],
            title: '最大公约数',
            content: '# 最大公约数\n\n## 原理\n\n正文。\n\n### 示例\n\n例子。',
          },
          {
            id: 'prime',
            directory: ['数学基础', '数论'],
            title: '素数',
            content: '# 素数\n\n## 判定\n\n正文。\n\n## 实现\n\n第一种。\n\n## 实现\n\n第二种。',
          },
          { id: 'list', directory: ['数据结构'], title: '链表', content: '# 链表\n\n## 指针\n\n正文。' },
        ],
      },
    ]);
    const user = userEvent.setup();
    render(<StrictMode>{app(`/book/${definition.id}/chapter/gcd`)}</StrictMode>);
    const tree = screen.getByRole('navigation', { name: `${definition.name}章节目录` });
    expect(
      within(tree)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['最大公约数', '素数']);
    const pagination = screen.getByRole('navigation', { name: '相邻章节' });
    expect(within(pagination).getAllByRole('link')).toHaveLength(1);
    expect(within(pagination).getByRole('link', { name: /下一章\s*素数/ })).toHaveAttribute(
      'href',
      `/book/${definition.id}/chapter/prime`,
    );
    const toc = screen.getByRole('complementary', { name: '本页目录' });
    expect(within(toc).getByRole('link', { name: '原理' })).toHaveAttribute('href', '#原理');
    expect(within(toc).getByRole('link', { name: '示例' })).toHaveAttribute('href', '#示例');
    await user.click(within(tree).getByRole('link', { name: '素数' }));
    expect(screen.getByRole('heading', { level: 1, name: '素数' })).toBeInTheDocument();
    expect(within(toc).queryByRole('link', { name: '原理' })).not.toBeInTheDocument();
    expect(
      within(toc)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['#判定', '#实现', '#实现-2']);
    within(toc)
      .getAllByRole('link')
      .forEach((link) => {
        expect(document.getElementById(link.getAttribute('href')!.slice(1))).toBeInTheDocument();
      });
    expect(within(pagination).getAllByRole('link')).toHaveLength(1);
    expect(within(pagination).getByRole('link', { name: /上一章\s*最大公约数/ })).toHaveAttribute(
      'href',
      `/book/${definition.id}/chapter/gcd`,
    );
  });

  it('omits a leading Markdown title even when the file ends on that line', () => {
    const definition = bookService.getBookPackageDefinitions()[0];
    vi.spyOn(bookService, 'getBookPackageDefinitions').mockReturnValue([
      {
        ...definition,
        chapters: [{ id: 'intro', directory: ['开始'], title: '欢迎阅读', content: '# 你好' }],
      },
    ]);
    render(app(`/book/${definition.id}/chapter/intro`));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('欢迎阅读');
    expect(
      within(screen.getByRole('complementary', { name: '本页目录' })).getByText('本章暂无小节'),
    ).toBeInTheDocument();
  });

  it('SSR exposes deterministic package content and routes', () => {
    const a = renderToString(app('/book/algorithms/chapter/linked-list'));
    const b = renderToString(app('/book/algorithms/chapter/linked-list'));
    expect(a).toBe(b);
    expect(a).toContain('算法学习手册章节目录');
    expect(a).toContain('算法学习手册栏目导航');
    expect(a).toContain('链表：从指针关系入手');
    expect(a).toContain('/book/algorithms/chapter/linked-list');
    expect(a).toMatch(/book-page-toc[\s\S]*href="#基础框架"/);
    const sidebar = a.match(/<nav aria-label="算法学习手册章节目录">([\s\S]*?)<\/nav>/)?.[1];
    expect(sidebar).toContain('/book/algorithms/chapter/linked-list');
    expect(sidebar).not.toContain('/book/algorithms/chapter/number-theory');
  });
});
