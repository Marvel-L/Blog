import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrendChart } from './TrendChart';
import { createCategory, emptyItem } from './model';

const clusteredCategory = () => {
  const category = createCategory('cluster', '双峰数据', 'custom');
  category.threshold.enabled = false;
  category.items = [1, 2, 1000, 1001].map((x, index) => ({
    ...emptyItem(String(index)),
    name: `条目${index + 1}`,
    x,
    y: 100 + index * 20,
  }));
  return category;
};
const pointXs = (chart: HTMLElement) =>
  [...chart.querySelectorAll('[data-trend-item]')].map((point) =>
    Number(point.querySelector('circle')?.getAttribute('cx')),
  );

afterEach(() => vi.unstubAllGlobals());

describe('Trend 双视图', () => {
  it('两端聚集数据在默认视图等距铺开，切到分布图后恢复真实距离且不连线', async () => {
    const user = userEvent.setup();
    render(<TrendChart category={clusteredCategory()} />);
    let chart = screen.getByRole('figure');
    const xs = pointXs(chart);
    expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1]);
    expect(xs[2] - xs[1]).toBeCloseTo(xs[3] - xs[2]);
    expect(chart.querySelectorAll('.trend-comparison-line')).toHaveLength(3);
    expect(chart).toHaveTextContent('条目1');
    await user.click(screen.getByRole('button', { name: '数值分布' }));
    chart = screen.getByRole('figure');
    const scatterXs = pointXs(chart);
    expect(scatterXs[2] - scatterXs[1]).toBeGreaterThan((scatterXs[1] - scatterXs[0]) * 900);
    expect(chart.querySelectorAll('.trend-comparison-line')).toHaveLength(0);
    expect(chart.querySelectorAll('.trend-ant-line')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '对数' }));
    expect(chart).toHaveAttribute('data-scale', 'log');
    expect(pointXs(chart)[1] - pointXs(chart)[0]).toBeGreaterThan(scatterXs[1] - scatterXs[0]);
  });

  it('启用对数后出现零值或非正 X 阈值时退回线性，保留所有点', async () => {
    const user = userEvent.setup();
    const category = clusteredCategory();
    const view = render(<TrendChart category={category} />);
    await user.click(screen.getByRole('button', { name: '数值分布' }));
    await user.click(screen.getByRole('button', { name: '对数' }));
    view.rerender(
      <TrendChart category={{ ...category, items: [{ ...category.items[0], x: 0 }, ...category.items.slice(1)] }} />,
    );
    expect(screen.getByRole('figure')).toHaveAttribute('data-scale', 'linear');
    expect(screen.getByRole('button', { name: '对数' })).toBeDisabled();
    expect(screen.getByRole('figure').querySelectorAll('[data-trend-item]')).toHaveLength(4);
    expect(screen.getByRole('figure').querySelector('svg')?.outerHTML).not.toMatch(/NaN|Infinity/);
    view.rerender(
      <TrendChart category={{ ...category, threshold: { enabled: true, axis: 'x', direction: 'above', value: 0 } }} />,
    );
    expect(screen.getByRole('figure')).toHaveAttribute('data-scale', 'linear');
    expect(screen.getByRole('button', { name: '对数' })).toBeDisabled();
  });

  it('放大画布共享视图选择，Escape 关闭并恢复按钮焦点和页面滚动', async () => {
    const user = userEvent.setup();
    render(<TrendChart category={clusteredCategory()} />);
    await user.click(screen.getByRole('button', { name: '数值分布' }));
    const enlarge = screen.getByRole('button', { name: '放大画布' });
    await user.click(enlarge);
    const dialog = screen.getByRole('dialog', { name: '双峰数据 · 放大画布' });
    expect(document.body.style.overflow).toBe('hidden');
    expect(within(dialog).getByRole('figure')).toHaveAttribute('data-view', 'distribution');
    await user.click(within(dialog).getByRole('button', { name: '等距对比' }));
    const point = within(dialog).getByRole('button', { name: /条目1：/ });
    await user.click(point);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('figure')).toHaveAttribute('data-view', 'comparison');
    expect(document.body.style.overflow).not.toBe('hidden');
    await vi.waitFor(() => expect(enlarge).toHaveFocus());
  });

  it('窄屏横向展开条目但保持适合手机的画布高度，空和同值数据不产生无效坐标', () => {
    let resize!: ResizeObserverCallback;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const category = clusteredCategory();
    const view = render(<TrendChart category={category} />);
    const entry = { contentRect: { width: 360, height: 560 } } as ResizeObserverEntry;
    act(() => resize([entry], {} as ResizeObserver));
    const svg = screen.getByRole('figure').querySelector('svg')!;
    expect(parseFloat(svg.style.width)).toBeGreaterThan(360);
    expect(svg.style.height).toBe('420px');
    const sameValues = { ...category, items: category.items.map((item) => ({ ...item, x: 3, y: 100 })) };
    view.rerender(<TrendChart category={sameValues} />);
    expect(screen.getByRole('figure').querySelector('svg')?.outerHTML).not.toMatch(/NaN|Infinity/);
    view.rerender(<TrendChart category={{ ...category, items: [] }} />);
    expect(screen.getByRole('figure').querySelector('svg')?.outerHTML).not.toMatch(/NaN|Infinity/);
    view.rerender(<TrendChart category={category} compact />);
    expect(screen.queryByRole('button', { name: '等距对比' })).not.toBeInTheDocument();
    expect(screen.getByRole('figure').querySelector('svg')?.style.height).toBe('240px');
  });
});
