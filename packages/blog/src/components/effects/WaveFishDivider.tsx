/**
 * 连续水波与鱼跃：SVG 水面、CSS 弧线与落水涟漪。
 * 仅在可见时安排鱼跃；交互限定局部更新，指针位置用 rAF 写入 CSS。
 */
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FC } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

type WaveFishDividerVariant = 'wave' | 'fish';

interface WaveFishDividerProps {
  variant?: WaveFishDividerVariant;
  className?: string;
  /** 无障碍：装饰性，默认隐藏 */
  decorative?: boolean;
  /** 点击 / 键盘引出鱼跃，悬停泛起涟漪。 */
  interactive?: boolean;
}

type WaterEvent = {
  id: number;
  x: number;
  direction: number;
  distance: number;
  fish: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const WAVE_PATH =
  'M0 66 C150 50 450 82 600 66 C750 50 1050 82 1200 66 C1350 50 1650 82 1800 66 C1950 50 2250 82 2400 66';
const DROPS = [
  [-22, -16],
  [-8, -25],
  [10, -22],
  [23, -14],
] as const;

export const WaveFishDivider: FC<WaveFishDividerProps> = ({
  variant = 'wave',
  className = '',
  decorative = true,
  interactive = true,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const fillId = `water-fill-${useId().replace(/:/g, '')}`;
  const sceneRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const serialRef = useRef(0);
  const cycleRef = useRef(0);
  const [active, setActive] = useState(true);
  const [events, setEvents] = useState<WaterEvent[]>([]);

  const play = useCallback((x: number, fish: boolean) => {
    const width = sceneRef.current?.getBoundingClientRect().width || 600;
    const distance = Math.min(140, width * 0.24);
    const direction = x > 0.55 ? -1 : 1;
    const id = ++serialRef.current;
    setEvents((previous) => [
      ...previous.slice(-2),
      {
        id,
        x: clamp(x, 0.08, 0.92),
        distance,
        direction,
        fish,
      },
    ]);
  }, []);

  useEffect(() => {
    let inView = true;
    const update = () => setActive(inView && !document.hidden);
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting;
            update();
          });
    if (sceneRef.current) observer?.observe(sceneRef.current);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  useEffect(() => {
    if (!active || shouldReduceMotion || variant !== 'fish') return;
    let timer: number;
    const leap = () => {
      const step = cycleRef.current++ % 4;
      play([0.22, 0.76, 0.38, 0.64][step], true);
      timer = window.setTimeout(leap, [6400, 8200, 7100, 9200][step]);
    };
    timer = window.setTimeout(leap, 1800);
    return () => window.clearTimeout(timer);
  }, [active, play, shouldReduceMotion, variant]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const pointerX = (clientX: number) => {
    const bounds = sceneRef.current?.getBoundingClientRect();
    return bounds?.width ? clamp((clientX - bounds.left) / bounds.width, 0, 1) : 0.5;
  };

  return (
    <div
      className={`wave-fish-divider relative w-full ${className}`}
      data-paused={!active || shouldReduceMotion ? 'true' : undefined}
      data-reduced-motion={shouldReduceMotion ? 'true' : undefined}
      aria-hidden={!interactive && decorative ? true : undefined}
      role={!interactive && decorative ? 'presentation' : undefined}
    >
      <div
        ref={sceneRef}
        className="wave-fish-divider__scene"
        onPointerEnter={
          interactive
            ? (event) => {
                if (event.pointerType === 'mouse' && !shouldReduceMotion) play(pointerX(event.clientX), false);
              }
            : undefined
        }
        onPointerMove={
          interactive
            ? (event) => {
                if (shouldReduceMotion || event.pointerType === 'touch') return;
                const clientX = event.clientX;
                if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
                frameRef.current = window.requestAnimationFrame(() => {
                  frameRef.current = null;
                  sceneRef.current?.style.setProperty('--water-focus-x', `${pointerX(clientX) * 100}%`);
                });
              }
            : undefined
        }
      >
        <svg className="wave-fish-divider__svg" viewBox="0 0 1200 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.1" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="wave-fish-divider__breath">
            <g className="wave-fish-divider__flow wave-fish-divider__flow--back">
              <path d={`${WAVE_PATH} L2400 100 L0 100 Z`} fill={`url(#${fillId})`} />
              <path
                d={WAVE_PATH}
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.22"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </g>
            <g className="wave-fish-divider__flow wave-fish-divider__flow--front">
              <path
                d={WAVE_PATH}
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.48"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
            </g>
            <g className="wave-fish-divider__flow wave-fish-divider__flow--light">
              <path
                d={WAVE_PATH}
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.14"
                strokeWidth="0.8"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </g>
        </svg>
        <span className="wave-fish-divider__gleam" aria-hidden="true" />
        {events.map((event) => (
          <span
            key={event.id}
            className="wave-fish-divider__event"
            aria-hidden="true"
            style={
              {
                left: `${event.x * 100}%`,
                '--leap-distance': `${event.distance}px`,
                '--leap-direction': event.direction,
                '--leap-height': `${[36, 42, 39][event.id % 3]}px`,
              } as CSSProperties
            }
            onAnimationEnd={(animation) => {
              if (animation.target === animation.currentTarget) {
                setEvents((previous) => previous.filter((item) => item.id !== event.id));
              }
            }}
          >
            <WaterImpact />
            {event.fish && !shouldReduceMotion && (
              <>
                <span className="wave-fish-divider__direction">
                  <span className="wave-fish-divider__travel">
                    <span className="wave-fish-divider__fish">
                      <FishSilhouette />
                    </span>
                  </span>
                </span>
                <WaterImpact landing />
              </>
            )}
          </span>
        ))}
        {interactive && (
          <button
            type="button"
            className="wave-fish-divider__interaction"
            aria-label={shouldReduceMotion ? '轻触水面，泛起静态涟漪' : '轻触水面，让小鱼跃起'}
            onClick={(event) => play(event.detail === 0 ? 0.5 : pointerX(event.clientX), true)}
          >
            <span className="wave-fish-divider__hint" aria-hidden="true">
              轻触水面
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

const WaterImpact = ({ landing = false }: { landing?: boolean }) => (
  <span className={`wave-fish-divider__impact${landing ? ' wave-fish-divider__impact--landing' : ''}`}>
    <span className="wave-fish-divider__ripple" />
    <span className="wave-fish-divider__ripple wave-fish-divider__ripple--echo" />
    {DROPS.map(([x, y], index) => (
      <span
        key={index}
        className="wave-fish-divider__drop"
        style={{ '--drop-x': `${x}px`, '--drop-y': `${y}px` } as CSSProperties}
      />
    ))}
  </span>
);

const FishSilhouette = () => (
  <svg viewBox="-20 -10 40 20" width="36" height="18" aria-hidden="true">
    <path className="wave-fish-divider__tail" d="M-10 0 L-19 -6 L-16 0 L-19 6 Z" fill="currentColor" />
    <path d="M-12 0 Q-1 -9 14 -1 Q17 0 14 2 Q0 9 -12 0Z" fill="currentColor" />
    <path d="M-3 -4 L-6 -8 L4 -5 M-1 4 L-3 7 L5 4" fill="currentColor" opacity="0.7" />
    <path d="M-7 -1 Q2 -5 10 -1" fill="none" stroke="white" strokeOpacity="0.3" strokeWidth="0.8" />
    <circle cx="10" cy="-1" r="1.1" fill="currentColor" className="wave-fish-divider__eye" />
  </svg>
);
