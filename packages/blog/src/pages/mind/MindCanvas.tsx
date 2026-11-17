import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  CornerDownRight,
  Expand,
  GitBranch,
  Maximize,
  Minus,
  Plus,
  Redo2,
  Shrink,
  Trash2,
  Undo2,
} from 'lucide-react';
import { hasOpenOverlay } from '@/hooks/useModalOverlay';
import {
  MARKERS,
  NODE_COLORS,
  clampView,
  customNodeColors,
  insertNode,
  layoutEditingMind,
  layoutMind,
  moveNode,
  removeNode,
  visibleMindGeometry,
  zoomAt,
  type MindGeometry,
  type MindState,
  type MindEditLayout,
  type Viewport,
} from './model';
import type { SaveSnapshot } from './sync';
import { useNodeSizes } from './useNodeSizes';
import { useNodeDrag } from './useNodeDrag';
import { useMindFullscreen, type MindFullscreen } from './useMindFullscreen';
import { MindEdgeView, MindNodeView, type MindNodeActions } from './MindNodeView';

interface Props {
  snapshot: SaveSnapshot;
  onChange: (state: MindState) => void;
  onBack: () => void;
  onRetry: () => void;
  onCopy: () => void;
  onLoadCloud: () => void;
  busy: boolean;
}
const statusText = {
  saved: '已保存',
  pending: '等待保存',
  saving: '正在保存',
  error: '保存失败 · 重试',
  conflict: '版本冲突',
};

export function MindCanvas(props: Props) {
  const fullscreen = useMindFullscreen();
  return (
    <div ref={fullscreen.mountRef} className="mind-editor-mount">
      {fullscreen.host && createPortal(<MindCanvasEditor {...props} fullscreen={fullscreen} />, fullscreen.host)}
    </div>
  );
}

