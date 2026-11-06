import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, Pause, Play, RotateCcw, Volume2, VolumeX, Waves } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { createOceanScene } from './ocean/scene';
import { clamp, depthAtTime, DIVE_DURATION, getOceanZone, MAX_DEPTH, timeAtDepth } from './ocean/dive';
import { useOceanAudio } from './ocean/useOceanAudio';

export const Ocean = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion(true);
  const [paused, setPaused] = useState(false);
  const [depth, setDepth] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const progressRef = useRef({ dive: 0, time: 0, pointerX: 0, pointerY: 0, paused: false });
  const repaintRef = useRef<(() => void) | null>(null);
  const isStill = paused || reducedMotion;
  const audio = useOceanAudio(isStill);
  const zone = getOceanZone(depth);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: ReturnType<typeof createOceanScene> = null;
    try {
      scene = createOceanScene(canvas);
    } catch {
      // 渐变海洋与全部操作仍可使用，明确标记动画无法启动。
    }
    setUnavailable(!scene);
    let frame = 0;
    let previous = 0;
    let lastPaint = 0;
    let lastHud = 0;
    let disposed = false;
    let cameraX = 0;
    let cameraY = 0;
    const progress = progressRef.current;
    progress.paused = isStill;

    const paint = () => {
      scene?.render(progress.time, depthAtTime(progress.dive), cameraX, cameraY);
      setDepth(Math.round(depthAtTime(progress.dive)));
    };
    const resize = () => {
      scene?.resize();
      paint();
    };
    repaintRef.current = paint;
    const tick = (now: number) => {
      frame = 0;
      if (disposed || document.hidden) return;
      if (!previous) previous = now;
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (!progress.paused) {
        progress.time += dt;
        progress.dive = Math.min(DIVE_DURATION, progress.dive + dt);
        cameraX += (progress.pointerX - cameraX) * Math.min(1, dt * 2);
        cameraY += (progress.pointerY - cameraY) * Math.min(1, dt * 2);
      }
      if (now - lastPaint >= 1000 / 30) {
        scene?.render(progress.time, depthAtTime(progress.dive), cameraX, cameraY);
        lastPaint = now;
      }
      if (now - lastHud >= 200) {
        setDepth(Math.round(depthAtTime(progress.dive)));
        lastHud = now;
      }
      if (!progress.paused) frame = window.requestAnimationFrame(tick);
    };
    const visibility = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      if (!document.hidden && !progress.paused) frame = window.requestAnimationFrame(tick);
    };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      progress.pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
      progress.pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    const leave = () => {
      progress.pointerX = 0;
      progress.pointerY = 0;
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || (event.target instanceof Element && event.target.closest('button, a, input'))) return;
      progress.dive = timeAtDepth(clamp(depthAtTime(progress.dive) + event.deltaY * 0.22, 0, MAX_DEPTH));
      paint();
    };

    resize();
    visibility();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibility);
    canvas.addEventListener('pointermove', pointer, { passive: true });
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('wheel', wheel, { passive: true });
    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      repaintRef.current = null;
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('pointermove', pointer);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('wheel', wheel);
    };
  }, [isStill]);

  const replay = () => {
    progressRef.current.dive = 0;
    progressRef.current.time = 0;
    setDepth(0);
    setPaused(false);
    repaintRef.current?.();
  };
  const adjustDepth = (value: number) => {
    progressRef.current.dive = timeAtDepth(value);
    setDepth(value);
    repaintRef.current?.();
  };

  return (
    <main className="ocean-page" data-paused={isStill} data-zone={zone.index}>
      <Seo
        title="沉沦之海"
        description="把喧嚣留在海面。在光束、鱼群、鲸与微光水母之间，慢慢坠入一片静谧的深海。支持暂停、深度探索与水下环境音。"
        url="/ocean"
      />
      <canvas ref={canvasRef} className="ocean-canvas" aria-hidden="true" />
      <div className="ocean-grain" aria-hidden="true" />
      <header className="ocean-header">
        <Link to="/" className="ocean-brand" aria-label="D-blog 首页">
          <Waves size={21} strokeWidth={1.3} />
          <span>
            D-blog <span className="ocean-brand-divider">/</span> <span className="ocean-brand-name">沉沦之海</span>
          </span>
        </Link>
        <Link to="/" className="ocean-exit">
          返回海岸 <ArrowUpRight size={16} />
        </Link>
      </header>

      <div
        className="ocean-intro"
        style={{ opacity: clamp(1 - depth / 175), transform: `translate(-50%, ${-Math.min(depth * 0.12, 22)}px)` }}
      >
        <span className="ocean-eyebrow">A LITTLE FURTHER FROM THE WORLD</span>
        <h1>
          沉沦之海<span className="ocean-title-dot">。</span>
        </h1>
        <p>把喧嚣留在海面，向一片深蓝坠落。</p>
        <div className="ocean-entry-mark" aria-hidden="true">
          <span />
          <ArrowDown size={15} />
        </div>
      </div>

      <aside className="ocean-depth" aria-label="当前海洋深度">
        <span className="ocean-depth-label">DEPTH</span>
        <div className="ocean-depth-value">
          <span>{String(depth).padStart(4, '0')}</span>
          <small>m</small>
        </div>
        <div className="ocean-depth-rail" aria-hidden="true">
          <div className="ocean-depth-fill" style={{ height: `${(depth / MAX_DEPTH) * 100}%` }} />
          {[0, 200, 400, 600, 800, 1000, 1200].map((value) => (
            <span key={value} style={{ top: `${(value / MAX_DEPTH) * 100}%` }}>
              <i />
              {value}
            </span>
          ))}
          <div className="ocean-depth-marker" style={{ top: `${(depth / MAX_DEPTH) * 100}%` }} />
        </div>
      </aside>

      <div className="ocean-thought" aria-live="polite" aria-atomic="true">
        <div className="ocean-zone">
          <span className="ocean-zone-dot" />
          {zone.name}
          <span className="ocean-zone-index">0{zone.index + 1} / 04</span>
        </div>
        <p key={zone.name}>{zone.thought}</p>
      </div>

      <footer className="ocean-footer">
        <div className="ocean-controls" aria-label="海洋体验控制">
          <button
            type="button"
            onClick={() => void audio.toggle()}
            aria-label={audio.enabled ? '关闭环境音' : '开启环境音'}
            aria-pressed={audio.enabled}
          >
            {audio.enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
            <span>环境音</span>
          </button>
          <span className="ocean-controls-divider" />
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            disabled={reducedMotion}
            aria-label={isStill ? '继续下沉' : '暂停下沉'}
            aria-pressed={isStill}
          >
            {isStill ? <Play size={16} /> : <Pause size={16} />}
            <span>{isStill ? '继续' : '暂停'}</span>
          </button>
          <button type="button" onClick={replay} aria-label="重新入海">
            <RotateCcw size={16} />
            <span>重新入海</span>
          </button>
        </div>
        <label className="ocean-depth-control">
          <span>{reducedMotion ? '静静看海 · 拖动探索' : '向下滚动，或拖动探索'}</span>
          <input
            type="range"
            min="0"
            max={MAX_DEPTH}
            step="1"
            value={depth}
            onChange={(event) => adjustDepth(Number(event.target.value))}
            aria-label="探索海洋深度"
            aria-valuetext={`${depth} 米，${zone.name}`}
          />
        </label>
      </footer>
      {(audio.error || unavailable) && (
        <p className="ocean-notice" role="status">
          {audio.error || '当前浏览器无法呈现海洋动画，仍可拖动深度，静静看海。'}
        </p>
      )}
      <span className="ocean-coordinate" aria-hidden="true">
        BE STILL. BE HERE.
      </span>
    </main>
  );
};
