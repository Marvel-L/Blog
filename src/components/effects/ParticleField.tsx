/**
 * 全屏氛围粒子层（Canvas）：小雨 / 大雨 / 樱花 / 萤火虫。
 * - pointer-events: none，不拦截点击
 * - 尊重 prefers-reduced-motion：静态稀疏粒子，不跑 rAF
 * - 页面隐藏时暂停循环，降低后台耗电
 */

import { useEffect, useRef, type FC } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { ParticleEffectId } from '@/utils/particleEffect';

interface ParticleFieldProps {
  effect: ParticleEffectId;
  /** 阅读模式等场景可强制关闭 */
  enabled?: boolean;
}

type RainDrop = {
  kind: 'rain';
  x: number;
  y: number;
  len: number;
  speed: number;
  thickness: number;
  opacity: number;
};

type SakuraPetal = {
  kind: 'sakura';
  x: number;
  y: number;
  size: number;
  speedY: number;
  drift: number;
  swing: number;
  swingSpeed: number;
  phase: number;
  rotate: number;
  rotateSpeed: number;
  opacity: number;
};

type Firefly = {
  kind: 'firefly';
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
  pulseSpeed: number;
  baseOpacity: number;
};

type Particle = RainDrop | SakuraPetal | Firefly;

const isDarkMode = () => document.documentElement.classList.contains('dark');

const createRain = (width: number, height: number, heavy: boolean): RainDrop[] => {
  const count = heavy
    ? Math.min(220, Math.floor((width * height) / 5500))
    : Math.min(90, Math.floor((width * height) / 14000));
  return Array.from({ length: count }, () => ({
    kind: 'rain' as const,
    x: Math.random() * width,
    y: Math.random() * height,
    len: heavy ? 14 + Math.random() * 18 : 8 + Math.random() * 12,
    speed: heavy ? 11 + Math.random() * 10 : 5 + Math.random() * 5,
    thickness: heavy ? 1.2 + Math.random() * 0.8 : 0.8 + Math.random() * 0.5,
    opacity: heavy ? 0.28 + Math.random() * 0.35 : 0.18 + Math.random() * 0.28,
  }));
};

const createSakura = (width: number, height: number): SakuraPetal[] => {
  const count = Math.min(48, Math.floor((width * height) / 28000));
  return Array.from({ length: count }, () => ({
    kind: 'sakura' as const,
    x: Math.random() * width,
    y: Math.random() * height,
    size: 4 + Math.random() * 6,
    speedY: 0.35 + Math.random() * 0.55,
    drift: 0.2 + Math.random() * 0.45,
    swing: 12 + Math.random() * 22,
    swingSpeed: 0.008 + Math.random() * 0.012,
    phase: Math.random() * Math.PI * 2,
    rotate: Math.random() * Math.PI * 2,
    rotateSpeed: (Math.random() - 0.5) * 0.03,
    opacity: 0.45 + Math.random() * 0.4,
  }));
};

const createFireflies = (width: number, height: number): Firefly[] => {
  const count = Math.min(36, Math.floor((width * height) / 36000));
  return Array.from({ length: count }, () => ({
    kind: 'firefly' as const,
    x: Math.random() * width,
    y: Math.random() * height,
    r: 1.2 + Math.random() * 2.2,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    phase: Math.random() * Math.PI * 2,
    pulseSpeed: 0.015 + Math.random() * 0.025,
    baseOpacity: 0.35 + Math.random() * 0.45,
  }));
};

const spawnForEffect = (effect: ParticleEffectId, width: number, height: number): Particle[] => {
  switch (effect) {
    case 'rain':
      return createRain(width, height, false);
    case 'heavy-rain':
      return createRain(width, height, true);
    case 'sakura':
      return createSakura(width, height);
    case 'fireflies':
      return createFireflies(width, height);
  }
};