function MindCanvasEditor({
  snapshot,
  onChange,
  onBack,
  onRetry,
  onCopy,
  onLoadCloud,
  busy,
  fullscreen,
}: Props & { fullscreen: MindFullscreen }) {
  const { state } = snapshot;
  const canvas = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(state);
  const frame = useRef(0);
  const pendingView = useRef<Viewport | null>(null);
  const [size, setSize] = useState({ width: 800, height: 500 });
  const [selected, setSelected] = useState(state.nodes.find((n) => n.parentId === null)!.id);
  const [editing, setEditing] = useState<MindEditLayout | null>(null);
  const editingId = editing?.id;
  const [notice, setNotice] = useState('');
  const undo = useRef<MindState[]>([]);
  const redo = useRef<MindState[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ view: Viewport; distance: number; x: number; y: number } | null>(null);
  const safariGesture = useRef<Viewport | null>(null);
  const [dragging, setDragging] = useState(false);
  const sizes = useNodeSizes(state.nodes, canvas);
  const previousGeometry = useRef<MindGeometry | undefined>(undefined);
  const nodeActions = useRef<MindNodeActions | null>(null);
  const geometry = useMemo(
    () =>
      editing
        ? layoutEditingMind({ nodes: state.nodes, layout: state.layout }, editing, sizes, previousGeometry.current)
        : layoutMind({ nodes: state.nodes, layout: state.layout }, sizes, previousGeometry.current),
    [state.nodes, state.layout, sizes, editing],
  );
  const selectedNode = state.nodes.find((n) => n.id === selected);
  useLayoutEffect(() => {
    previousGeometry.current = geometry;
  }, [geometry]);

  useEffect(() => {
    latest.current = state;
  }, [state]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (editingId) {
      editor.current?.focus({ preventScroll: true });
      editor.current?.select();
    }
  }, [editingId]);
  useLayoutEffect(() => {
    if (editingId && editor.current) {
      // The field expands to fit all lines. Do not retain the browser's interim
      // caret scrolling from the previous width while controlled text updates.
      editor.current.scrollLeft = 0;
      editor.current.scrollTop = 0;
    }
  }, [editingId, sizes]);
  useEffect(() => {
    if (fullscreen.mode !== 'none' && !editingId) canvas.current?.focus({ preventScroll: true });
  }, [fullscreen.mode, editingId]);

  const change = useCallback(
    (next: MindState) => {
      latest.current = next;
      onChange(next);
    },
    [onChange],
  );
  const changeView = useCallback(
    (view: Viewport) => {
      pendingView.current = clampView(view);
      latest.current = { ...latest.current, viewport: pendingView.current };
      if (!frame.current)
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          if (pendingView.current) {
            change({ ...latest.current, viewport: pendingView.current });
            pendingView.current = null;
          }
        });
    },
    [change],
  );
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (hasOpenOverlay()) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const current = latest.current.viewport;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
      if (event.ctrlKey || event.metaKey) {
        if (safariGesture.current) return;
        changeView(
          zoomAt(
            current,
            current.zoom * Math.exp(-event.deltaY * unit * 0.01),
            event.clientX - rect.left - rect.width / 2,
            event.clientY - rect.top - rect.height / 2,
          ),
        );
      } else {
        changeView({
          ...current,
          x: current.x + (event.deltaX * unit) / current.zoom,
          y: current.y + (event.deltaY * unit) / current.zoom,
        });
      }
    };
    const start = (raw: Event) => {
      raw.preventDefault();
      safariGesture.current = latest.current.viewport;
    };
    const pinch = (raw: Event) => {
      raw.preventDefault();
      const event = raw as Event & { scale: number; clientX: number; clientY: number };
      const initial = safariGesture.current;
      if (!initial) return;
      const rect = element.getBoundingClientRect();
      changeView(
        zoomAt(
          initial,
          initial.zoom * event.scale,
          (event.clientX || rect.left + rect.width / 2) - rect.left - rect.width / 2,
          (event.clientY || rect.top + rect.height / 2) - rect.top - rect.height / 2,
        ),
      );
    };
    const end = () => {
      safariGesture.current = null;
    };
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('gesturestart', start, { passive: false });
    element.addEventListener('gesturechange', pinch, { passive: false });
    element.addEventListener('gestureend', end);
    return () => {
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('gesturestart', start);
      element.removeEventListener('gesturechange', pinch);
      element.removeEventListener('gestureend', end);
    };
  }, [changeView]);

  const remember = () => {
    undo.current = [...undo.current.slice(-79), latest.current];
    redo.current = [];
    setHistoryVersion((v) => v + 1);
  };
  const geometryFor = (next: MindState) =>
    next.nodes === state.nodes && next.layout === state.layout ? geometry : layoutMind(next, sizes, geometry);
  const beginEditing = (id: string, next = latest.current, placed = geometryFor(next)) => {
    setEditing({ id, layout: next.layout, nodes: placed.nodes, edges: placed.edges });
  };
  const commit = (next: MindState) => {
    if (next === latest.current) return;
    remember();
    change(next);
  };
  const nodeDrag = useNodeDrag(
    state,
    geometry.nodes,
    () => canvas.current?.getBoundingClientRect(),
    (source, drop) => {
      const next = moveNode(latest.current, source, drop.id, drop.placement, drop.rootSide);
      if (next === latest.current) return;
      commit(next);
      setSelected(source);
      setNotice(drop.placement === 'child' ? '已移动为子主题，可撤销' : '已调整主题顺序，可撤销');
      canvas.current?.focus({ preventScroll: true });
    },
  );
  const visible = useMemo(
    () =>
      visibleMindGeometry(geometry, state.viewport, size, [
        ...(editingId ? [editingId] : []),
        ...(nodeDrag.visual ? [nodeDrag.visual.source] : []),
      ]),
    [geometry, state.viewport, size, editingId, nodeDrag.visual],
  );
  const setNodeColor = (color?: string) => {
    const nodes = latest.current.nodes.map((node) => {
      if (node.id !== selected) return node;
      if (color) return { ...node, color };
      const next = { ...node };
      delete next.color;
      return next;
    });
    commit({ ...latest.current, nodes });
  };
  const history = (direction: 'undo' | 'redo') => {
    const source = direction === 'undo' ? undo : redo;
    const target = direction === 'undo' ? redo : undo;
    const next = source.current.pop();
    if (!next) return;
    target.current.push(latest.current);
    change({ ...next, viewport: latest.current.viewport });
    if (!next.nodes.some((n) => n.id === selected)) setSelected(next.nodes.find((n) => !n.parentId)!.id);
    setEditing(null);
    setHistoryVersion((v) => v + 1);
    canvas.current?.focus({ preventScroll: true });
  };
  const reveal = (id: string, next: MindState, placed = geometryFor(next)) => {
    const node = placed.nodes.find((n) => n.id === id);
    if (!node) return;
    const view = latest.current.viewport;
    if (
      Math.abs(node.x - view.x) * view.zoom + (node.width * view.zoom) / 2 > size.width / 2 - 30 ||
      Math.abs(node.y - view.y) * view.zoom + (node.height * view.zoom) / 2 > size.height / 2 - 70
    ) {
      changeView({ ...view, x: node.x, y: node.y });
    }
  };
  const add = (relation: 'child' | 'sibling') => {
    const id = crypto.randomUUID();
    const next = insertNode(latest.current, selected, relation, id);
    if (next === latest.current) {
      setNotice('已达到节点数量或层级上限');
      return;
    }
    commit(next);
    setSelected(id);
    const placed = geometryFor(next);
    beginEditing(id, next, placed);
    reveal(id, next, placed);
    setNotice('');
  };
  const remove = () => {
    const node = latest.current.nodes.find((n) => n.id === selected);
    if (!node?.parentId) {
      setNotice('中心主题不能删除');
      return;
    }
    commit(removeNode(latest.current, selected));
    setSelected(node.parentId);
    setEditing(null);
    setNotice('已删除节点及其子主题，可撤销');
    canvas.current?.focus({ preventScroll: true });
  };
  const startEditing = () => {
    if (selectedNode) {
      remember();
      beginEditing(selected);
    }
  };
  const keyDown = (event: KeyboardEvent) => {
    if (hasOpenOverlay() || event.nativeEvent.isComposing || event.keyCode === 229) return;
    const target = event.target as HTMLElement;
    if (event.key === 'Escape' && nodeDrag.current.current) {
      event.preventDefault();
      nodeDrag.cancel();
      return;
    }
    if (target.closest('.mind-canvas-controls')) return;
    if (target.matches('input, textarea, select') || target.isContentEditable) return;
    if (event.key === 'Tab' && event.shiftKey) return; // Shift+Tab remains an escape route to the toolbar.
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      history(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (modifier && event.key.toLowerCase() === 's') {
      event.preventDefault();
      onRetry();
      return;
    }
    if (modifier || event.altKey) return;
    if (['Enter', 'Tab', 'Delete', 'Backspace', 'F2', ' '].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Enter') add('sibling');
      else if (event.key === 'Tab') add('child');
      else if (event.key === 'Delete' || event.key === 'Backspace') remove();
      else startEditing();
    } else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      event.stopPropagation();
      const current = geometry.nodes.find((n) => n.id === selected);
      if (!current) return;
      const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'x' : 'y';
      const sign = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const next = geometry.nodes
        .filter((n) => (n[axis] - current[axis]) * sign > 1)
        .sort((a, b) => Math.hypot(a.x - current.x, a.y - current.y) - Math.hypot(b.x - current.x, b.y - current.y))[0];
      if (next) {
        setSelected(next.id);
        reveal(next.id, state);
      }
    } else if (event.key.length === 1) {
      event.preventDefault();
      event.stopPropagation();
      remember();
      beginEditing(selected);
      change({
        ...latest.current,
        nodes: latest.current.nodes.map((n) => (n.id === selected ? { ...n, text: event.key } : n)),
      });
    }
  };
  const resetGesture = () => {
    const points = [...pointers.current.values()];
    if (!points.length) {
      gesture.current = null;
      setDragging(false);
      return;
    }
    const a = points[0],
      b = points[1] ?? a;
    gesture.current = {
      view: latest.current.viewport,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      distance: Math.hypot(b.x - a.x, b.y - a.y),
    };
  };
  const fit = () => {
    const { bounds } = geometry;
    changeView({
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2,
      zoom: Math.min(
        1.4,
        (size.width - 80) / (bounds.right - bounds.left),
        (size.height - 150) / (bounds.bottom - bounds.top),
      ),
    });
  };
  useLayoutEffect(() => {
    nodeActions.current = {
      change: (id, text) =>
        change({
          ...latest.current,
          nodes: latest.current.nodes.map((n) => (n.id === id ? { ...n, text } : n)),
        }),
      blur: (event) => {
        if (event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-mind-fullscreen-toggle]'))
          return;
        setEditing(null);
      },
      keyDown: (event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          setEditing(null);
          canvas.current?.focus({ preventScroll: true });
        } else if ((event.key === 'Tab' && !event.shiftKey) || (event.key === 'Enter' && !event.shiftKey)) {
          event.preventDefault();
          add(event.key === 'Tab' ? 'child' : 'sibling');
        }
      },
      pointerDown: (node, event) => {
        if (event.button !== 0 || hasOpenOverlay()) return;
        if (
          pointers.current.size ||
          (nodeDrag.current.current && nodeDrag.current.current.pointerId !== event.pointerId)
        )
          return;
        event.stopPropagation();
        setSelected(node.id);
        setEditing(null);
        canvas.current?.focus({ preventScroll: true });
        if (!node.parentId) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        nodeDrag.start(node.id, event.pointerId, { x: event.clientX, y: event.clientY });
      },
      click: (id) => {
        if (nodeDrag.consumeClick()) return;
        setSelected(id);
        setEditing(null);
        canvas.current?.focus({ preventScroll: true });
      },
      doubleClick: (id) => {
        setSelected(id);
        remember();
        beginEditing(id);
      },
    };
  });

  return (
    <div
      ref={fullscreen.editorRef}
      className={`mind-editor${fullscreen.mode !== 'none' ? ' is-fullscreen' : ''}`}
      role={fullscreen.mode === 'window' ? 'dialog' : undefined}
      aria-modal={fullscreen.mode === 'window' ? true : undefined}
      aria-label={fullscreen.mode === 'window' ? '导图全屏编辑' : undefined}
    >
      <header className="mind-editor-header">
        <button className="mind-icon" aria-label="返回 Mind 列表" onClick={onBack} disabled={busy}>
          <ArrowLeft size={19} />
        </button>
        <input
          aria-label="导图名称"
          className="mind-title-input"
          value={state.title}
          maxLength={120}
          onFocus={remember}
          onChange={(event) =>
            change({ ...latest.current, title: event.target.value.trim() ? event.target.value : '未命名导图' })
          }
        />
        <select
          aria-label="导图结构"
          value={state.layout}
          onChange={(event) => commit({ ...latest.current, layout: event.target.value as MindState['layout'] })}
        >
          <option value="mind">思维导图</option>
          <option value="logic">逻辑图</option>
        </select>
        <span className="mind-private">仅自己可见</span>
        <button
          type="button"
          className="mind-icon mind-fullscreen-toggle"
          data-mind-fullscreen-toggle
          aria-label={fullscreen.mode === 'none' ? '进入全屏' : '退出全屏'}
          aria-pressed={fullscreen.mode !== 'none'}
          title={fullscreen.mode === 'none' ? '全屏展示和编辑' : '退出全屏 · Esc'}
          onClick={() => {
            fullscreen.toggle();
          }}
        >
          {fullscreen.mode === 'none' ? (
            <Expand size={18} aria-hidden="true" />
          ) : (
            <Shrink size={18} aria-hidden="true" />
          )}
        </button>
      </header>
      <div className="mind-toolbar" aria-label="节点工具">
        <button onClick={() => add('child')} title="子主题 · Tab">
          <CornerDownRight size={16} />
          <span>子主题</span>
        </button>
        <button onClick={() => add('sibling')} title="同级主题 · Enter">
          <GitBranch size={16} />
          <span>同级</span>
        </button>
        <button onClick={remove} disabled={!selectedNode?.parentId} aria-label="删除节点及子主题" title="删除 · Delete">
          <Trash2 size={16} />
        </button>
        <span className="mind-tool-divider" />
        <button
          onClick={() => history('undo')}
          disabled={!undo.current.length}
          aria-label="撤销"
          data-history={historyVersion}
        >
          <Undo2 size={16} />
        </button>
        <button onClick={() => history('redo')} disabled={!redo.current.length} aria-label="重做">
          <Redo2 size={16} />
        </button>
        <span className="mind-tool-divider" />
        <div className="mind-markers" aria-label="节点表情标记">
          {MARKERS.map((emoji) => (
            <button
              key={emoji}
              aria-label={`标记 ${emoji}`}
              aria-pressed={selectedNode?.emoji === emoji}
              onClick={() => {
                commit({
                  ...latest.current,
                  nodes: latest.current.nodes.map((n) =>
                    n.id === selected ? { ...n, emoji: n.emoji === emoji ? '' : emoji } : n,
                  ),
                });
                canvas.current?.focus({ preventScroll: true });
              }}
            >
              {emoji}
            </button>
          ))}
          {selectedNode?.emoji && (
            <button
              onClick={() =>
                commit({
                  ...latest.current,
                  nodes: latest.current.nodes.map((n) => (n.id === selected ? { ...n, emoji: '' } : n)),
                })
              }
            >
              清除
            </button>
          )}
        </div>
        <span className="mind-tool-divider" />
        <div className="mind-node-colors" role="group" aria-label="节点颜色">
          {NODE_COLORS.map((color) => (
            <button
              key={color.value}
              aria-label={`节点颜色：${color.name}`}
              title={color.name}
              aria-pressed={selectedNode?.color?.toLowerCase() === color.value}
              onClick={() => setNodeColor(color.value)}
            >
              <span style={{ backgroundColor: color.value }} />
            </button>
          ))}
          <label className="mind-custom-color" title="自定义颜色">
            <input
              type="color"
              aria-label="自定义节点颜色"
              value={selectedNode?.color ?? '#e0eee3'}
              onChange={(event) => setNodeColor(event.target.value)}
            />
          </label>
          <button aria-label="恢复节点自动配色" disabled={!selectedNode?.color} onClick={() => setNodeColor()}>
            自动
          </button>
        </div>
      </div>
      {(snapshot.error || snapshot.recoveryError) && (
        <div className="mind-save-error" role="alert">
          <span>{snapshot.error || snapshot.recoveryError}</span>
          {snapshot.status === 'conflict' ? (
            <>
              <button disabled={busy} onClick={onCopy}>
                另存为新导图
              </button>
              <button
                onClick={() => {
                  if (window.confirm('将用云端版本替换本机草稿。需要保留草稿时，请先另存为新导图。')) onLoadCloud();
                }}
              >
                加载云端版本
              </button>
            </>
          ) : (
            <button onClick={onRetry}>重试保存</button>
          )}
        </div>
      )}
      <div
        ref={canvas}
        className={`mind-canvas${dragging ? ' is-dragging' : ''}`}
        role="region"
        aria-label="导图画布"
        aria-describedby="mind-keyboard-help"
        tabIndex={0}
        onKeyDown={keyDown}
        onPointerDown={(event) => {
          const nodePointer = nodeDrag.current.current;
          const secondTouch = event.pointerType === 'touch' && nodePointer && nodePointer.pointerId !== event.pointerId;
          if (
            (event.button !== 0 && event.button !== 1) ||
            (event.target as HTMLElement).closest('.mind-canvas-controls') ||
            (!secondTouch && (event.target as HTMLElement).closest('[data-mind-node]'))
          )
            return;
          // A second touch switches a pending node drag to the normal canvas pinch.
          if (secondTouch) {
            pointers.current.set(nodePointer.pointerId, nodePointer.point);
            nodeDrag.cancel();
          }
          canvas.current?.focus({ preventScroll: true });
          setEditing(null);
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          setDragging(true);
          resetGesture();
        }}
        onPointerMove={(event) => {
          if (nodeDrag.current.current?.pointerId === event.pointerId) {
            nodeDrag.move(event.pointerId, { x: event.clientX, y: event.clientY });
            return;
          }
          if (!pointers.current.has(event.pointerId) || !gesture.current) return;
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const [a, second] = [...pointers.current.values()],
            b = second ?? a;
          const initial = gesture.current,
            rect = event.currentTarget.getBoundingClientRect();
          const centerX = (a.x + b.x) / 2,
            centerY = (a.y + b.y) / 2;
          let view = initial.view;
          if (second && initial.distance > 0)
            view = zoomAt(
              view,
              (view.zoom * Math.hypot(b.x - a.x, b.y - a.y)) / initial.distance,
              initial.x - rect.left - rect.width / 2,
              initial.y - rect.top - rect.height / 2,
            );
          changeView({
            ...view,
            x: view.x - (centerX - initial.x) / view.zoom,
            y: view.y - (centerY - initial.y) / view.zoom,
          });
        }}
        onPointerUp={(event) => {
          nodeDrag.finish(event.pointerId, { x: event.clientX, y: event.clientY });
          pointers.current.delete(event.pointerId);
          resetGesture();
        }}
        onPointerCancel={(event) => {
          nodeDrag.cancel();
          pointers.current.delete(event.pointerId);
          resetGesture();
        }}
        onLostPointerCapture={() => {
          if (nodeDrag.current.current) nodeDrag.cancel();
        }}
      >
        <div
          className="mind-world"
          style={{
            transform: `translate(${size.width / 2 - state.viewport.x * state.viewport.zoom}px, ${size.height / 2 - state.viewport.y * state.viewport.zoom}px) scale(${state.viewport.zoom})`,
          }}
        >
          <svg className="mind-edges" width="1" height="1" aria-hidden="true">
            {visible.edges.map((edge) => (
              <MindEdgeView key={edge.id} edge={edge} />
            ))}
          </svg>
          {visible.nodes.map((node) => (
            <MindNodeView
              key={node.id}
              node={node}
              selected={selected === node.id}
              editing={editingId === node.id}
              moving={nodeDrag.visual?.source === node.id}
              drop={nodeDrag.visual?.drop?.id === node.id ? nodeDrag.visual.drop.placement : null}
              editor={editor}
              actions={nodeActions}
            />
          ))}
          {nodeDrag.visual &&
            (() => {
              const node = geometry.nodes.find((n) => n.id === nodeDrag.visual?.source);
              if (!node) return null;
              return (
                <div
                  aria-hidden="true"
                  className={`mind-node mind-drag-ghost mind-branch-${node.branchColor} ${node.color ? 'has-custom-color' : ''}`}
                  style={
                    {
                      left: node.x - node.width / 2 + nodeDrag.visual.dx,
                      top: node.y - node.height / 2 + nodeDrag.visual.dy,
                      width: node.width,
                      minHeight: node.height,
                      ...customNodeColors(node.color),
                    } as CSSProperties
                  }
                >
                  <span className="mind-node-content">
                    {node.emoji && <span className="mind-node-emoji">{node.emoji} </span>}
                    {node.lines.join('\n')}
                  </span>
                </div>
              );
            })()}
        </div>
        <details className="mind-help mind-canvas-controls">
          <summary>快捷键</summary>
          <p id="mind-keyboard-help">
            Enter 同级 · Tab 子主题 · Delete 删除分支
            <br />
            双击 / F2 编辑 · Shift+Enter 换行
            <br />⌘ / Ctrl+Z 撤销 · Shift+Tab 离开画布
            <br />
            拖动画布 / 双指滑动平移 · 双指捏合缩放
            <br />
            拖动主题：上 / 下调整顺序，中间 / 后侧变为子主题
            <br />
            全屏时 Esc 退出
          </p>
        </details>
        <div className="mind-zoom mind-canvas-controls">
          <button
            aria-label="缩小"
            onClick={() => changeView({ ...latest.current.viewport, zoom: latest.current.viewport.zoom / 1.2 })}
          >
            <Minus size={16} />
          </button>
          <button aria-label="重置为 100%" onClick={() => changeView({ ...latest.current.viewport, zoom: 1 })}>
            {Math.round(state.viewport.zoom * 100)}%
          </button>
          <button
            aria-label="放大"
            onClick={() => changeView({ ...latest.current.viewport, zoom: latest.current.viewport.zoom * 1.2 })}
          >
            <Plus size={16} />
          </button>
          <button aria-label="适应画布" onClick={fit}>
            <Maximize size={16} />
          </button>
        </div>
        <button
          className={`mind-sync mind-canvas-controls is-${snapshot.status}`}
          onClick={onRetry}
          aria-label={`云端同步：${statusText[snapshot.status]}`}
        >
          <span aria-hidden="true" />
          <span role="status">{statusText[snapshot.status]}</span>
        </button>
      </div>
      <div className="mind-editor-footer">
        <span>{state.nodes.length} 个主题</span>
        <span role="status">
          {notice || (fullscreen.mode === 'window' ? '页面全屏 · Esc 退出' : '双击主题开始编辑')}
        </span>
      </div>
    </div>
  );
}
