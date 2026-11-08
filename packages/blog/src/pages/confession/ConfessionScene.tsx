import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { hasOpenOverlay } from '@/hooks/useModalOverlay';
import grass from '@/assets/confession/oblique/grass-surface.webp';
import stone from '@/assets/confession/oblique/stone-surface.webp';
import chapel from '@/assets/confession/oblique/chapel-iso.webp';
import graveEast from '@/assets/confession/oblique/grave-east.webp';
import graveWest from '@/assets/confession/oblique/grave-west.webp';
import tree from '@/assets/confession/25d/dead-tree.webp';
import crow from '@/assets/confession/25d/crow.webp';
import pew from '@/assets/confession/oblique/pew-iso.webp';
import door from '@/assets/confession/25d/door-leaf.webp';
import saint from '@/assets/confession/oblique/rin-iso.webp';
import pillar from '@/assets/confession/oblique/pillar-iso.webp';
import altar from '@/assets/confession/oblique/altar-iso.webp';
import windowWall from '@/assets/confession/oblique/window-wall.webp';
import garden from '@/assets/confession/oblique/garden-cluster.webp';
import { SceneGround } from './SceneGround';
import { SceneFog } from './SceneFog';
import { CHAPEL, GRAVES, PEWS, SAINT, SPACE, TREES, depth, project, type GroundPoint } from './sceneSpace';
import type { ConfessionCategory, ConfessionState } from './model';
import './confession-25d.css';

