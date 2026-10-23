import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => {
  const model = {
    width: 200,
    height: 300,
    scale: { set: vi.fn() },
    anchor: { set: vi.fn() },
    position: { set: vi.fn() },
    internalModel: {
      focusController: { focus: vi.fn() },
      motionManager: { definitions: { TapBody: [{}] } },
    },
    update: vi.fn(),
    motion: vi.fn().mockResolvedValue(true),
    expression: vi.fn().mockResolvedValue(true),
    destroy: vi.fn(),
  };
  const app = {
    stage: { addChild: vi.fn() },
    ticker: { maxFPS: 0, add: vi.fn(), deltaMS: 33 },
    renderer: { render: vi.fn() },
    start: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
  };
  return {
    model,
    app,
    from: vi.fn(),
    application: vi.fn(function () {
      return app;
    }),
  };
});

vi.mock('pixi.js', () => ({ Application: fixtures.application }));
vi.mock('pixi-live2d-display/cubism4', () => ({
  Live2DModel: { from: fixtures.from },
  MotionPreloadStrategy: { NONE: 'NONE' },
}));

describe('Live2D runtime lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fixtures.from.mockResolvedValue(fixtures.model);
    vi.stubGlobal('Live2DCubismCore', {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.querySelectorAll('script[src*="live2dcubismcore"]').forEach((script) => script.remove());
  });

  it('加载模型后按 30fps 更新，暂停关闭渲染，销毁幂等', async () => {
    const { createLive2D } = await import('./live2dRuntime');
    const controller = new AbortController();
    const driver = await createLive2D(
      document.createElement('canvas'),
      '/rin/model.model3.json',
      '/core.js',
      controller.signal,
    );
    expect(fixtures.from).toHaveBeenCalledWith(expect.stringMatching(/\/rin\/model\.model3\.json$/), {
      autoInteract: false,
      autoUpdate: false,
      motionPreload: 'NONE',
    });
    expect(fixtures.app.ticker.maxFPS).toBe(30);
    expect(fixtures.app.start).not.toHaveBeenCalled();
    driver.setPaused(false);
    driver.lookAt(0.5, -0.5);
    expect(fixtures.app.start).toHaveBeenCalledOnce();
    expect(fixtures.model.internalModel.focusController.focus).toHaveBeenCalledWith(0.5, 0.5);
    driver.react();
    expect(fixtures.model.motion).toHaveBeenCalledWith('TapBody');
    driver.setPaused(true);
    driver.lookAt(1, 1);
    driver.react();
    expect(fixtures.model.motion).toHaveBeenCalledOnce();
    expect(fixtures.app.stop).toHaveBeenCalledOnce();
    expect(fixtures.model.internalModel.focusController.focus).toHaveBeenCalledOnce();
    controller.abort();
    driver.destroy();
    expect(fixtures.app.destroy).toHaveBeenCalledExactlyOnceWith(false, {
      children: true,
      texture: true,
      baseTexture: true,
    });
  });

  it('模型请求失败释放已经建立的 WebGL 应用', async () => {
    const { createLive2D } = await import('./live2dRuntime');
    fixtures.from.mockRejectedValue(new Error('404'));
    await expect(
      createLive2D(
        document.createElement('canvas'),
        '/rin/model.model3.json',
        '/core.js',
        new AbortController().signal,
      ),
    ).rejects.toThrow('404');
    expect(fixtures.app.destroy).toHaveBeenCalledOnce();
  });

  it('请求完成前取消，迟到模型和 renderer 都释放', async () => {
    const { createLive2D } = await import('./live2dRuntime');
    let resolveModel!: (model: typeof fixtures.model) => void;
    fixtures.from.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveModel = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = createLive2D(
      document.createElement('canvas'),
      '/rin/model.model3.json',
      '/core.js',
      controller.signal,
    );
    await vi.waitFor(() => expect(fixtures.from).toHaveBeenCalledOnce());
    controller.abort();
    resolveModel(fixtures.model);
    await expect(pending).rejects.toThrow();
    expect(fixtures.model.destroy).toHaveBeenCalledOnce();
    expect(fixtures.app.destroy).toHaveBeenCalledOnce();
    expect(fixtures.app.stage.addChild).not.toHaveBeenCalled();
  });

  it('拒绝外部模型来源，不创建渲染器', async () => {
    const { createLive2D } = await import('./live2dRuntime');
    await expect(
      createLive2D(
        document.createElement('canvas'),
        'https://example.net/model.model3.json',
        '/core.js',
        new AbortController().signal,
      ),
    ).rejects.toThrow('hosted on this site');
    expect(fixtures.application).not.toHaveBeenCalled();
  });

  it('Core 超时会清理 script，允许下一次重试', async () => {
    vi.stubGlobal('Live2DCubismCore', undefined);
    vi.useFakeTimers();
    const { createLive2D } = await import('./live2dRuntime');
    const attempt = () =>
      createLive2D(
        document.createElement('canvas'),
        '/rin/model.model3.json',
        '/live2dcubismcore.min.js',
        new AbortController().signal,
      );
    const first = expect(attempt()).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(12000);
    await first;
    expect(document.querySelector('script[src*="live2dcubismcore"]')).toBeNull();
    const second = expect(attempt()).rejects.toThrow('Unable to load');
    document.querySelector('script[src*="live2dcubismcore"]')?.dispatchEvent(new Event('error'));
    await second;
    expect(fixtures.application).not.toHaveBeenCalled();
  });
});
