import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsciiOceanField } from './AsciiOceanField';

describe('AsciiOceanField 渲染与生命周期', () => {
  let reduceMotion = false;
  let hidden = false;
  let nextFrame: FrameRequestCallback | undefined;
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
  };

  beforeEach(() => {
    reduceMotion = false;
    hidden = false;
    nextFrame = undefined;
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      nextFrame = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion') && reduceMotion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('真实字符渲染保留透明背景，前景鲸鱼不会铺满或拦截页面', () => {
    const { container } = render(<AsciiOceanField effect="ascii-whale" />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas).toHaveClass('pointer-events-none', 'z-[30]');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, window.innerWidth, window.innerHeight);
    expect(context.fillText).toHaveBeenCalled();
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.fillText.mock.calls.some(([glyph]) => glyph === '-')).toBe(false);
    expect(context.fillText.mock.calls.every(([, x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(context.fillText.mock.calls.length).toBeLessThan((canvas.width * canvas.height) / (7 * 10));
  });

  it('鱼群选项只绘制小鱼，没有鲸鱼或背景点阵', () => {
    const { container } = render(<AsciiOceanField effect="ascii-fish" />);
    expect(container.querySelector('canvas')).toHaveAttribute('data-atmosphere-effect', 'ascii-fish');
    expect(context.fillText).toHaveBeenCalled();
    expect(context.fillText.mock.calls.every(([glyph]) => glyph === '-')).toBe(true);
    nextFrame?.(performance.now() + 100);
    expect(context.fillRect).not.toHaveBeenCalled();
  });

  it('减少动效时保留静态鲸鱼，不启动动画', () => {
    reduceMotion = true;
    render(<AsciiOceanField effect="ascii-whale" />);
    expect(context.fillText).toHaveBeenCalled();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('隐藏时停止绘制，恢复可见时重启，卸载后释放动画', () => {
    const { unmount } = render(<AsciiOceanField effect="ascii-whale" />);
    expect(window.requestAnimationFrame).toHaveBeenCalled();
    const calls = context.clearRect.mock.calls.length;
    hidden = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    nextFrame?.(performance.now() + 50);
    expect(context.clearRect).toHaveBeenCalledTimes(calls);
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    hidden = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    nextFrame?.(performance.now() + 50);
    expect(context.clearRect.mock.calls.length).toBeGreaterThan(calls);
    unmount();
    const afterUnmount = context.clearRect.mock.calls.length;
    nextFrame?.(performance.now() + 100);
    expect(context.clearRect).toHaveBeenCalledTimes(afterUnmount);
  });
});
