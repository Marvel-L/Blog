/**
 * HeroQuote 组件测试：随机展示、换一句、左右切换。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeroQuote } from './HeroQuote';
import { HERO_QUOTE_SIDE_STORAGE_KEY } from '@/utils/heroQuotes';

const memoryStore = new Map<string, string>();

const installMemoryLocalStorage = () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memoryStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryStore.set(key, String(value));
      },
      removeItem: (key: string) => {
        memoryStore.delete(key);
      },
      clear: () => {
        memoryStore.clear();
      },
    },
  });
};

describe('HeroQuote', () => {
  beforeEach(() => {
    memoryStore.clear();
    installMemoryLocalStorage();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    memoryStore.clear();
  });

  it('挂载后展示一句诗词或名言', async () => {
    const onSideChange = vi.fn();
    render(<HeroQuote side="right" onSideChange={onSideChange} />);
    expect(await screen.findByRole('figure', { name: '每日诗词与名言' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '换一句诗词或名言' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '移到标题左侧' })).toBeInTheDocument();
  });

  it('点击左右切换写入 localStorage 并回调', async () => {
    const user = userEvent.setup();
    const onSideChange = vi.fn();
    render(<HeroQuote side="right" onSideChange={onSideChange} />);
    await screen.findByRole('figure', { name: '每日诗词与名言' });
    await user.click(screen.getByRole('button', { name: '移到标题左侧' }));
    expect(onSideChange).toHaveBeenCalledWith('left');
    expect(window.localStorage.getItem(HERO_QUOTE_SIDE_STORAGE_KEY)).toBe('left');
  });

  it('点击换一句仍保持 figure 可见', async () => {
    const user = userEvent.setup();
    render(<HeroQuote side="left" onSideChange={vi.fn()} />);
    await screen.findByRole('figure', { name: '每日诗词与名言' });
    await user.click(screen.getByRole('button', { name: '换一句诗词或名言' }));
    expect(screen.getByRole('figure', { name: '每日诗词与名言' })).toBeInTheDocument();
  });
});
