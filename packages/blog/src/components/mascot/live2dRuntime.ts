import { assetUrl } from '@/utils/siteUrl';
import type { Live2DModel } from 'pixi-live2d-display';

export interface RinDriver {
  lookAt(x: number, y: number): void;
  react(): void;
  setPaused(paused: boolean): void;
  destroy(): void;
}

let corePromise: Promise<void> | undefined;

/** Deliberately same-origin: models and the licensed Core are supplied by the site owner. */
const localAsset = (path: string): string => {
  const url = new URL(assetUrl(path), window.location.href);
  if (url.origin !== window.location.origin) throw new Error('Live2D assets must be hosted on this site.');
  return url.href;
};

const hasCore = () => Boolean((window as Window & { Live2DCubismCore?: unknown }).Live2DCubismCore);

const loadCore = (path: string): Promise<void> => {
  if (hasCore()) return Promise.resolve();
  if (corePromise) return corePromise;
  corePromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else {
        resolve();
      }
    };
    const timer = window.setTimeout(() => finish(new Error('Live2D Core load timed out.')), 12000);
    script.onload = () => finish(hasCore() ? undefined : new Error('Invalid Live2D Core.'));
    script.onerror = () => finish(new Error('Unable to load Live2D Core.'));
    try {
      script.src = localAsset(path);
      script.async = true;
      document.head.append(script);
    } catch (error) {
      finish(error instanceof Error ? error : new Error('Invalid Core path.'));
    }
  }).catch((error: unknown) => {
    corePromise = undefined;
    throw error;
  });
  return corePromise;
};

export async function createLive2D(
  canvas: HTMLCanvasElement,
  modelPath: string,
  corePath: string,
  signal: AbortSignal,
): Promise<RinDriver> {
  const modelUrl = localAsset(modelPath);
  await loadCore(corePath);
  signal.throwIfAborted();
  // Cubism's module checks the Core global on evaluation, so this must follow loadCore.
  const { Application } = await import('pixi.js');
  const { Live2DModel: Model, MotionPreloadStrategy } = await import('pixi-live2d-display/cubism4');
  signal.throwIfAborted();
  const app = new Application({
    view: canvas,
    width: 240,
    height: 360,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    backgroundAlpha: 0,
    antialias: true,
    autoStart: false,
    sharedTicker: false,
  });
  let model: Live2DModel | undefined;
  let destroyed = false;
  let stopped = true;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    signal.removeEventListener('abort', destroy);
    // Texture resources belong to this instance; stop both model and renderer.
    app.destroy(false, { children: true, texture: true, baseTexture: true });
  };
  signal.addEventListener('abort', destroy, { once: true });
  try {
    model = await Model.from(modelUrl, {
      autoInteract: false,
      autoUpdate: false,
      motionPreload: MotionPreloadStrategy.NONE,
    });
    if (signal.aborted || destroyed) {
      model.destroy({ children: true, texture: true, baseTexture: true });
      signal.throwIfAborted();
      throw new Error('Live2D renderer was disposed.');
    }
    model.scale.set(Math.min(224 / model.width, 344 / model.height));
    model.anchor.set(0.5, 1);
    model.position.set(120, 354);
    app.stage.addChild(model);
    app.ticker.maxFPS = 30;
    app.ticker.add(() => model?.update(app.ticker.deltaMS));
    app.renderer.render(app.stage);
    return {
      lookAt(x, y) {
        if (!destroyed && !stopped) model?.internalModel.focusController.focus(x, -y);
      },
      react() {
        if (destroyed || stopped || !model) return;
        const groups = model.internalModel.motionManager.definitions;
        const group = Object.keys(groups).find((name) => /tap|touch|flick/i.test(name));
        // Different models use different group names; no hard-coded nonexistent motions.
        if (group) void model.motion(group).catch(() => false);
        else void model.expression().catch(() => false);
      },
      setPaused(paused) {
        if (destroyed) return;
        stopped = paused;
        if (paused) app.stop();
        else app.start();
      },
      destroy,
    };
  } catch (error) {
    destroy();
    throw error;
  }
}
