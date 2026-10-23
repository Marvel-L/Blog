import { afterEach, describe, expect, it, vi } from 'vitest';
import { AsciiRenderer, World } from './ocean.mjs';

describe('ASCII 海洋独立场景', () => {
  afterEach(() => vi.restoreAllMocks());

  it('空的大型鱼配置不会回退生成默认锦鲤', () => {
    const world = new World([], { fish: true });
    world.resize(1280, 720, 9, 13);
    expect(world.sharks).toHaveLength(0);
    expect(world.fish.length).toBeGreaterThan(0);
  });

  it.each([
    [375, 667],
    [1280, 720],
    [360, 240],
    [1280, 320],
  ])('鲸鱼在 %s×%s 视口中始终可见，且没有鱼群或蓝色粒子', (width, height) => {
    const context = { setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const renderer = new AsciiRenderer(document.createElement('canvas'));
    renderer.updateSettings({ species: 'whale', dotDensity: 0, cellSize: 7 });
    renderer.resize(width, height, 1);
    const world = new World([{ kind: 'whale', size: 1 }], { fish: false });
    world.resize(width, height, renderer.cellWidth, renderer.cellHeight);
    renderer.world = world;
    expect(world.fish).toHaveLength(0);
    expect(world.sharks).toHaveLength(1);
    // 覆盖完整游动周期；检查实际绘制的字符，避免只验证头部位置。
    for (let sample = 0; sample < 24; sample++) {
      context.fillText.mockClear();
      if (sample > 0) world.step(5);
      renderer.render(world, 1 / 30);
      expect(context.fillText.mock.calls.length).toBeGreaterThan(20);
      expect(context.fillText.mock.calls.every(([, x, y]) => x > 0 && x < width && y > 0 && y < height)).toBe(true);
      expect(context.fillRect).not.toHaveBeenCalled();
    }
  });
});
