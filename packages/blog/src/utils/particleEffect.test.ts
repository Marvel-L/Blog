import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ATMOSPHERE_EFFECTS,
  PARTICLE_EFFECT_STORAGE_KEY,
  readStoredAtmosphereEffects,
  toggleAtmosphereEffect,
  writeStoredAtmosphereEffects,
} from './particleEffect';

describe('氛围特效选择与存储', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('开启第二个，拒绝第三个，再次点击选中项可移除直至全部关闭', () => {
    const two = toggleAtmosphereEffect(['sakura'], 'ascii-whale');
    expect(two).toEqual(['sakura', 'ascii-whale']);
    expect(toggleAtmosphereEffect(two, 'rain')).toBe(two);
    expect(toggleAtmosphereEffect(two, 'ascii-whale')).toEqual(['sakura']);
    expect(toggleAtmosphereEffect(['sakura'], 'sakura')).toEqual([]);
  });

  it.each(['rain', 'heavy-rain', 'sakura', 'fireflies'])('恢复旧版 %s 单选设置', (effect) => {
    localStorage.setItem(PARTICLE_EFFECT_STORAGE_KEY, effect);
    expect(readStoredAtmosphereEffects()).toEqual([effect]);
  });

  it('组合和全部关闭都能持久化并恢复', () => {
    writeStoredAtmosphereEffects(['ascii-whale', 'rain']);
    expect(readStoredAtmosphereEffects()).toEqual(['ascii-whale', 'rain']);
    writeStoredAtmosphereEffects([]);
    expect(readStoredAtmosphereEffects()).toEqual([]);
  });

  it('恢复时过滤未知项、去重，并限制为两个', () => {
    localStorage.setItem(PARTICLE_EFFECT_STORAGE_KEY, '["unknown","rain","rain","ascii-whale","sakura",null]');
    expect(readStoredAtmosphereEffects()).toEqual(['rain', 'ascii-whale']);
  });

  it.each([null, 'invalid json', '{"effects":["rain"]}'])('缺失或损坏的存储 %s 使用默认值', (value) => {
    if (value !== null) localStorage.setItem(PARTICLE_EFFECT_STORAGE_KEY, value);
    expect(readStoredAtmosphereEffects()).toEqual(DEFAULT_ATMOSPHERE_EFFECTS);
  });

  it('浏览器不允许读写存储时，切换仍可使用', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    try {
      expect(readStoredAtmosphereEffects()).toEqual(DEFAULT_ATMOSPHERE_EFFECTS);
      expect(() => writeStoredAtmosphereEffects(['ascii-whale'])).not.toThrow();
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });
});
