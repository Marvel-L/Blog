import { clamp, MAX_DEPTH } from './dive';

type Speck = { x: number; y: number; z: number; size: number; phase: number };
const TAU = Math.PI * 2;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const color = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(mix(v, b[i], t))).join(',')})`;

/**
 * 纯 Canvas 场景：通过视差和向上掠过的悬浮物表现下沉。
 * 场景不拥有事件或动画循环，生命周期由页面统一管理。
 */
export const createOceanScene = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;
  const ctx = context;
  let width = 1;
  let height = 1;
  let seed = 84621;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const specks: Speck[] = Array.from({ length: 190 }, () => ({
    x: random(),
    y: random(),
    z: 0.15 + random() * 0.85,
    size: 0.5 + random() * 1.7,
    phase: random() * TAU,
  }));
  const bubbles = Array.from({ length: 28 }, () => ({
    x: random(),
    y: random(),
    radius: 1.5 + random() * 5.5,
    speed: 0.4 + random(),
    phase: random() * TAU,
  }));
  const fish = Array.from({ length: 54 }, () => ({
    x: random() * 0.32,
    y: random() * 0.18,
    size: 3 + random() * 7,
    phase: random() * TAU,
  }));

  const glow = (x: number, y: number, radius: number, rgb: string, opacity: number) => {
    if (opacity <= 0) return;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, radius));
    gradient.addColorStop(0, `rgba(${rgb},${opacity})`);
    gradient.addColorStop(0.4, `rgba(${rgb},${opacity * 0.2})`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };

  const drawFish = (x: number, y: number, size: number, phase: number) => {
    ctx.beginPath();
    ctx.moveTo(x + size, y);
    ctx.quadraticCurveTo(x, y - size * 0.48, x - size * 0.7, y);
    ctx.lineTo(x - size * 1.25, y - size * (0.3 + Math.sin(phase) * 0.12));
    ctx.lineTo(x - size * 1.25, y + size * (0.3 + Math.sin(phase) * 0.12));
    ctx.lineTo(x - size * 0.7, y);
    ctx.quadraticCurveTo(x, y + size * 0.42, x + size, y);
    ctx.fill();
  };

  const drawWhale = (time: number, deep: number, offsetX: number) => {
    const x = width * (0.7 - Math.sin(time * 0.025) * 0.22) + offsetX * 0.4;
    const y = height * (0.5 + Math.sin(time * 0.08) * 0.045);
    const size = Math.min(width * 0.4, 470);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.12 + Math.sin(time * 0.1) * 0.025);
    ctx.scale(size, size);
    ctx.fillStyle = `rgba(${deep > 0.55 ? '11,38,52' : '1,14,27'},${0.25 + deep * 0.4})`;
    ctx.beginPath();
    ctx.moveTo(-1, 0.03);
    ctx.bezierCurveTo(-1.12, -0.14, -0.72, -0.25, -0.36, -0.16);
    ctx.bezierCurveTo(0.1, -0.05, 0.35, 0.03, 0.66, 0.025);
    ctx.quadraticCurveTo(0.79, -0.2, 1, -0.17);
    ctx.quadraticCurveTo(0.92, 0, 0.76, 0.065);
    ctx.quadraticCurveTo(0.94, 0.1, 0.98, 0.25);
    ctx.quadraticCurveTo(0.78, 0.21, 0.63, 0.085);
    ctx.bezierCurveTo(0.15, 0.2, -0.38, 0.31, -0.82, 0.16);
    ctx.quadraticCurveTo(-1.02, 0.13, -1, 0.03);
    ctx.fill();
    ctx.strokeStyle = `rgba(83,151,165,${0.04 + deep * 0.09})`;
    ctx.lineWidth = 0.002;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.25, 0.11);
    ctx.quadraticCurveTo(-0.28, 0.47, 0.16, 0.55);
    ctx.quadraticCurveTo(0.03, 0.27, 0.02, 0.13);
    ctx.fill();
    ctx.fillStyle = `rgba(139,209,211,${0.12 + deep * 0.16})`;
    ctx.beginPath();
    ctx.arc(-0.88, 0.015, 0.005, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(92,153,177,${0.065 + deep * 0.065})`;
    ctx.lineWidth = 0.002;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-0.92 + i * 0.04, 0.07);
      ctx.quadraticCurveTo(-0.63, 0.25 - i * 0.014, -0.14, 0.16 - i * 0.012);
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawJelly = (x: number, y: number, size: number, time: number, opacity: number) => {
    const pulse = 1 + Math.sin(time * 1.4) * 0.06;
    glow(x, y, size * 3.5, '65,177,208', opacity * 0.15);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, 1 / pulse);
    const fill = ctx.createLinearGradient(0, -size, 0, size * 0.4);
    fill.addColorStop(0, `rgba(108,216,235,${opacity * 0.55})`);
    fill.addColorStop(1, `rgba(48,111,147,${opacity * 0.07})`);
    ctx.fillStyle = fill;
    ctx.strokeStyle = `rgba(141,234,246,${opacity * 0.5})`;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.bezierCurveTo(-size * 0.9, -size * 1.25, size * 0.9, -size * 1.25, size, 0);
    ctx.quadraticCurveTo(0, size * 0.25, -size, 0);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const origin = (i / 6 - 0.5) * size * 1.5;
      ctx.beginPath();
      ctx.moveTo(origin, 0);
      for (let j = 1; j <= 18; j++) {
        ctx.lineTo(origin + Math.sin(j * 0.35 + time * 0.65 + i) * size * 0.18, j * size * 0.16);
      }
      ctx.strokeStyle = `rgba(112,212,232,${opacity * (0.18 + (i % 2) * 0.12)})`;
      ctx.stroke();
    }
    ctx.restore();
  };

  return {
    resize() {
      width = Math.max(1, canvas.clientWidth);
      height = Math.max(1, canvas.clientHeight);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    },
    render(time: number, depth: number, pointerX = 0, pointerY = 0) {
      const deep = clamp(depth / MAX_DEPTH);
      const darkness = clamp(depth / 700);
      const surface = Math.exp(-depth / 65);
      const shiftX = pointerX * 24;
      const shiftY = pointerY * 16;
      const backdrop = ctx.createLinearGradient(0, 0, width * 0.2, height);
      backdrop.addColorStop(0, color([32, 139, 161], [4, 22, 39], darkness));
      backdrop.addColorStop(0.43, color([8, 75, 110], [3, 16, 31], darkness));
      backdrop.addColorStop(1, color([3, 31, 63], [2, 9, 20], darkness));
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, width, height);
      glow(width * 0.45 + shiftX, -height * 0.15, height * 1.15, '137,242,234', 0.22 * (1 - darkness));
      glow(width * 0.7, height * 0.82, width * 0.45, '17,86,115', 0.15);

      // 远去的海面：密集的亮色折射线，而不是固定的水平边界。
      if (surface > 0.003) {
        ctx.save();
        ctx.globalAlpha = surface;
        for (let row = 0; row < 30; row++) {
          const y = row * row * 0.16 - depth * 0.8;
          ctx.beginPath();
          for (let x = -20; x < width + 20; x += 12) {
            const ripple = Math.sin(x * 0.012 + time * 0.55 + row * 0.8) * (3 + row * 0.24);
            const ripple2 = Math.sin(x * 0.027 - time * 0.8 + row) * 2.5;
            if (x === -20) ctx.moveTo(x, y + ripple + ripple2);
            else ctx.lineTo(x, y + ripple + ripple2);
          }
          ctx.strokeStyle = `rgba(181,246,239,${0.12 + (row % 4) * 0.09})`;
          ctx.lineWidth = 1 + (row % 3);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 宽窄交替的体积光束，随深度逐渐消失。
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const rays = 1 - clamp(depth / 820);
      for (let i = 0; i < 9; i++) {
        const source = width * (0.04 + i * 0.12) + Math.sin(time * 0.13 + i) * 35 + shiftX;
        const spread = width * (0.045 + (i % 3) * 0.025);
        const light = ctx.createLinearGradient(source, -40, source + width * 0.17, height);
        light.addColorStop(0, `rgba(127,232,225,${rays * (0.045 + (i % 3) * 0.022)})`);
        light.addColorStop(0.6, `rgba(94,184,202,${rays * 0.024})`);
        light.addColorStop(1, 'rgba(65,147,179,0)');
        ctx.fillStyle = light;
        ctx.beginPath();
        ctx.moveTo(source, -40);
        ctx.lineTo(source + spread * 0.2, -40);
        ctx.lineTo(source + width * 0.2 + spread, height);
        ctx.lineTo(source + width * 0.2 - spread * 0.3, height);
        ctx.fill();
      }
      ctx.restore();

      // 侧面的岩壁提供尺度与下沉参照，中间保留开阔水域。
      for (let side = 0; side < 2; side++) {
        for (let layer = 0; layer < 3; layer++) {
          ctx.fillStyle = `rgba(1,10,23,${0.12 + layer * 0.13})`;
          ctx.beginPath();
          ctx.moveTo(side ? width : 0, 0);
          for (let step = 0; step <= 28; step++) {
            const y = (step / 28) * height;
            const rock = Math.sin(step * 0.62 + layer + depth * 0.006) * 0.022;
            const edge = width * (0.015 + layer * 0.028 + (y / height) ** 2 * 0.09 + rock);
            ctx.lineTo(side ? width - edge : edge, y);
          }
          ctx.lineTo(side ? width : 0, height);
          ctx.closePath();
          ctx.fill();
        }
      }

      if (depth > 100) {
        ctx.save();
        ctx.globalAlpha = clamp((depth - 100) / 280) * 0.8;
        drawWhale(time, deep, shiftX);
        ctx.restore();
      }

      const schoolFade = clamp(1 - depth / 850);
      for (let school = 0; school < 3; school++) {
        const startX = (((time * (0.009 + school * 0.003) + school * 0.37) % 1.65) - 0.4) * width;
        const startY = height * (0.24 + school * 0.24) - Math.sin(depth * 0.002) * height * 0.15;
        ctx.fillStyle = `rgba(2,24,42,${0.4 * schoolFade})`;
        fish.forEach((f, index) => {
          if (width < 600 && index % 2) return;
          const x = startX + f.x * width + Math.sin(time * 0.7 + f.phase) * 5 + shiftX * 0.3;
          const y = startY + f.y * height + Math.sin(time * 0.9 + f.phase) * 6 + shiftY * 0.2;
          drawFish(x, y, f.size * (0.5 + school * 0.22), time * 3 + f.phase);
        });
      }

      const jellyFade = clamp((depth - 480) / 380);
      if (jellyFade > 0) {
        for (let i = 0; i < 5; i++) {
          const x = width * (0.16 + i * 0.18) + Math.sin(time * 0.13 + i * 2) * 24 + shiftX * 0.6;
          const y = (((((0.15 + i * 0.21 - time * 0.006) % 1.3) + 1.3) % 1.3) - 0.1) * height;
          drawJelly(x, y, (12 + (i % 3) * 9) * Math.min(width / 700, 1), time + i * 1.5, jellyFade * 0.65);
        }
      }

      // 近处悬浮物移动更快，气泡向上穿过镜头，形成三层视差。
      ctx.save();
      specks.forEach((s, i) => {
        if (width < 600 && i % 2) return;
        const travel = depth * 0.0008 * s.z + time * 0.004 * s.z;
        const x = s.x * width + Math.sin(time * 0.2 + s.phase) * 10 + shiftX * s.z;
        const y = ((((s.y - travel) % 1) + 1) % 1) * height + shiftY * s.z;
        const twinkle = 0.5 + Math.sin(time * 0.7 + s.phase) * 0.25;
        ctx.fillStyle = `rgba(${deep > 0.55 ? '106,219,229' : '200,232,233'},${(0.08 + s.z * 0.25) * twinkle})`;
        ctx.beginPath();
        ctx.arc(x, y, s.size * s.z, 0, TAU);
        ctx.fill();
      });
      bubbles.forEach((b) => {
        const travel = depth * 0.003 * b.speed + time * 0.026 * b.speed;
        const x = b.x * width + Math.sin(time * 0.5 + b.phase) * 18 + shiftX;
        const y = (((((b.y - travel) % 1.25) + 1.25) % 1.25) - 0.1) * height;
        const radius = b.radius * (1.2 - deep * 0.45);
        ctx.strokeStyle = `rgba(176,234,241,${0.1 + (1 - deep) * 0.17})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(216,255,255,${0.18 + (1 - deep) * 0.25})`;
        ctx.beginPath();
        ctx.arc(x - radius * 0.12, y - radius * 0.12, radius * 0.7, 3.5, 4.7);
        ctx.stroke();
      });
      ctx.restore();

      const vignette = ctx.createRadialGradient(
        width * 0.5,
        height * 0.4,
        height * 0.12,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.7,
      );
      vignette.addColorStop(0, 'rgba(0,5,15,0)');
      vignette.addColorStop(0.65, 'rgba(0,5,15,0.09)');
      vignette.addColorStop(1, 'rgba(0,5,15,0.68)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    },
  };
};
