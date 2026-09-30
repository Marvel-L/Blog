/**
 * Road 画布：全幅点阵底 + 直线连边 + HTML 节点（Obsidian 风格）。
 * 空白拖拽平移；滚轮以鼠标位置为锚点缩放；位置与缩放持久化。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoadNodeConfig } from '@config/road.config';
import { readRoadViewport, resolveNodeArticles, type RoadViewportState, writeRoadViewport } from '@/services/road';
import { layoutRoadGraph, ROAD_NODE_HEIGHT, ROAD_NODE_WIDTH } from './layout';

interface RoadGraphProps {
  graphId: string;
  nodes: RoadNodeConfig[];
  rootId: string;
  selectedNodeId?: string | null;
  onSelectNode: (node: RoadNodeConfig) => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 1.8;
const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

export const RoadGraph: React.FC<RoadGraphProps> = ({
  graphId,
  nodes,
  rootId,
  selectedNodeId,
  onSelectNode,
}) => {
  const layout = useMemo(() => layoutRoadGraph(nodes, rootId), [nodes, rootId]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewportSizeRef = useRef<{ width: number; height: number } | null>(null);
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

  const buildCenteredViewport = useCallback(
    (el: HTMLDivElement): RoadViewportState | null => {
      if (layout.width === 0) {
        return null;
      }
      const nextScale = Math.min(1.15, Math.max(0.7, (el.clientWidth - 48) / layout.width));
      return {
        scale: nextScale,
        offsetX: (el.clientWidth - layout.width * nextScale) / 2,
        offsetY: Math.max(32, (el.clientHeight - layout.height * nextScale) / 2),
      };
    },
    [layout.height, layout.width],
  );

  const applyViewport = useCallback((nextViewport: RoadViewportState) => {
    setScale(nextViewport.scale);
    setOffset({
      x: nextViewport.offsetX,
      y: nextViewport.offsetY,
    });
    setReady(true);
  }, []);

  const centerGraph = useCallback(() => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }
    const nextViewport = buildCenteredViewport(el);
    if (!nextViewport) {
      return;
    }
    applyViewport(nextViewport);
  }, [applyViewport, buildCenteredViewport]);

  const scaleAroundPoint = useCallback(
    (nextScale: number, anchorX: number, anchorY: number) => {
      const clampedScale = clampScale(nextScale);
      if (clampedScale === scale) {
        return;
      }
      const graphX = (anchorX - offset.x) / scale;
      const graphY = (anchorY - offset.y) / scale;
      setScale(clampedScale);
      setOffset({
        x: anchorX - graphX * clampedScale,
        y: anchorY - graphY * clampedScale,
      });
      setReady(true);
    },
    [offset.x, offset.y, scale],
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }
    const savedViewport = readRoadViewport(graphId);
    const nextViewport = savedViewport ?? buildCenteredViewport(el);
    if (!nextViewport) {
      return;
    }
    viewportSizeRef.current = { width: el.clientWidth, height: el.clientHeight };
    applyViewport(nextViewport);
  }, [applyViewport, buildCenteredViewport, graphId, rootId]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      const previous = viewportSizeRef.current;
      const next = { width: el.clientWidth, height: el.clientHeight };
      viewportSizeRef.current = next;

      if (!previous) {
        const nextViewport = readRoadViewport(graphId) ?? buildCenteredViewport(el);
        if (nextViewport) {
          applyViewport(nextViewport);
        }
        return;
      }

      const deltaX = (next.width - previous.width) / 2;
      const deltaY = (next.height - previous.height) / 2;
      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      setOffset((current) => ({
        x: current.x + deltaX,
        y: current.y + deltaY,
      }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [applyViewport, buildCenteredViewport, graphId]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    writeRoadViewport(graphId, {
      scale,
      offsetX: offset.x,
      offsetY: offset.y,
    });
  }, [graphId, offset.x, offset.y, ready, scale]);

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.06 : 0.06;
    const rect = event.currentTarget.getBoundingClientRect();
    scaleAroundPoint(scale + delta, event.clientX - rect.left, event.clientY - rect.top);
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
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
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
      data-road-viewport
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
          onClick={() => {
            const el = viewportRef.current;
            if (!el) {
              return;
            }
            scaleAroundPoint(scale + 0.1, el.clientWidth / 2, el.clientHeight / 2);
          }}
          className="h-7 w-7 rounded text-sm hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          aria-label="放大"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            const el = viewportRef.current;
            if (!el) {
              return;
            }
            scaleAroundPoint(scale - 0.1, el.clientWidth / 2, el.clientHeight / 2);
          }}
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
        data-road-stage
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
            return (
              <line
                key={edge.id}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                markerEnd="url(#road-arrow)"
                stroke="currentColor"
                strokeWidth={1.15}
                className="text-zinc-300 dark:text-zinc-600"
              />
            );
          })}
        </svg>

        {layout.nodes.map((node) => {
          const selected = selectedNodeId === node.id;
          const postCount = resolveNodeArticles(node).articles.filter((article) => article.post).length;
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
