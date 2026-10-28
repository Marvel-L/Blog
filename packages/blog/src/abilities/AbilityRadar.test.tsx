import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { renderToString } from 'react-dom/server';
import { AbilityRadar } from './AbilityRadar';
import { validateAbilityConfig, abilityPoint, abilityDocumentRoute, type AbilityData } from './ability-core.mjs';
afterEach(() => vi.restoreAllMocks());
const data: AbilityData = {
  config: { 算法: 'N', 学历: 'V' },
  documents: [
    {
      dimension: '学历',
      filename: 'Index.md',
      title: '学历自评',
      content: '# 说明',
      filePath: '/about-radar/学历/Index.md',
    },
  ],
};
describe('能力雷达', () => {
  it('未配置时仅外框和中心黑点，不伪造等级', () => {
    const { container } = render(
      <MemoryRouter>
        <AbilityRadar data={{ config: {}, documents: [] }} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-empty-center]')).toHaveAttribute('fill', 'black');
    expect(container.querySelector('[data-shape]')).toBeNull();
    expect(container.querySelectorAll('[data-node]')).toHaveLength(0);
    expect(screen.getByRole('button', { name: '学历，查看文档' })).toHaveTextContent('学历');
    expect(screen.queryByRole('button', { name: '节点呼吸闪烁' })).not.toBeInTheDocument();
  });
  it('合法部分配置与无效等级按真实口径处理', () => {
    expect(validateAbilityConfig({ 算法: 'N', 学历: null })).toEqual({ 算法: 'N' });
    expect(() => validateAbilityConfig({ 算法: 'X' })).toThrow();
    expect(() => validateAbilityConfig({ 未知: 'N' })).toThrow();
    expect(abilityPoint(2, 0)).toEqual([350, 262]);
    expect(abilityPoint(0, 6)).toEqual([350, 86]);
    expect(() => abilityDocumentRoute('学历', '../bad.md')).toThrow();
  });
  it('弹窗列出文档，点击进入独立路由并释放滚动锁', async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<AbilityRadar data={data} />} />
          <Route path="/about/ability/:dimension/:filename" element={<h1>文档阅读页</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: '学历，当前 V，查看文档' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('学历(V)');
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('link', { name: /Index.md/ }));
    expect(await screen.findByText('文档阅读页')).toBeInTheDocument();
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
  });
  it('空维度弹窗可用 Escape 关闭', async () => {
    render(
      <MemoryRouter>
        <AbilityRadar data={{ config: {}, documents: [] }} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: '算法，查看文档' }));
    expect(await screen.findByRole('status')).toHaveTextContent('暂无文档');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('初始 SSR 无客户端依赖且稳定', () => {
    const first = renderToString(
      <MemoryRouter>
        <AbilityRadar data={data} />
      </MemoryRouter>,
    );
    const second = renderToString(
      <MemoryRouter>
        <AbilityRadar data={data} />
      </MemoryRouter>,
    );
    expect(first).toBe(second);
    expect(first).toContain('学历');
    const parsed = new DOMParser().parseFromString(first, 'text/html');
    expect(parsed.querySelector('[data-dimension="学历"]')?.textContent).toBe('学历(V)');
  });
});
