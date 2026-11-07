import { useEffect, useRef, useState, type CSSProperties } from 'react';
import cemetery from '@/assets/confession/cemetery.jpg';
import church from '@/assets/confession/church-empty.jpg';
import saint from '@/assets/confession/rin-saint.jpg';
import saintMotion from '@/assets/confession/rin-saint.mp4';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { ConfessionCategory, ConfessionState } from './model';
const spots = [
  { x: 20, y: 69, s: 1 },
  { x: 76, y: 68, s: 0.94 },
  { x: 32, y: 53, s: 0.72 },
  { x: 66, y: 50, s: 0.66 },
];
const spotAt = (index: number) =>
  spots[index] ?? {
    x: index % 2 ? 69 + (index % 5) * 3 : 17 + (index % 5) * 4,
    y: 44 + (Math.floor((index - 4) / 2) % 5) * 6,
    s: 0.54,
  };
export function ConfessionScene({
  churchView,
  state,
  fog,
  paused,
  bubble,
  onTomb,
  onChurch,
  onSaint,
  onWrite,
}: {
  churchView: boolean;
  state: ConfessionState;
  fog: number;
  paused: boolean;
  bubble: boolean;
  onTomb: (category: ConfessionCategory) => void;
  onChurch: () => void;
  onSaint: () => void;
  onWrite: () => void;
}) {
  const reduced = useReducedMotion(true);
  const video = useRef<HTMLVideoElement>(null);
  const [motionFailed, setMotionFailed] = useState(false);
  const [tombPage, setTombPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(state.categories.length / 8));
  const activePage = Math.min(tombPage, pageCount - 1);
  const visibleCategories = state.categories.slice(activePage * 8, activePage * 8 + 8);
  useEffect(() => {
    const media = video.current;
    if (!media) return;
    let disposed = false;
    const sync = () => {
      if (paused || reduced || document.hidden) media.pause();
      else {
        void media.play().catch(() => {
          if (!disposed) setMotionFailed(true);
        });
      }
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      disposed = true;
      media.pause();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [churchView, paused, reduced, motionFailed]);
  const still = paused || reduced;
  return (
    <div className="confession-stage" data-still={still} data-church={churchView}>
      <div className="confession-world" key={churchView ? 'church' : 'cemetery'}>
        <img src={churchView ? church : cemetery} alt="" className="confession-landscape" draggable={false} />
        {!churchView && (
          <>
            <button type="button" className="confession-door" onClick={onChurch} aria-label="进入教堂">
              <span className="confession-door-halo" />
              <span className="confession-door-label">循光入内</span>
            </button>
            <div className="confession-tombstones" aria-label="归档墓碑">
              {visibleCategories.map((category, index) => {
                const spot = spotAt(index);
                const count = state.entries.filter((entry) => entry.categoryId === category.id).length;
                return (
                  <button
                    type="button"
                    className="confession-tomb"
                    key={category.id}
                    onClick={() => onTomb(category)}
                    style={
                      {
                        '--tomb-x': `${spot.x}%`,
                        '--tomb-y': `${spot.y}%`,
                        '--tomb-scale': spot.s,
                        '--tomb-index': index,
                      } as CSSProperties
                    }
                    aria-label={`查看墓碑：${category.name}`}
                  >
                    <span className="confession-tomb-cross" aria-hidden="true" />
                    <span className="confession-tomb-name">{category.name}</span>
                    <span className="confession-tomb-rule" />
                    <span className="confession-tomb-count">{count ? `${count} 则记事` : '静候归档'}</span>
                  </button>
                );
              })}
            </div>
            {pageCount > 1 && (
              <nav className="confession-grave-pages" aria-label="墓碑分区">
                <button type="button" disabled={activePage === 0} onClick={() => setTombPage(activePage - 1)}>
                  上一片墓地
                </button>
                <span>
                  {activePage + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={activePage === pageCount - 1}
                  onClick={() => setTombPage(activePage + 1)}
                >
                  下一片墓地
                </button>
              </nav>
            )}
            <div className="confession-crow-flight" aria-hidden="true">
              <svg viewBox="0 0 120 40">
                <path d="M2 20 Q24 -7 50 18 Q68 -7 104 15 L63 26 L58 37 L51 27Z" />
              </svg>
            </div>
          </>
        )}
        {churchView && (
          <>
            <div className="confession-spotlight" aria-hidden="true" />
            <div className="confession-saint-wrap">
              <button
                type="button"
                className="confession-saint"
                onClick={onSaint}
                aria-label="与圣女凛交谈"
                aria-expanded={bubble}
              >
                {still || motionFailed ? (
                  <img src={saint} alt="修女服志摩凛" />
                ) : (
                  <video
                    ref={video}
                    src={saintMotion}
                    poster={saint}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onError={() => setMotionFailed(true)}
                    aria-hidden="true"
                  />
                )}
                <span className="confession-saint-name">
                  志摩凛 <i>／</i> 圣女
                </span>
              </button>
              {bubble && (
                <button type="button" className="confession-bubble" onClick={onWrite}>
                  <span>你今天想忏什么</span>
                  <small>点击，写下你的内容</small>
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <div className="confession-vignette" aria-hidden="true" />
      <div className="confession-fog" aria-hidden="true" style={{ '--fog-density': fog / 100 } as CSSProperties}>
        <div />
        <div />
        <div />
      </div>
      <div className="confession-grain" aria-hidden="true" />
    </div>
  );
}
