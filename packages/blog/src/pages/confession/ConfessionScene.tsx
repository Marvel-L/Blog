import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { hasOpenOverlay } from '@/hooks/useModalOverlay';
import terrain from '@/assets/confession/25d/cemetery-terrain.webp';
import nave from '@/assets/confession/25d/church-nave.webp';
import chapel from '@/assets/confession/25d/chapel-exterior.webp';
import grave from '@/assets/confession/25d/grave.webp';
import tree from '@/assets/confession/25d/dead-tree.webp';
import crow from '@/assets/confession/25d/crow.webp';
import pew from '@/assets/confession/25d/pew.webp';
import door from '@/assets/confession/25d/door-leaf.webp';
import saint from '@/assets/confession/25d/rin-saint.webp';
import type { ConfessionCategory, ConfessionState } from './model';
import './confession-25d.css';

const assets = [terrain, nave, chapel, grave, tree, crow, pew, door, saint];
const positions = [
  { x: 24, y: 77, width: 12, depth: 'near' },
  { x: 79, y: 79, width: 11, depth: 'near' },
  { x: 41, y: 65, width: 8, depth: 'middle' },
  { x: 85, y: 61, width: 7, depth: 'middle' },
  { x: 20, y: 58, width: 6, depth: 'far' },
  { x: 55, y: 54, width: 5, depth: 'far' },
];
/** A fixed-camera painted space; private archive state remains owned by the page. */
export function ConfessionScene({
  churchView,
  state,
  fog,
  paused,
  bubble,
  blocked,
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
  blocked: boolean;
  onTomb: (category: ConfessionCategory) => void;
  onChurch: (inside: boolean) => void;
  onSaint: () => void;
  onWrite: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChurch });
  const reduced = useReducedMotion(true);
  const [hidden, setHidden] = useState(false);
  const [opening, setOpening] = useState(false);
  const [page, setPage] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    callbacks.current = { onChurch };
  });
  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);
  useEffect(() => {
    let disposed = false;
    const images: HTMLImageElement[] = [];
    setReady(false);
    setError(false);
    void Promise.all(
      assets.map(
        (url) =>
          new Promise<void>((resolve, reject) => {
            const image = new Image();
            images.push(image);
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('asset'));
            image.src = url;
          }),
      ),
    )
      .then(() => {
        if (!disposed) setReady(true);
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      images.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
    };
  }, [retry]);
  const still = paused || reduced || blocked || hidden;
  useEffect(() => {
    if (!opening || paused || blocked || hidden) return;
    const timer = window.setTimeout(
      () => {
        setOpening(false);
        callbacks.current.onChurch(true);
      },
      reduced ? 0 : 1350,
    );
    return () => window.clearTimeout(timer);
  }, [opening, paused, blocked, hidden, reduced]);
  const enter = () => {
    if (!ready || blocked || paused || opening || hasOpenOverlay()) return;
    if (reduced) onChurch(true);
    else setOpening(true);
  };
  const totalPages = Math.max(1, Math.ceil(state.categories.length / positions.length));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = state.categories.slice(currentPage * 6, currentPage * 6 + 6);
  const fogLayer = (depth: string) => (
    <div className={`conf25-fog conf25-fog-${depth}`} aria-hidden="true">
      <i />
      <i />
    </div>
  );
  const trees = (depth: string) => (
    <div className={`conf25-trees conf25-trees-${depth}`} aria-hidden="true">
      <img src={tree} alt="" draggable={false} />
      <img src={tree} alt="" draggable={false} />
    </div>
  );
  const graves = (depth: string) =>
    visible.map((category, i) => {
      const spot = positions[i];
      if (spot.depth !== depth) return null;
      return (
        <button
          type="button"
          key={category.id}
          className={`conf25-grave conf25-grave-${depth}`}
          disabled={blocked || opening || !ready}
          aria-label={`查看墓碑：${category.name}`}
          onClick={() => onTomb(category)}
          style={
            { '--grave-x': `${spot.x}%`, '--grave-y': `${spot.y}%`, '--grave-width': `${spot.width}%` } as CSSProperties
          }
        >
          <img src={grave} alt="" draggable={false} />
          <span>{category.name}</span>
        </button>
      );
    });
  return (
    <div
      ref={stage}
      className="confession-stage conf25-stage"
      data-church={churchView}
      data-still={still}
      data-opening={opening}
      style={{ '--fog-density': Math.max(0, Math.min(fog, 100)) / 100 } as CSSProperties}
      onPointerMove={(event) => {
        if (still || event.pointerType === 'touch' || !stage.current) return;
        const box = stage.current.getBoundingClientRect();
        stage.current.style.setProperty('--look-x', `${((event.clientX - box.left) / box.width - 0.5) * 12}px`);
        stage.current.style.setProperty('--look-y', `${((event.clientY - box.top) / box.height - 0.5) * 7}px`);
      }}
      onPointerLeave={() => {
        stage.current?.style.setProperty('--look-x', '0px');
        stage.current?.style.setProperty('--look-y', '0px');
      }}
    >
      <div className="conf25-camera" key={churchView ? 'church' : 'cemetery'}>
        <img className="conf25-base" src={churchView ? nave : terrain} alt="" draggable={false} />
        {!churchView ? (
          <>
            <div className="conf25-depth conf25-back">
              {trees('far')}
              <div className="conf25-chapel">
                <img className="conf25-chapel-art" src={chapel} alt="远处的石砌教堂" draggable={false} />
                <button
                  type="button"
                  className="conf25-door"
                  aria-label="点击教堂门"
                  disabled={!ready || opening || paused || blocked}
                  onClick={enter}
                >
                  <span className="conf25-door-glow" />
                  <img className="conf25-leaf conf25-leaf-left" src={door} alt="" draggable={false} />
                  <span className="conf25-door-hint">循光入内</span>
                </button>
              </div>
              {graves('far')}
            </div>
            {fogLayer('far')}
            <div className="conf25-depth conf25-middle">
              {trees('middle')}
              {graves('middle')}
            </div>
            {fogLayer('middle')}
            <div className="conf25-depth conf25-front">
              {graves('near')}
              {trees('near')}
              <img className="conf25-crow" src={crow} alt="枯树枝头的乌鸦" draggable={false} />
            </div>
            {fogLayer('near')}
          </>
        ) : (
          <>
            {fogLayer('far')}
            <div className="conf25-depth conf25-middle conf25-pews" aria-hidden="true">
              {[0, 1, 2].map((row) => (
                <div key={row} className={`conf25-pew-row conf25-pew-row-${row}`}>
                  <img src={pew} alt="" />
                  <img src={pew} alt="" />
                </div>
              ))}
            </div>
            {fogLayer('middle')}
            <div className="conf25-light" aria-hidden="true" />
            <div className="conf25-saint-wrap conf25-depth conf25-front">
              <span className="conf25-saint-shadow" aria-hidden="true" />
              <button
                className="conf25-saint"
                type="button"
                onClick={onSaint}
                aria-label="与圣女凛交谈"
                aria-expanded={bubble}
                disabled={blocked}
              >
                <img src={saint} alt="黑白修女服志摩凛" draggable={false} />
              </button>
              {bubble && (
                <button type="button" className="confession-bubble conf25-bubble" onClick={onWrite} disabled={blocked}>
                  <span>你今天想忏什么</span>
                  <small>点击，写下你的内容</small>
                </button>
              )}
            </div>
            {fogLayer('near')}
          </>
        )}
        <div className="conf25-vignette" aria-hidden="true" />
      </div>
      {error && (
        <div role="alert" className="confession-world-error">
          <p>场景素材加载失败，请重试</p>
          <button type="button" onClick={() => setRetry((v) => v + 1)}>
            重新加载场景
          </button>
        </div>
      )}
      <div className="conf25-hud">
        <p role="status">
          {!ready
            ? '正在铺开墓地与教堂…'
            : opening
              ? '门正在开启…'
              : churchView
                ? '教堂 · 点击凛，把想说的话留在这里'
                : '墓地 · 点击墓碑查看归档，循光进入教堂'}
        </p>
        <div>
          {churchView ? (
            <button
              type="button"
              disabled={blocked}
              onClick={() => {
                setOpening(false);
                onChurch(false);
              }}
            >
              回到墓地
            </button>
          ) : (
            <button type="button" disabled={!ready || blocked || opening || paused} onClick={enter}>
              进入教堂
            </button>
          )}
          <details className="confession-grave-index">
            <summary>墓碑目录 · {state.categories.length}</summary>
            <div>
              {state.categories.map((c, i) => (
                <button
                  type="button"
                  key={c.id}
                  disabled={blocked}
                  aria-label={`定位墓碑：${c.name}`}
                  onClick={() => {
                    setPage(Math.floor(i / 6));
                    setOpening(false);
                    if (churchView) onChurch(false);
                    onTomb(c);
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </details>
        </div>
      </div>
      {!churchView && totalPages > 1 && (
        <nav className="conf25-pages" aria-label="墓碑分区">
          <button
            type="button"
            disabled={currentPage === 0 || blocked || opening}
            onClick={() => setPage(currentPage - 1)}
          >
            上一片墓地
          </button>
          <span>
            {currentPage + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage === totalPages - 1 || blocked || opening}
            onClick={() => setPage(currentPage + 1)}
          >
            下一片墓地
          </button>
        </nav>
      )}
    </div>
  );
}
