/**
 * heroQuotes 工具函数单元测试。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HERO_QUOTE_SIDE_STORAGE_KEY,
  HERO_QUOTE_RECENT_STORAGE_KEY,
  getHeroQuotesConfig,
  isHeroQuoteSide,
  pickRandomHeroQuote,
  readStoredHeroQuoteSide,
  writeStoredHeroQuoteSide,
} from './heroQuotes';

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

describe('heroQuotes', () => {
  beforeEach(() => {
    memoryStore.clear();
    installMemoryLocalStorage();
  });

  afterEach(() => {
    memoryStore.clear();
  });

  it('isHeroQuoteSide 仅接受 left / right', () => {
    expect(isHeroQuoteSide('left')).toBe(true);
    expect(isHeroQuoteSide('right')).toBe(true);
    expect(isHeroQuoteSide('center')).toBe(false);
    expect(isHeroQuoteSide(null)).toBe(false);
  });

  it('getHeroQuotesConfig 合并内置大词库', () => {
    const config = getHeroQuotesConfig();
    expect(config).not.toBeNull();
    expect(config!.items.length).toBeGreaterThan(40);
    expect(config!.defaultSide === 'left' || config!.defaultSide === 'right').toBe(true);
  });

  it('pickRandomHeroQuote 从列表中返回一条', () => {
    const items = [
      { text: 'a', source: 'A' },
      { text: 'b', source: 'B' },
      { text: 'c', source: 'C' },
    ];
    const picked = pickRandomHeroQuote(items);
    expect(items).toContainEqual(picked);
  });

  it('pickRandomHeroQuote 尽量避开 excludeText', () => {
    const items = [
      { text: 'a', source: 'A' },
      { text: 'b', source: 'B' },
    ];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickRandomHeroQuote(items, 'a').text).toBe('b');
    vi.restoreAllMocks();
  });

  it('pickRandomHeroQuote 写入近期记录并避开重复', () => {
    const items = [
      { text: 'a', source: 'A' },
      { text: 'b', source: 'B' },
      { text: 'c', source: 'C' },
    ];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const first = pickRandomHeroQuote(items);
    expect(first.text).toBe('a');
    expect(JSON.parse(memoryStore.get(HERO_QUOTE_RECENT_STORAGE_KEY) || '[]')).toEqual(['a']);

    // 近期含 a 后，pool 为 [b,c]，random=0 → b
    const second = pickRandomHeroQuote(items);
    expect(second.text).toBe('b');
    vi.restoreAllMocks();
  });

  it('read/writeStoredHeroQuoteSide 持久化左右位置', () => {
    expect(readStoredHeroQuoteSide('right')).toBe('right');
    writeStoredHeroQuoteSide('left');
    expect(window.localStorage.getItem(HERO_QUOTE_SIDE_STORAGE_KEY)).toBe('left');
    expect(readStoredHeroQuoteSide('right')).toBe('left');
  });

  it('损坏的本地存储值回退到 fallback', () => {
    window.localStorage.setItem(HERO_QUOTE_SIDE_STORAGE_KEY, 'middle');
    expect(readStoredHeroQuoteSide('right')).toBe('right');
  });
});
