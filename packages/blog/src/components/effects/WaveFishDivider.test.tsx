import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaveFishDivider } from './WaveFishDivider';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }));

let observeVisibility: (entries: Array<{ isIntersecting: boolean }>) => void;
const disconnect = vi.fn();

beforeEach(() => {
  motion.reduced = false;
  vi.useFakeTimers();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: typeof observeVisibility) {
        observeVisibility = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  disconnect.mockClear();
});

describe('WaveFishDivider', () => {
  it('点击水面附近引出鱼跃和独立的起落水花，动画结束后清理', () => {
    const { container } = render(<WaveFishDivider />);
    const scene = container.querySelector('.wave-fish-divider__scene')!;
    vi.spyOn(scene, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 500 } as DOMRect);
    fireEvent.click(screen.getByRole('button', { name: '轻触水面，让小鱼跃起' }), { clientX: 500, detail: 1 });
    const event = container.querySelector('.wave-fish-divider__event') as HTMLElement;
    expect(event.style.left).toBe('80%');
    expect(event.style.getPropertyValue('--leap-direction')).toBe('-1');
    expect(event.style.getPropertyValue('--leap-distance')).toBe('120px');
    expect(event.querySelector('.wave-fish-divider__fish')).not.toBeNull();
    expect(event.querySelectorAll('.wave-fish-divider__impact')).toHaveLength(2);
    // jsdom 没有 AnimationEvent，React 初始化时可能选择 WebKit 事件名。
    const endAnimation = (target: Element) => {
      fireEvent.animationEnd(target);
      fireEvent(target, new Event('webkitAnimationEnd', { bubbles: true }));
    };
    endAnimation(event.querySelector('.wave-fish-divider__fish')!);
    expect(container.querySelector('.wave-fish-divider__event')).toBe(event);
    endAnimation(event);
    expect(container.querySelector('.wave-fish-divider__event')).toBeNull();
  });

  it('键盘可触发，密集点击最多保留三次效果', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const { container } = render(<WaveFishDivider />);
    const button = screen.getByRole('button');
    button.focus();
    await user.keyboard('{Enter}');
    expect(container.querySelector('.wave-fish-divider__fish')).not.toBeNull();
    for (let index = 0; index < 10; index += 1) fireEvent.click(button);
    expect(container.querySelectorAll('.wave-fish-divider__event')).toHaveLength(3);
  });

  it('不可见时暂停鱼跃，回到视口后恢复，卸载清除监听与定时器', () => {
    const { container, unmount } = render(<WaveFishDivider variant="fish" />);
    act(() => observeVisibility([{ isIntersecting: false }]));
    expect(container.firstChild).toHaveAttribute('data-paused', 'true');
    act(() => vi.advanceTimersByTime(10000));
    expect(container.querySelector('.wave-fish-divider__event')).toBeNull();
    act(() => observeVisibility([{ isIntersecting: true }]));
    act(() => vi.advanceTimersByTime(1800));
    expect(container.querySelector('.wave-fish-divider__fish')).not.toBeNull();
    const remove = vi.spyOn(document, 'removeEventListener');
    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('减少动效时不自动跳鱼，点击仅显示静态涟漪', () => {
    motion.reduced = true;
    const { container } = render(<WaveFishDivider variant="fish" />);
    act(() => vi.advanceTimersByTime(10000));
    expect(container.querySelector('.wave-fish-divider__event')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '轻触水面，泛起静态涟漪' }));
    expect(container.querySelector('.wave-fish-divider__ripple')).not.toBeNull();
    expect(container.querySelector('.wave-fish-divider__fish')).toBeNull();
  });

  it('同页 SVG 渐变 ID 唯一，SSR 只输出水面和可访问交互入口', () => {
    const html = renderToString(
      <>
        <WaveFishDivider />
        <WaveFishDivider variant="fish" />
      </>,
    );
    const gradientIds = Array.from(html.matchAll(/<linearGradient id="([^"]+)"/g), (match) => match[1]);
    expect(new Set(gradientIds).size).toBe(2);
    gradientIds.forEach((id) => expect(html).toContain(`url(#${id})`));
    expect(html).not.toContain('wave-fish-divider__event');
    expect(html).toContain('轻触水面，让小鱼跃起');
  });

  it('关闭交互后作为纯装饰隐藏，不增加键盘入口', () => {
    const { container } = render(<WaveFishDivider interactive={false} />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
