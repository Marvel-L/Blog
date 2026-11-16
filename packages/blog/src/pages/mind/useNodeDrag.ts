import { useEffect, useRef, useState } from 'react';
import { branchIds, moveNode, type DropPlacement, type MindState, type PlacedNode } from './model';

export interface NodeDrop {
  id: string;
  placement: DropPlacement;
  rootSide?: -1 | 1;
}
interface Point {
  x: number;
  y: number;
}
interface Drag {
  source: string;
  pointerId: number;
  start: Point;
  point: Point;
  active: boolean;
}
interface Visual {
  source: string;
  dx: number;
  dy: number;
  drop: NodeDrop | null;
}

export function nodeDropAt(
  state: MindState,
  nodes: PlacedNode[],
  source: string,
  point: Point,
  margin = 16,
): NodeDrop | null {
  const excluded = branchIds(state.nodes, source);
  const target = nodes
    .filter(
      (n) =>
        !excluded.has(n.id) &&
        Math.abs(n.x - point.x) <= n.width / 2 + margin &&
        Math.abs(n.y - point.y) <= n.height / 2 + margin,
    )
    .sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
  if (!target) return null;
  const ratio = (point.y - (target.y - target.height / 2)) / target.height;
  const outwardEdge = (point.x - target.x) * (target.x < 0 ? -1 : 1) > target.width / 2 - 18;
  const placement =
    !target.parentId || outwardEdge ? 'child' : ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'child';
  const rootSide = !target.parentId && state.layout === 'mind' ? (point.x < target.x ? -1 : 1) : undefined;
  const drop = { id: target.id, placement, rootSide } as NodeDrop;
  return moveNode(state, source, target.id, placement, rootSide) === state ? null : drop;
}

export function useNodeDrag(
  state: MindState,
  nodes: PlacedNode[],
  rect: () => DOMRect | undefined,
  onDrop: (source: string, drop: NodeDrop) => void,
) {
  const drag = useRef<Drag | null>(null);
  const [visual, setVisual] = useState<Visual | null>(null);
  const frame = useRef(0);
  const suppressClick = useRef(false);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => {
    const blur = () => {
      if (!drag.current) return;
      suppressClick.current = drag.current.active;
      drag.current = null;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      setVisual(null);
    };
    window.addEventListener('blur', blur);
    return () => window.removeEventListener('blur', blur);
  }, []);
  const preview = (): Visual | null => {
    const value = drag.current,
      bounds = rect();
    if (!value?.active || !bounds) return null;
    const zoom = state.viewport.zoom;
    const point = {
      x: (value.point.x - bounds.left - bounds.width / 2) / zoom + state.viewport.x,
      y: (value.point.y - bounds.top - bounds.height / 2) / zoom + state.viewport.y,
    };
    return {
      source: value.source,
      dx: (value.point.x - value.start.x) / zoom,
      dy: (value.point.y - value.start.y) / zoom,
      drop: nodeDropAt(state, nodes, value.source, point, 16 / zoom),
    };
  };
  return {
    visual,
    current: drag,
    start: (source: string, pointerId: number, point: Point) => {
      suppressClick.current = false;
      drag.current = { source, pointerId, start: point, point, active: false };
    },
    move: (pointerId: number, point: Point) => {
      const value = drag.current;
      if (!value || value.pointerId !== pointerId) return;
      value.point = point;
      if (Math.hypot(point.x - value.start.x, point.y - value.start.y) >= 6) value.active = true;
      if (value.active && !frame.current)
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          setVisual(preview());
        });
    },
    finish: (pointerId: number, point: Point) => {
      const value = drag.current;
      if (!value || value.pointerId !== pointerId) return;
      value.point = point;
      const result = preview();
      suppressClick.current = value.active;
      drag.current = null;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      setVisual(null);
      if (result?.drop) onDrop(value.source, result.drop);
    },
    cancel: () => {
      suppressClick.current = !!drag.current?.active;
      drag.current = null;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      setVisual(null);
    },
    consumeClick: () => {
      const suppress = suppressClick.current;
      suppressClick.current = false;
      return suppress;
    },
  };
}
