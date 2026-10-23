import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Coffee,
  Hand,
  Heart,
  MessageCircle,
  Minus,
  Moon,
  Pause,
  PersonStanding,
  Play,
  Search,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { RinArtwork } from './RinArtwork';
import {
  readRinPreference,
  saveRinPreference,
  RIN_MESSAGES,
  RIN_REACTION_DURATION,
  rinConfig,
  type RinPreference,
  type RinReaction,
} from './rinConfig';
import type { RinDriver } from './live2dRuntime';
import './rin-mascot.css';

export default function RinMascot() {
  const [preference, setPreference] = useState<RinPreference | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [message, setMessage] = useState<string>(RIN_MESSAGES[0]);
  const [reaction, setReaction] = useState<{ kind: RinReaction; sequence: number }>({ kind: 'idle', sequence: 0 });
  const [pageHidden, setPageHidden] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [modelState, setModelState] = useState<'preview' | 'loading' | 'ready' | 'error'>('preview');
  const reducedMotion = useReducedMotion(true);
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const characterRef = useRef<HTMLButtonElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const driverRef = useRef<RinDriver | null>(null);
  const messageIndex = useRef(0);
  const restoreFocus = useRef(false);
  const ready = preference !== null;
  const collapsed = preference?.collapsed ?? true;
  const paused = Boolean(preference?.paused || reducedMotion || pageHidden);
  const activeReaction = paused || collapsed ? 'idle' : reaction.kind;

  useEffect(() => {
    setPreference({
      collapsed: !window.matchMedia?.('(min-width: 1024px)').matches,
      paused: false,
      side: 'left',
      ...readRinPreference(),
    });
    const onVisibility = () => setPageHidden(document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const updatePreference = (patch: Partial<RinPreference>) => {
    if (!preference) return;
    const next = { ...preference, ...patch };
    setPreference(next);
    setStorageUnavailable(!saveRinPreference(next));
  };

  useEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    if (collapsed) launcherRef.current?.focus();
    else characterRef.current?.focus();
  }, [collapsed]);

  useEffect(() => {
    if (reaction.kind === 'idle') return;
    if (paused || collapsed) {
      setReaction((current) => ({ ...current, kind: 'idle' }));
      return;
    }
    const timer = window.setTimeout(
      () => setReaction((current) => ({ ...current, kind: 'idle' })),
      RIN_REACTION_DURATION[reaction.kind],
    );
    return () => window.clearTimeout(timer);
  }, [reaction, paused, collapsed]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    characterRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setPanelOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [panelOpen]);

  useEffect(() => {
    if (!ready || collapsed || !rinConfig.modelUrl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const controller = new AbortController();
    setModelState('loading');
    void import('./live2dRuntime')
      .then(({ createLive2D }) => createLive2D(canvas, rinConfig.modelUrl, rinConfig.coreUrl, controller.signal))
      .then((driver) => {
        if (controller.signal.aborted) {
          driver.destroy();
          return;
        }
        driverRef.current = driver;
        setModelState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setModelState('error');
      });
    return () => {
      controller.abort();
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, [ready, collapsed]);

  useEffect(() => {
    driverRef.current?.setPaused(paused || collapsed);
  }, [paused, collapsed, modelState]);

  useEffect(() => {
    if (!ready || collapsed) return;
    driverRef.current?.lookAt(0, 0);
  }, [ready, collapsed, modelState]);

  if (!preference || !rinConfig.enabled) return null;

  const perform = (kind: Exclude<RinReaction, 'idle'>, text: string) => {
    setMessage(text);
    setPanelOpen(true);
    if (paused) return;
    setReaction((current) => ({ kind, sequence: current.sequence + 1 }));
    driverRef.current?.react();
  };
  const greet = () => {
    messageIndex.current = (messageIndex.current + 1) % RIN_MESSAGES.length;
    perform('wave', RIN_MESSAGES[messageIndex.current]);
  };
  const takeTea = () => {
    perform('tea', '呼——热茶好了。陪我歇一小会儿吧。');
  };
  const nod = () => perform('nod', '嗯，我在听。慢慢说就好。');
  const stretch = () => perform('stretch', '唔——伸个懒腰。你也活动一下肩膀吧。');
  const toggleCollapsed = () => {
    restoreFocus.current = true;
    setPanelOpen(false);
    updatePreference({ collapsed: !collapsed });
  };

  return (
    <aside
      ref={rootRef}
      className="rin-mascot"
      aria-label="凛的陪伴角落"
      data-side={preference.side}
      data-paused={paused}
      data-collapsed={collapsed}
      data-reaction={activeReaction}
      data-renderer={modelState === 'ready' ? 'cubism' : 'layered-preview'}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && panelOpen) {
          event.stopPropagation();
          closePanel();
        }
      }}
    >
      {collapsed ? (
        <button
          ref={launcherRef}
          className="rin-launcher"
          onClick={toggleCollapsed}
          aria-label="唤醒看板娘凛"
          title="让凛陪你读一会儿"
        >
          <RinArtwork />
          <span className="rin-launcher-dot" />
        </button>
      ) : (
        <>
          {panelOpen && (
            <section className="rin-panel" aria-label="和凛互动" id="rin-companion-panel">
              <div className="rin-panel-heading">
                <span>
                  <span className="rin-status-dot" /> 志摩凛 <small>安静的露营阅读时间</small>
                </span>
                <button type="button" onClick={closePanel} aria-label="关闭对话">
                  <X size={14} />
                </button>
              </div>
              <p className="rin-message" aria-live="polite">
                {message}
              </p>
              <div className="rin-actions">
                <button type="button" onClick={greet}>
                  <MessageCircle size={14} />
                  聊一会儿
                </button>
                <button type="button" onClick={takeTea}>
                  <Coffee size={14} />
                  喝杯热茶
                </button>
                <Link to="/search" onClick={() => setPanelOpen(false)}>
                  <Search size={14} />
                  找篇文章
                </Link>
              </div>
              <div className="rin-gestures" aria-label="肢体互动">
                <button type="button" onClick={() => perform('wave', '嗨。今天也一起慢慢来吧。')}>
                  <Hand size={13} /> 挥挥手
                </button>
                <button type="button" onClick={nod}>
                  <Heart size={13} /> 点点头
                </button>
                <button type="button" onClick={stretch}>
                  <PersonStanding size={13} /> 伸懒腰
                </button>
              </div>
              {modelState !== 'ready' && <p className="rin-touch-hint">点点帽子、外套和右手，会有不同回应。</p>}
              <div className="rin-settings">
                <button
                  type="button"
                  onClick={() => updatePreference({ side: preference.side === 'left' ? 'right' : 'left' })}
                  aria-label="把凛移到另一侧"
                  title="换一边"
                >
                  <ArrowLeftRight size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => updatePreference({ paused: !preference.paused })}
                  aria-label={preference.paused ? '恢复角色动画' : '暂停角色动画'}
                  aria-pressed={preference.paused}
                  disabled={reducedMotion}
                  title={reducedMotion ? '已遵循系统减少动态效果设置' : '暂停或恢复动画'}
                >
                  {preference.paused || reducedMotion ? <Play size={15} /> : <Pause size={15} />}
                </button>
                <span className="rin-renderer-label">{modelState === 'ready' ? 'Cubism Live2D' : '连续帧动画'}</span>
                <button type="button" onClick={toggleCollapsed} aria-label="收起看板娘凛" title="休息一下">
                  <Moon size={15} />
                </button>
              </div>
              {storageUnavailable && (
                <p className="rin-notice" aria-live="polite">
                  偏好暂时无法保存，本次浏览仍可使用。
                </p>
              )}
              {modelState === 'loading' && (
                <p className="rin-notice" aria-live="polite">
                  角色模型加载中…
                </p>
              )}
              {modelState === 'error' && (
                <p className="rin-notice" aria-live="polite">
                  模型加载失败，暂时显示互动 2D 角色。
                </p>
              )}
            </section>
          )}
          <button
            ref={characterRef}
            type="button"
            className="rin-character"
            onClick={(event) => {
              const target = event.target;
              const touch =
                event.detail !== 0 && target instanceof Element
                  ? target.closest('[data-rin-touch]')?.getAttribute('data-rin-touch')
                  : null;
              if (touch === 'nod') nod();
              else if (touch === 'stretch') stretch();
              else greet();
            }}
            aria-label="和凛打个招呼"
            title="点头发会点头，点手会挥手，点外套会伸懒腰"
            aria-expanded={panelOpen}
            aria-controls={panelOpen ? 'rin-companion-panel' : undefined}
          >
            <span className="rin-ground" />
            <span className="rin-preview" hidden={modelState === 'ready'}>
              <RinArtwork reaction={activeReaction} sequence={reaction.sequence} paused={paused || collapsed} />
            </span>
            {rinConfig.modelUrl && (
              <canvas ref={canvasRef} className="rin-canvas" hidden={modelState !== 'ready'} aria-hidden="true" />
            )}
            {activeReaction === 'wave' && (
              <span className="rin-happy" aria-hidden="true">
                ♪
              </span>
            )}
          </button>
          <div className="rin-caption">
            <button type="button" onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen}>
              凛 <span>· {paused ? '安静陪伴' : '在这里陪你'}</span>
            </button>
            <button type="button" onClick={toggleCollapsed} aria-label="收起看板娘凛" title="收起">
              <Minus size={13} />
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
