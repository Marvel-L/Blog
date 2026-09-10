/**
 * Road DAG 分层布局：按根拓扑分层，同层横向排布，输出节点坐标与边。
 */

import type { RoadNodeConfig } from '@config/road.config';

export type RoadLayoutNode = RoadNodeConfig & {
  x: number;
  y: number;
  level: number;
};

export type RoadLayoutEdge = {
  id: string;
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type RoadLayout = {
  nodes: RoadLayoutNode[];
  edges: RoadLayoutEdge[];
  width: number;
  height: number;
};

const NODE_WIDTH = 132;
const NODE_HEIGHT = 40;
const H_GAP = 80;
const V_GAP = 88;
const PADDING = 40;

/** 从根出发按拓扑分层；无法到达的节点追加到末层。 */
export const computeLevels = (nodes: RoadNodeConfig[], rootId: string): Map<string, number> => {
  const levels = new Map<string, number>();
  const queue: string[] = [];

  if (nodes.some((node) => node.id === rootId)) {
    levels.set(rootId, 0);
    queue.push(rootId);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current) ?? 0;
    for (const node of nodes) {
      if (!(node.parents ?? []).includes(current)) {
        continue;
      }
      const nextLevel = currentLevel + 1;
      const existing = levels.get(node.id);
      if (existing === undefined || nextLevel > existing) {
        levels.set(node.id, nextLevel);
        queue.push(node.id);
      }
    }
  }

  let maxLevel = 0;
  for (const level of levels.values()) {
    maxLevel = Math.max(maxLevel, level);
  }
  const orphanLevel = levels.size > 0 ? maxLevel + 1 : 0;
  for (const node of nodes) {
    if (!levels.has(node.id)) {
      levels.set(node.id, orphanLevel);
    }
  }

  return levels;
};

/** 枚举从 root 到所有叶节点的完整路径（节点 id 序列）。 */
export const enumeratePaths = (nodes: RoadNodeConfig[], rootId: string): string[][] => {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    for (const parent of node.parents ?? []) {
      const list = children.get(parent) ?? [];
      list.push(node.id);
      children.set(parent, list);
    }
  }

  const paths: string[][] = [];
  const walk = (nodeId: string, trail: string[]) => {
    const next = children.get(nodeId) ?? [];
    const path = [...trail, nodeId];
    if (next.length === 0) {
      paths.push(path);
      return;
    }
    for (const child of next) {
      if (trail.includes(child)) {
        continue;
      }
      walk(child, path);
    }
  };

  if (nodes.some((node) => node.id === rootId)) {
    walk(rootId, []);
  }
  return paths;
};

/** 计算节点中心坐标与边端点，供 SVG 渲染。 */
export const layoutRoadGraph = (nodes: RoadNodeConfig[], rootId: string): RoadLayout => {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: PADDING * 2, height: PADDING * 2 };
  }

  const levels = computeLevels(nodes, rootId);
  const byLevel = new Map<number, RoadNodeConfig[]>();
  for (const node of nodes) {
    const level = levels.get(node.id) ?? 0;
    const list = byLevel.get(level) ?? [];
    list.push(node);
    byLevel.set(level, list);
  }

  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
  let maxRowWidth = 0;
  for (const level of sortedLevels) {
    const row = byLevel.get(level) ?? [];
    const rowWidth = row.length * NODE_WIDTH + Math.max(0, row.length - 1) * H_GAP;
    maxRowWidth = Math.max(maxRowWidth, rowWidth);
  }

  const positioned: RoadLayoutNode[] = [];
  for (const level of sortedLevels) {
    const row = byLevel.get(level) ?? [];
    const rowWidth = row.length * NODE_WIDTH + Math.max(0, row.length - 1) * H_GAP;
    const startX = PADDING + (maxRowWidth - rowWidth) / 2;
    row.forEach((node, index) => {
      positioned.push({
        ...node,
        level,
        x: startX + index * (NODE_WIDTH + H_GAP) + NODE_WIDTH / 2,
        y: PADDING + level * (NODE_HEIGHT + V_GAP) + NODE_HEIGHT / 2,
      });
    });
  }

  const byPos = new Map(positioned.map((node) => [node.id, node]));
  const edges: RoadLayoutEdge[] = [];
  for (const node of positioned) {
    for (const parentId of node.parents ?? []) {
      const parent = byPos.get(parentId);
      if (!parent) {
        continue;
      }
      edges.push({
        id: `${parentId}->${node.id}`,
        from: parentId,
        to: node.id,
        x1: parent.x,
        y1: parent.y + NODE_HEIGHT / 2,
        x2: node.x,
        y2: node.y - NODE_HEIGHT / 2,
      });
    }
  }

  const width = maxRowWidth + PADDING * 2;
  const height = sortedLevels.length * NODE_HEIGHT + Math.max(0, sortedLevels.length - 1) * V_GAP + PADDING * 2;

  return { nodes: positioned, edges, width, height };
};

export const ROAD_NODE_WIDTH = NODE_WIDTH;
export const ROAD_NODE_HEIGHT = NODE_HEIGHT;
