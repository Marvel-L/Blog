import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Ocean } from './Ocean';
import { depthAtTime, timeAtDepth, MAX_DEPTH, DIVE_DURATION } from './ocean/dive';

const { renderScene, createScene } = vi.hoisted(() => {
  const renderScene = vi.fn();
  const createScene = vi.fn(() => ({ resize: vi.fn(), render: renderScene }));
  return { renderScene, createScene };
});
vi.mock('./ocean/scene', () => ({ createOceanScene: createScene }));
vi.mock('@/components/Seo', () => ({ Seo: () => null }));

const oceanTree = () => (
  <MemoryRouter initialEntries={['/ocean']}>
    <Ocean />
  </MemoryRouter>
);

describe('沉沦之海', () => {
  let frames: Map<number, FrameRequestCallback>;
  let frameId: number;
  let now: number;
  let reduced: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    createScene.mockImplementation(() => ({ resize: vi.fn(), render: renderScene }));
    frames = new Map();
    frameId = 0;
    now = 100;
    reduced = false;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: reduced && query.includes('prefers-reduced-motion'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.set(++frameId, callback);
        return frameId;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => frames.delete(id)),
    );
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const advance = (count = 30) => {
    act(() => {
      for (let i = 0; i < count; i++) {
        now += 40;
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback(now));
      }
    });
  };
  const depth = () => Number((screen.getByRole('slider', { name: '探索海洋深度' }) as HTMLInputElement).value);

  it('自动下沉，暂停后保持深度，重新入海回到海面', () => {
    render(oceanTree());
    advance();
    expect(depth()).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '暂停下沉' }));
    const pausedDepth = depth();
    expect(frames.size).toBe(0);
    advance();
    expect(depth()).toBe(pausedDepth);
    fireEvent.click(screen.getByRole('button', { name: '继续下沉' }));
    advance();
    expect(depth()).toBeGreaterThan(pausedDepth);
    fireEvent.click(screen.getByRole('button', { name: '重新入海' }));
    expect(depth()).toBe(0);
    expect(screen.getByRole('button', { name: '暂停下沉' })).toBeInTheDocument();
  });

  it('滑块进入深海，滚轮可以返回浅水区', () => {
    render(oceanTree());
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1100' } });
    expect(depth()).toBe(1100);
    expect(screen.getByText('深蓝之境')).toBeInTheDocument();
    const canvas = document.querySelector('canvas')!;
    fireEvent.wheel(canvas, { deltaY: -3000 });
    expect(depth()).toBe(440);
    expect(screen.getByText('光的尽头')).toBeInTheDocument();
  });

  it('减少动效偏好下不自动播放，但仍可手动探索与重置', () => {
    reduced = true;
    render(oceanTree());
    expect(frames.size).toBe(0);
    expect(screen.getByRole('button', { name: '继续下沉' })).toBeDisabled();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1200' } });
    expect(depth()).toBe(1200);
    expect(renderScene).toHaveBeenLastCalledWith(0, MAX_DEPTH, 0, 0);
    fireEvent.click(screen.getByRole('button', { name: '重新入海' }));
    expect(depth()).toBe(0);
  });

  it('后台停止动画，恢复后不补算后台时间，卸载取消剩余帧', () => {
    const { unmount } = render(oceanTree());
    advance();
    // HUD 每 200ms 更新；这里记录实际绘制深度，避免把显示节流误判为后台推进。
    const before = Math.round(renderScene.mock.calls.at(-1)![1] as number);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(frames.size).toBe(0);
    now += 90000;
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    advance(1);
    expect(depth()).toBe(before);
    advance(30);
    expect(depth() - before).toBeLessThan(40);
    unmount();
    expect(frames.size).toBe(0);
    renderScene.mockClear();
    fireEvent(window, new Event('resize'));
    expect(renderScene).not.toHaveBeenCalled();
  });

  it('Canvas 创建失败时明确反馈，保留返回与深度操作', () => {
    createScene.mockImplementation(() => {
      throw new Error('Canvas unavailable');
    });
    render(oceanTree());
    expect(screen.getByRole('status')).toHaveTextContent('无法呈现海洋动画');
    expect(screen.getByRole('link', { name: /返回海岸/ })).toHaveAttribute('href', '/');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '600' } });
    expect(screen.getByText('静默深海')).toBeInTheDocument();
  });

  it('环境音不可用时反馈失败，不错误地标记开启', async () => {
    vi.stubGlobal('AudioContext', undefined);
    render(oceanTree());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '开启环境音' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('暂时无法开启环境音');
    expect(screen.getByRole('button', { name: '开启环境音' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('SSR 首帧固定在海面，不创建 Canvas 或读取播放时钟', () => {
    const html = renderToString(oceanTree());
    expect(html).toContain('value="0"');
    expect(html).toContain('沉沦之海');
    expect(html).toContain('坠入蔚蓝');
    expect(createScene).not.toHaveBeenCalled();
    expect(html).not.toContain('NaN');
  });

  it('深度与时间转换在海面、分区边界和海底保持可逆且不越界', () => {
    [0, 120, 450, 950, MAX_DEPTH].forEach((value) => {
      expect(depthAtTime(timeAtDepth(value))).toBeCloseTo(value, 6);
    });
    expect(depthAtTime(-1)).toBe(0);
    expect(depthAtTime(DIVE_DURATION + 10)).toBe(MAX_DEPTH);
  });
});