const assets = [
  grass,
  stone,
  chapel,
  graveEast,
  graveWest,
  tree,
  crow,
  pew,
  door,
  saint,
  pillar,
  altar,
  windowWall,
  garden,
];
const positions = GRAVES;
function placed(point: GroundPoint, height: number, width?: number): CSSProperties {
  const p = project({ ...point, height: 0 });
  return { left: p.x, top: p.y, height, ...(width ? { width } : {}) };
}
/** One ground projection and one scale for the entire hand-painted scene. */
export function ConfessionScene({
  churchView,
  state,
  paused,
  blocked,
  onTomb,
  onChurch,
  onSaint,
}: {
  churchView: boolean;
  state: ConfessionState;
  paused: boolean;
  blocked: boolean;
  onTomb: (category: ConfessionCategory) => void;
  onChurch: (inside: boolean) => void;
  onSaint: () => void;
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
  const [sceneScale, setSceneScale] = useState(1);
  useEffect(() => {
    if (!stage.current || typeof ResizeObserver === 'undefined') return;
    const resize = () => {
      const box = stage.current!.getBoundingClientRect();
      setSceneScale(Math.min(box.width / 1250, box.height / 950));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  const actors: { key: string; order: number; view: React.ReactNode }[] = [];
  const add = (key: string, point: GroundPoint, view: React.ReactNode) =>
    actors.push({ key, order: depth(point), view });
  const fogBand = (name: string, order: number, y: number) =>
    actors.push({
      key: name,
      order,
      view: (
        <div className={`confiso-fog-anchor confiso-fog-${name}`} style={{ top: y }}>
          <SceneFog still={still} band={name === 'far' ? 0 : name === 'middle' ? 1 : 2} />
        </div>
      ),
    });
  if (!churchView) {
    add(
      'chapel',
      CHAPEL,
      <div className="conf25-chapel" style={placed(CHAPEL, 340, 263)}>
        <span className="confiso-contact confiso-chapel-shadow" />
        <img className="conf25-chapel-art" src={chapel} alt="远处的石砌教堂" draggable={false} />
        <button
          type="button"
          className="conf25-door"
          aria-label="点击教堂门"
          disabled={!ready || opening || paused || blocked}
          onClick={enter}
        >
          <span className="conf25-door-glow" />
          <img className="conf25-leaf" src={door} alt="" draggable={false} />
          <span className="conf25-door-hint">循光入内</span>
        </button>
      </div>,
    );
    TREES.forEach((t, i) =>
      add(
        `tree-${i}`,
        t,
        <div
          className="confiso-tree"
          style={placed(t, t.height * SPACE.rise, t.height * SPACE.rise * 0.753)}
          aria-hidden="true"
        >
          <span className="confiso-contact" />
          <img src={tree} alt="" draggable={false} />
          {i === 1 && <img className="conf25-crow" src={crow} alt="枯树枝头的乌鸦" />}
        </div>,
      ),
    );
    visible.forEach((category, i) => {
      const spot = GRAVES[i];
      add(
        category.id,
        spot,
        <button
          type="button"
          className="conf25-grave"
          data-facing={spot.facing}
          style={placed(spot, 86, 54)}
          disabled={blocked || opening || !ready}
          aria-label={`查看墓碑：${category.name}`}
          onClick={() => onTomb(category)}
        >
          <span className="confiso-contact" aria-hidden="true" />
          <img src={spot.facing === 'east' ? graveEast : graveWest} alt="" draggable={false} />
          <span className="confiso-inscription">{category.name}</span>
        </button>,
      );
    });
    const gardens = [
      { x: -2.7, z: 2.8 },
      { x: -1.9, z: 1.2 },
      { x: -1.0, z: -1.6 },
      { x: 1.0, z: 6.3 },
      { x: 3.2, z: 5.3 },
      { x: 5.2, z: 3.6 },
      { x: 5.8, z: 1.5 },
      { x: 6.7, z: -1.5 },
      { x: 0.7, z: -4.1 },
      { x: 6.9, z: -4.1 },
      { x: -4.0, z: 4.1 },
      { x: 6.9, z: 6.2 },
    ];
    gardens.forEach((point, i) =>
      add(
        `garden-${i}`,
        point,
        <div
          className="confiso-garden"
          style={placed(point, i % 3 === 0 ? 46 : 34, i % 3 === 0 ? 84 : 62)}
          aria-hidden="true"
        >
          <span className="confiso-contact" />
          <img src={garden} alt="" draggable={false} />
        </div>,
      ),
    );
    fogBand('far', -2.5, 350);
    fogBand('middle', 3.7, 455);
    fogBand('near', 10, 620);
  } else {
    [-3.8, -1.15, 1.5, 4.2].forEach((z, i) => {
      const p = { x: -4.35, z };
      add(
        `column-${i}`,
        p,
        <div className="confiso-column" style={placed(p, 174, 43)} data-column-height="3.35" aria-hidden="true">
          <span className="confiso-contact" />
          <img src={pillar} alt="" />
        </div>,
      );
    });
    const altarPoint = { x: 0, z: -3.6 };
    add(
      'altar',
      altarPoint,
      <div className="confiso-altar-art" style={placed(altarPoint, 78, 67)} aria-hidden="true">
        <span className="confiso-contact" />
        <img src={altar} alt="" />
      </div>,
    );
    PEWS.forEach((p, i) =>
      add(
        `pew-${i}`,
        p,
        <div
          className="conf25-pew-row"
          data-row={p.row}
          data-facing={p.facing}
          data-world-x={p.x}
          data-world-z={p.z}
          style={placed(p, 58, 72)}
          aria-hidden="true"
        >
          <span className="confiso-contact" />
          <img src={pew} alt="" />
        </div>,
      ),
    );
    add(
      'saint',
      SAINT,
      <div
        className="conf25-saint-wrap"
        data-world-height={SAINT.height}
        style={placed(SAINT, SAINT.height * SPACE.rise, SAINT.height * SPACE.rise * 0.33)}
      >
        <span className="confiso-contact confiso-saint-shadow" aria-hidden="true" />
        <button
          className="conf25-saint"
          type="button"
          onClick={onSaint}
          aria-label="与圣女凛交谈"
          aria-haspopup="dialog"
          disabled={blocked}
        >
          <img src={saint} alt="黑白修女服志摩凛" draggable={false} />
        </button>
        <span className="confiso-saint-hint">与凛倾诉</span>
      </div>,
    );
    [
      { x: -3.7, z: -3.5 },
      { x: 3.6, z: -3.5 },
      { x: -3.7, z: 4.4 },
      { x: 3.6, z: 4.4 },
    ].forEach((point, i) =>
      add(
        `church-garden-${i}`,
        point,
        <div className="confiso-garden" style={placed(point, 25, 46)} aria-hidden="true">
          <img src={garden} alt="" />
        </div>,
      ),
    );
    fogBand('far', -3.6, 340);
    fogBand('middle', 2.2, 465);
    fogBand('near', 8.9, 620);
  }
  actors.sort((a, b) => a.order - b.order);

  return (
    <div
      ref={stage}
      className="confession-stage conf25-stage confiso-stage"
      data-church={churchView}
      data-still={still}
      data-opening={opening}
      data-fog="automatic"
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
      <div className="confiso-viewport" style={{ width: SPACE.width * sceneScale, height: SPACE.height * sceneScale }}>
        <div
          className="conf25-camera"
          key={churchView ? 'church' : 'cemetery'}
          style={{ '--scene-scale': sceneScale } as CSSProperties}
        >
          <SceneGround church={churchView} />
          {churchView && <div className="confiso-window-light" aria-hidden="true" />}
          {actors.map((actor, index) => (
            <div className="confiso-depth" key={actor.key} data-depth={actor.order} style={{ zIndex: index + 2 }}>
              {actor.view}
            </div>
          ))}
        </div>
      </div>
      <div className="conf25-vignette" aria-hidden="true" />
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
