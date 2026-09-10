/**
 * Road 画布：全幅点阵底 + 直线连边 + HTML 节点（Obsidian 风格）。
 * 空白拖拽平移；节点点击打开文章，不与拖拽冲突。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoadNodeConfig } from '@config/road.config';
import { layoutRoadGraph, ROAD_NODE_HEIGHT, ROAD_NODE_WIDTH, type RoadLayoutEdge } from './layout';

interface RoadGraphProps {
  nodes: RoadNodeConfig[];
  rootId: string;
  selectedNodeId?: string | null;
  highlightedPath?: string[] | null;
  onSelectNode: (node: RoadNodeConfig) => void;
}

const isEdgeHighlighted = (edge: RoadLayoutEdge, path: string[] | null | undefined) => {
  if (!path || path.length < 2) {
    return false;
  }
  for (let i = 0; i < path.length - 1; i += 1) {
    if (path[i] === edge.from && path[i + 1] === edge.to) {
      return true;
    }
  }
  return false;
};

export const RoadGraph: React.FC<RoadGraphProps> = ({
  nodes,
  rootId,
  selectedNodeId,
  highlightedPath,
  onSelectNode,
}) => {
  const layout = useMemo(() => layoutRoadGraph(nodes, rootId), [nodes, rootId]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const centerGraph = useCallback(() => {
    const el = viewportRef.current;
    if (!el || layout.width === 0) {
      return;
    }
    const nextScale = Math.min(1.15, Math.max(0.7, (el.clientWidth - 48) / layout.width));
    setScale(nextScale);
    setOffset({
      x: (el.clientWidth - layout.width * nextScale) / 2,
      y: Math.max(32, (el.clientHeight - layout.height * nextScale) / 2),
    });
    setReady(true);
  }, [layout.height, layout.width]);

  useEffect(() => {
    centerGraph();
  }, [centerGraph, rootId]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => centerGraph());
    observer.observe(el);
    return () => observer.disconnect();
  }, [centerGraph]);

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.06 : 0.06;
    setScale((prev) => Math.min(1.8, Math.max(0.5, prev + delta)));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('[data-road-node]')) {
      return;
    }
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) {
      return;
    }
    setOffset({
      x: pan.originX + (event.clientX - pan.startX),
      y: pan.originY + (event.clientY - pan.startY),
    });
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) {
      return;
    }
    panRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div
      ref={viewportRef}
      className="road-canvas relative h-full w-full cursor-grab touch-none overflow-hidden active:cursor-grabbing"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
    >
      <div className="pointer-events-none absolute inset-0 road-canvas-grid" aria-hidden />

      <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-md border border-zinc-200/80 bg-paper/90 p-0.5 text-zinc-500 backdrop-blur dark:border-zinc-700/80 dark:bg-zinc-900/90 dark:text-zinc-400">
        <button
          type="button"
          onClick={() => setScale((prev) => Math.min(1.8, prev + 0.1))}
          className="h-7 w-7 rounded text-sm hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          aria-label="放大"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setScale((prev) => Math.max(0.5, prev - 0.1))}
          className="h-7 w-7 rounded text-sm hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          aria-label="缩小"
        >
          −
        </button>
        <button
          type="button"
          onClick={centerGraph}
          className="h-7 rounded px-2 text-[11px] hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          居中
        </button>
      </div>

      <div
        className="absolute left-0 top-0 origin-top-left will-change-transform"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          opacity: ready ? 1 : 0,
          transition: ready ? undefined : 'opacity 120ms ease',
        }}
      >
        <svg width={layout.width} height={layout.height} className="overflow-visible" aria-hidden>
          <defs>
            <marker
              id="road-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="4.5"
              markerHeight="4.5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#a1a1aa" />
            </marker>
            <marker
              id="road-arrow-hi"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="4.5"
              markerHeight="4.5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#27272a" />
            </marker>
          </defs>
          {layout.edges.map((edge) => {
            const active = isEdgeHighlighted(edge, highlightedPath);
            return (
              <line
                key={edge.id}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                markerEnd={active ? 'url(#road-arrow-hi)' : 'url(#road-arrow)'}
                stroke="currentColor"
                strokeWidth={active ? 1.75 : 1.15}
                className={active ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-300 dark:text-zinc-600'}
              />
            );
          })}
        </svg>

        {layout.nodes.map((node) => {
          const selected = selectedNodeId === node.id;
          const onPath = Boolean(highlightedPath?.includes(node.id));
          const postCount = node.posts?.length ?? 0;
          return (
            <button
              key={node.id}
              type="button"
              data-road-node={node.id}
              onClick={() => onSelectNode(node)}
              aria-label={`${node.title}${postCount ? `，${postCount} 篇文章` : ''}`}
              className={`absolute flex items-center justify-center rounded-full border text-[13px] font-medium shadow-sm transition-colors ${
                selected
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : onPath
                    ? 'border-zinc-800 bg-paper text-zinc-900 dark:border-zinc-200 dark:bg-zinc-900 dark:text-zinc-100'
                    : 'border-zinc-300/90 bg-paper text-zinc-800 hover:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-400'
              }`}
              style={{
                left: node.x - ROAD_NODE_WIDTH / 2,
                top: node.y - ROAD_NODE_HEIGHT / 2,
                width: ROAD_NODE_WIDTH,
                height: ROAD_NODE_HEIGHT,
              }}
            >
              <span className="truncate px-3">{node.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
