import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Planner } from './Planner';

vi.mock('@/components/Seo', () => ({ Seo: () => null }));
vi.mock('./planner/PlannerSync', () => ({ default: () => <section aria-label="月度计划同步">同步状态</section> }));

const markdown = '# Monthly Planner\n\n## 2026-01\n\n- [ ] 保留原待办 <!-- id:existing -->\n';
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(markdown)),
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mountJanuary = async () => {
  const view = render(<Planner />);
  await screen.findByRole('region', { name: '月度计划同步' });
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2026' } });
  fireEvent.click(screen.getByRole('button', { name: /01\s*JAN/ }));
  await screen.findByText('保留原待办');
  return view;
};

describe('Planner 紧凑顶部', () => {
  it('移除可见大标题、说明与时钟占位，直接展示年份工具栏并保留进度与月份', async () => {
    const { container } = await mountJanuary();
    const page = container.querySelector('.planner-page')!;
    expect(page.querySelector('.planner-hero, .planner-clock')).toBeNull();
    expect(screen.queryByText('TWELVE MONTHS / ONE CLEAR VIEW')).not.toBeInTheDocument();
    expect(screen.queryByText('把一年拆成十二个可完成的月份。')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '当前时间' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '月度规划' })).toHaveClass('sr-only');
    expect(page.firstElementChild).toHaveClass('sr-only');
    expect(page.children[1]).toHaveClass('planner-toolbar');
    expect(screen.getByRole('progressbar', { name: 'MONTH任务完成率' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('navigation', { name: '2026 年月份' }).querySelectorAll('button')).toHaveLength(12);
    expect(screen.getByRole('button', { name: '导出副本' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Monthly Task' })).toBeInTheDocument();
  });

  it('原待办仍可新增、完成和删除，进度随真实操作更新', async () => {
    await mountJanuary();
    fireEvent.click(screen.getByRole('button', { name: '完成 保留原待办' }));
    expect(screen.getByRole('progressbar', { name: 'MONTH任务完成率' })).toHaveAttribute('aria-valuenow', '100');
    fireEvent.change(screen.getByRole('textbox', { name: '新增月度待办' }), { target: { value: '新增验证待办' } });
    fireEvent.click(screen.getByRole('button', { name: '新增' }));
    expect(screen.getByText('新增验证待办')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'MONTH任务完成率' })).toHaveAttribute('aria-valuenow', '50');
    fireEvent.click(screen.getByRole('button', { name: '删除 新增验证待办' }));
    expect(screen.queryByText('新增验证待办')).not.toBeInTheDocument();
    expect(screen.getByText('保留原待办')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('progressbar', { name: 'MONTH任务完成率' })).toHaveAttribute('aria-valuenow', '100'),
    );
  });

  it('SSR 首帧不包含时钟与大标题区域，也不发起读写请求', () => {
    const html = renderToString(<Planner />);
    expect(html).not.toContain('planner-hero');
    expect(html).not.toContain('planner-clock');
    expect(html).toContain('class="sr-only">月度规划</h1>');
    expect(fetch).not.toHaveBeenCalled();
  });
});