const drawPetal = (ctx: CanvasRenderingContext2D, petal: SakuraPetal, dark: boolean) => {
  ctx.save();
  ctx.translate(petal.x + Math.sin(petal.phase) * petal.swing, petal.y);
  ctx.rotate(petal.rotate);
  ctx.scale(1, 0.65);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(
    petal.size * 0.55,
    -petal.size * 0.55,
    petal.size,
    -petal.size * 0.15,
    petal.size * 0.15,
    petal.size * 0.55,
  );
  ctx.bezierCurveTo(-petal.size * 0.35, petal.size * 0.35, -petal.size * 0.45, -petal.size * 0.25, 0, 0);
  ctx.closePath();
  ctx.fillStyle = dark ? `rgba(244, 194, 210, ${petal.opacity})` : `rgba(244, 163, 185, ${petal.opacity})`;
  ctx.fill();
  ctx.restore();
};

const paintFrame = (
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  width: number,
  height: number,
  effect: ParticleEffectId,
  animate: boolean,
) => {
  ctx.clearRect(0, 0, width, height);
  const dark = isDarkMode();

  if (effect === 'rain' || effect === 'heavy-rain') {
    const wind = effect === 'heavy-rain' ? 2.2 : 1.1;
    for (const p of particles) {
      if (p.kind !== 'rain') continue;
      if (animate) {
        p.y += p.speed;
        p.x += wind;
        if (p.y > height + p.len) {
          p.y = -p.len;
          p.x = Math.random() * width;
        }
        if (p.x > width + 20) {
          p.x = -20;
        }
      }
      ctx.strokeStyle = dark ? `rgba(186, 230, 253, ${p.opacity})` : `rgba(100, 116, 139, ${p.opacity})`;
      ctx.lineWidth = p.thickness;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + wind * 1.6, p.y + p.len);
      ctx.stroke();
    }
    return;
  }

  if (effect === 'sakura') {
    for (const p of particles) {
      if (p.kind !== 'sakura') continue;
      if (animate) {
        p.y += p.speedY;
        p.x += p.drift * 0.35;
        p.phase += p.swingSpeed;
        p.rotate += p.rotateSpeed;
        if (p.y > height + 20) {
          p.y = -20;
          p.x = Math.random() * width;
        }
        if (p.x > width + 30) {
          p.x = -30;
        }
      }
      drawPetal(ctx, p, dark);
    }
    return;
  }

  // fireflies
  for (const p of particles) {
    if (p.kind !== 'firefly') continue;
    if (animate) {
      p.x += p.vx;
      p.y += p.vy;
      p.phase += p.pulseSpeed;
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;
      if (p.y < -10) p.y = height + 10;
      if (p.y > height + 10) p.y = -10;
      // 轻微随机游走
      if (Math.random() < 0.02) {
        p.vx += (Math.random() - 0.5) * 0.12;
        p.vy += (Math.random() - 0.5) * 0.12;
        p.vx = Math.max(-0.55, Math.min(0.55, p.vx));
        p.vy = Math.max(-0.55, Math.min(0.55, p.vy));
      }
    }
    const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(p.phase));
    const alpha = p.baseOpacity * pulse * (dark ? 1 : 0.75);
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
    glow.addColorStop(0, dark ? `rgba(250, 250, 120, ${alpha})` : `rgba(132, 204, 22, ${alpha * 0.85})`);
    glow.addColorStop(0.35, dark ? `rgba(190, 242, 100, ${alpha * 0.45})` : `rgba(163, 230, 53, ${alpha * 0.35})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const ParticleField: FC<ParticleFieldProps> = ({ effect, enabled = true }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      return;
    }

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let rafId = 0;
    let running = true;
    const animate = !shouldReduceMotion;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = spawnForEffect(effect, width, height);
      paintFrame(ctx, particles, width, height, effect, false);
    };

    const tick = () => {
      if (!running) {
        return;
      }
      paintFrame(ctx, particles, width, height, effect, true);
      rafId = window.requestAnimationFrame(tick);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        running = false;
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
        return;
      }
      if (animate && !rafId) {
        running = true;
        rafId = window.requestAnimationFrame(tick);
      }
    };

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', handleVisibility);

    if (animate) {
      rafId = window.requestAnimationFrame(tick);
    }

    return () => {
      running = false;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [effect, enabled, shouldReduceMotion]);

  if (!enabled) {
    return null;
  }

  return (
    <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[1] h-full w-full" aria-hidden="true" />
  );
};
