/**
 * 透明前景字符鲸鱼 / 鱼群：独立选择，复用 dsh-ascii-ocean 字符渲染。
 * 按需加载，最多 30fps；后台暂停，减少动效时只绘制静态画面。
 */
import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { AsciiOceanEffectId } from '@/utils/particleEffect';
import { AsciiRenderer, World } from './ascii-ocean/ocean.mjs';

const STEP = 1 / 60;
const FRAME_INTERVAL = 1000 / 30;
const INTERACTIVE_SELECTOR =
  'a, button, input, textarea, select, label, summary, [contenteditable], [role="button"], [role="dialog"], nav';

export const AsciiOceanField = ({ effect }: { effect: AsciiOceanEffectId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: AsciiRenderer;
    try {
      renderer = new AsciiRenderer(canvas);
    } catch {
      // 不支持 Canvas 的环境保留页面与其它特效。
      return;
    }
    const world = new World(effect === 'ascii-whale' ? [{ kind: 'whale', size: 1 }] : [], {
      fish: effect === 'ascii-fish',
    });
    renderer.world = world;
    let rafId = 0;
    let lastFrame = 0;
    let accumulator = 0;
    let disposed = false;

    const paint = (dt = 0) => renderer.render(world, dt);
    const syncPalette = () => {
      const dark = document.documentElement.classList.contains('dark');
      renderer.updateSettings({
        species: effect === 'ascii-whale' ? 'whale' : 'fish',
        whaleColor: dark ? '#93c5fd' : '#216385',
        dotPrimary: dark ? '#38bdf8' : '#33718e',
        dotSecondary: dark ? '#a5cbea' : '#53869a',
        dotDensity: 0,
        accent: dark ? '#67e8f9' : '#168a99',
      });
      paint();
    };
    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (width < 1 || height < 1) return;
      renderer.updateSettings({
        species: effect === 'ascii-whale' ? 'whale' : 'fish',
        cellSize: Math.max(7, Math.min(12, Math.round(width / 150))),
      });
      renderer.resize(width, height, Math.min(window.devicePixelRatio || 1, 2));
      world.resize(width, height, renderer.cellWidth, renderer.cellHeight);
      paint();
    };

    const tick = (now: number) => {
      rafId = 0;
      if (disposed || document.hidden) return;
      const elapsed = now - lastFrame;
      if (elapsed >= FRAME_INTERVAL) {
        lastFrame = now;
        accumulator += Math.min(elapsed / 1000, STEP * 4);
        while (accumulator >= STEP) {
          world.step(STEP);
          accumulator -= STEP;
        }
        paint(Math.min(elapsed / 1000, STEP * 4));
      }
      rafId = window.requestAnimationFrame(tick);
    };
    const handleVisibility = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      world.pointer.active = false;
      accumulator = 0;
      if (!document.hidden && !reduceMotion && !disposed) {
        lastFrame = performance.now();
        rafId = window.requestAnimationFrame(tick);
      }
    };
    const isInteractive = (target: EventTarget | null) =>
      target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
    const handlePointerMove = (event: PointerEvent) => {
      world.pointer.x = event.clientX;
      world.pointer.y = event.clientY;
      world.pointer.active = event.pointerType !== 'touch' && !isInteractive(event.target);
    };
    const handlePointerLeave = () => {
      world.pointer.active = false;
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button === 0 && !isInteractive(event.target)) {
        world.ripple(event.clientX, event.clientY);
      }
    };

    resize();
    syncPalette();
    const themeObserver = new MutationObserver(syncPalette);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', handleVisibility);
    if (!reduceMotion) {
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      window.addEventListener('pointerdown', handlePointerDown, { passive: true });
      document.documentElement.addEventListener('pointerleave', handlePointerLeave);
    }
    handleVisibility();

    return () => {
      disposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      themeObserver.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [effect, reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      data-atmosphere-effect={effect}
      className="pointer-events-none fixed inset-0 z-[30] h-full w-full opacity-80 dark:opacity-75 print:hidden"
      aria-hidden="true"
    />
  );
};
