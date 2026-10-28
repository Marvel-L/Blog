import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MarkdownBody } from './MarkdownBody';
describe('共享文章正文', () => {
  it('能力正文复用三等号与代码工具栏、图片与相对文档链接', async () => {
    const content =
      '# 标题\n\n===**重点**===\n\n![图片](diagram.png){.small}\n\n[下一阶段](Stage2.md)\n\n```js title="main.js"\nconst equal = left === right;\n```';
    const { container } = render(
      <MemoryRouter>
        <MarkdownBody content={content} filePath="/about-radar/算法/Index.md" />
      </MemoryRouter>,
    );
    expect(screen.getByText('重点').closest('mark')).not.toBeNull();
    expect(screen.getByRole('link', { name: '下一阶段' })).toHaveAttribute(
      'href',
      '/about/ability/%E7%AE%97%E6%B3%95/Stage2.md',
    );
    expect(screen.getByRole('img', { name: '图片' })).toHaveAttribute(
      'src',
      expect.stringContaining('about-radar-img'),
    );
    expect(container.querySelector('figure')).toHaveAttribute('data-size', 'small');
    expect(await screen.findByRole('button', { name: '复制代码' })).toBeInTheDocument();
    expect(container.querySelector('pre mark')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '预览图片：图片' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
  it('普通正文危险 HTML 不进入 DOM', () => {
    const { container } = render(
      <MemoryRouter>
        <MarkdownBody content={'[危险](javascript:alert(1))\n\n<script>alert(1)</script>'} />
      </MemoryRouter>,
    );
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });
  it('标题重渲染后锚点不漂移', () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <MarkdownBody content={'# 重复\n\n# 重复'} />
      </MemoryRouter>,
    );
    const ids = [...container.querySelectorAll('h2')].map((h) => h.id);
    rerender(
      <MemoryRouter>
        <MarkdownBody content={'# 重复\n\n# 重复'} />
      </MemoryRouter>,
    );
    expect([...container.querySelectorAll('h2')].map((h) => h.id)).toEqual(ids);
  });
});
