import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { renderToString } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { AbilityDocumentPage } from './AbilityDocument';
vi.mock('@/services/abilities', () => ({
  getAbilityData: () => ({
    config: { 算法: 'N' },
    documents: [
      {
        dimension: '算法',
        filename: 'Index.md',
        title: '算法自评',
        content: '# 记录\n\n===重点===\n\n[下一阶段](Stage2.md)',
        filePath: '/about-radar/算法/Index.md',
      },
    ],
  }),
}));
const page = (path: string, basename = '/') => (
  <HelmetProvider>
    <MemoryRouter initialEntries={[path]} basename={basename}>
      <Routes>
        <Route path="/about/ability/:dimension/:filename" element={<AbilityDocumentPage />} />
        <Route path="/about" element={<h1>关于页</h1>} />
      </Routes>
    </MemoryRouter>
  </HelmetProvider>
);
describe('能力文档独立页面', () => {
  it.each(['/', '/Blog'])('在 %s 部署下渲染真实 Markdown，原文切换与返回', async (base) => {
    const prefix = base === '/' ? '' : base;
    render(page(`${prefix}/about/ability/算法/Index.md`, base));
    expect(screen.getByRole('heading', { level: 1, name: '算法自评' })).toBeInTheDocument();
    expect(screen.getByText('重点').closest('mark')).not.toBeNull();
    expect(screen.getByRole('link', { name: '下一阶段' })).toHaveAttribute(
      'href',
      `${prefix}/about/ability/%E7%AE%97%E6%B3%95/Stage2.md`,
    );
    fireEvent.click(screen.getByRole('button', { name: '查看 Markdown 原文' }));
    expect(screen.getByText(/===重点===/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回正文' }));
    expect(screen.getByText('重点').closest('mark')).not.toBeNull();
    fireEvent.click(screen.getByRole('link', { name: '返回能力雷达' }));
    expect(await screen.findByRole('heading', { name: '关于页' })).toBeInTheDocument();
  });
  it('不存在文档有返回入口', () => {
    render(page('/about/ability/算法/Missing.md'));
    expect(screen.getByRole('heading', { name: '文档未找到' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回关于页' })).toHaveAttribute('href', '/about');
  });
  it('SSG 首帧含完整正文与高亮', () => {
    const html = renderToString(page('/about/ability/算法/Index.md'));
    expect(html).toContain('<mark>重点</mark>');
    expect(html).toContain('算法自评');
    expect(html).not.toContain('正在加载文章');
  });
});
