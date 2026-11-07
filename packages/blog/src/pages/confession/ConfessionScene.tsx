import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { ConfessionWorld } from './ConfessionWorld';
import type { ConfessionCategory, ConfessionState } from './model';
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
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<ConfessionWorld | null>(null);
  const callbacks = useRef({ onTomb, onChurch, onSaint });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('正在加载三维素材…');
  const [retry, setRetry] = useState(0);
  const reduced = useReducedMotion(true);
  const settings = useRef({ state, fog, paused, blocked, reduced });
  const [anchor, setAnchor] = useState({ x: 50, y: 30, visible: true });
  useEffect(() => {
    callbacks.current = { onTomb, onChurch, onSaint };
  });
  useEffect(() => {
    settings.current = { state, fog, paused, blocked, reduced };
    world.current?.setState(state.categories, fog, paused, blocked, reduced);
  }, [state, fog, paused, blocked, reduced]);
  useEffect(() => {
    let disposed = false;
    setError('');
    setReady(false);
    void import('./ConfessionWorld')
      .then(({ ConfessionWorld }) => {
        if (disposed || !host.current) return;
        try {
          const instance = new ConfessionWorld(host.current, {
            onTomb: (c) => callbacks.current.onTomb(c),
            onSaint: () => callbacks.current.onSaint(),
            onRegion: (v) => callbacks.current.onChurch(v),
            onReady: () => {
              if (!disposed) setReady(true);
            },
            onError: (m) => {
              if (!disposed) setError(m);
            },
            onHint: (m) => {
              if (!disposed) setHint(m);
            },
          });
          world.current = instance;
          const s = settings.current;
          instance.setState(s.state.categories, s.fog, s.paused, s.blocked, s.reduced);
        } catch {
          if (!disposed) setError('当前浏览器无法启动三维场景，请检查WebGL支持并重试');
        }
      })
      .catch(() => {
        if (!disposed) setError('三维场景加载失败，请重试');
      });
    return () => {
      disposed = true;
      world.current?.dispose();
      world.current = null;
    };
  }, [retry]);
  useEffect(() => {
    if (!bubble) return;
    let frame = 0;
    let last = 0;
    const update = (now: number) => {
      if (now - last > 80) {
        const p = world.current?.projectSaint();
        if (p) setAnchor(p);
        last = now;
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [bubble]);
  const goInside = () => world.current?.enterChurch();
  const move = (forward: number, right: number) => world.current?.moveTouch(forward, right);
  return (
    <div className="confession-stage confession-3d" data-church={churchView}>
      <div ref={host} className="confession-webgl" />
      {!ready && !error && (
        <p className="confession-world-loading" role="status">
          正在构建墓地与教堂…
        </p>
      )}
      {error && (
        <div className="confession-world-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRetry((v) => v + 1)}>
            重新加载场景
          </button>
        </div>
      )}
      {ready && <div className="confession-crosshair" aria-hidden="true" />}
      <div className="confession-world-hud">
        <p role="status">{error || hint}</p>
        {!churchView ? (
          <button type="button" onClick={goInside} disabled={!ready || blocked}>
            进入教堂
          </button>
        ) : (
          <button type="button" onClick={() => world.current?.returnToGraves()} disabled={blocked}>
            回到墓地
          </button>
        )}
        <details className="confession-grave-index">
          <summary>墓碑目录 · {state.categories.length}</summary>
          <div>
            {state.categories.map((c, i) => (
              <button
                key={c.id}
                type="button"
                aria-label={`查看墓碑：${c.name}`}
                onClick={() => {
                  world.current?.focusGrave(i);
                  onTomb(c);
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </details>
        {churchView && (
          <button type="button" onClick={onSaint}>
            与圣女凛交谈
          </button>
        )}
      </div>
      <div className="confession-touch-controls" aria-label="场景移动控制">
        {[
          ['前进', 1, 0],
          ['左移', 0, -1],
          ['后退', -1, 0],
          ['右移', 0, 1],
        ].map(([label, f, r]) => (
          <button
            key={label}
            type="button"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              move(Number(f), Number(r));
            }}
            onPointerUp={() => move(0, 0)}
            onPointerCancel={() => move(0, 0)}
            aria-label={String(label)}
          >
            {label}
          </button>
        ))}
      </div>
      {bubble && churchView && (
        <button
          type="button"
          className="confession-bubble confession-world-bubble"
          onClick={onWrite}
          style={
            {
              left: `${Math.min(79, Math.max(20, anchor.x))}%`,
              top: `${Math.min(58, Math.max(19, anchor.y))}%`,
            } as CSSProperties
          }
        >
          <span>你今天想忏什么</span>
          <small>点击，写下你的内容</small>
        </button>
      )}
    </div>
  );
}
