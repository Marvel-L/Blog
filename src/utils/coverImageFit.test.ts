import { describe, expect, it } from 'vitest';
import { getCoverObjectFit } from './coverImageFit';

describe('getCoverObjectFit', () => {
  it('缺少尺寸时回退为 cover', () => {
    expect(getCoverObjectFit()).toBe('cover');
    expect(getCoverObjectFit(0, 320)).toBe('cover');
    expect(getCoverObjectFit(640, undefined)).toBe('cover');
  });

  it('常规横图保持 cover', () => {
    expect(getCoverObjectFit(1600, 1000)).toBe('cover');
    expect(getCoverObjectFit(1280, 720)).toBe('cover');
  });

  it('极宽或极高图片改为 contain', () => {
    expect(getCoverObjectFit(684, 284)).toBe('contain');
    expect(getCoverObjectFit(884, 1920)).toBe('contain');
  });
});
