export const MARKERS = ['✅', '❌', '⭐', '💡', '🔥', '❓', '🎯', '🚀'] as const;
export const MAX_NODES = 1000;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type MindLayout = 'mind' | 'logic';
export interface MindNode {
  id: string;
  parentId: string | null;
  text: string;
  emoji: string;
  side: -1 | 1;
}
/** x/y are the world coordinate at the viewport center, independent of screen size. */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}
export interface MindState {
  version: 1;
  title: string;
  layout: MindLayout;
  nodes: MindNode[];
  viewport: Viewport;
}
export interface MindMap {
  id: string;
  state: MindState;
  revision: number;
  updatedAt: string;
}
export interface MindSummary {
  id: string;
  title: string;
  layout: MindLayout;
  nodeCount: number;
  updatedAt: string;
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' &&
  Array.from(v).length <= max &&
  Array.from(v).every((c) => {
    const code = c.codePointAt(0)!;
    return (code >= 32 && !(code >= 127 && code <= 159)) || [9, 10, 13].includes(code);
  });

export function parseMindState(value: unknown): MindState | null {
  if (
    !record(value) ||
    value.version !== 1 ||
    !text(value.title, 120) ||
    !value.title.trim() ||
    !['mind', 'logic'].includes(String(value.layout)) ||
    !Array.isArray(value.nodes) ||
    !value.nodes.length ||
    value.nodes.length > MAX_NODES ||
    !record(value.viewport)
  )
    return null;
  const { x, y, zoom } = value.viewport;
  if (
    ![x, y, zoom].every((v) => typeof v === 'number' && Number.isFinite(v)) ||
    Math.abs(x as number) > 1000000 ||
    Math.abs(y as number) > 1000000 ||
    (zoom as number) < 0.15 ||
    (zoom as number) > 3
  )
    return null;
  const nodes = new Map<string, MindNode>();
  let root: string | null = null;
  for (const v of value.nodes) {
    if (
      !record(v) ||
      typeof v.id !== 'string' ||
      !UUID.test(v.id) ||
      nodes.has(v.id) ||
      !(v.parentId === null || (typeof v.parentId === 'string' && UUID.test(v.parentId))) ||
      !text(v.text, 200) ||
      typeof v.emoji !== 'string' ||
      (v.emoji !== '' && !(MARKERS as readonly string[]).includes(v.emoji)) ||
      (v.side !== 1 && v.side !== -1)
    )
      return null;
    if (v.parentId === null) {
      if (root) return null;
      root = v.id;
    }
    nodes.set(v.id, v as unknown as MindNode);
  }
  if (!root) return null;
  for (const node of nodes.values()) {
    let current = node.id;
    for (let depth = 0; current !== root; depth++) {
      const parent = nodes.get(current)?.parentId;
      if (!parent || depth >= 32) return null;
      current = parent;
    }
  }
  return value as unknown as MindState;
}

export function newMindState(layout: MindLayout): MindState {
  return {
    version: 1,
    title: '未命名导图',
    layout,
    nodes: [{ id: crypto.randomUUID(), parentId: null, text: '中心主题', emoji: '', side: 1 }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function insertNode(state: MindState, selectedId: string, relation: 'child' | 'sibling', id: string): MindState {
  const selected = state.nodes.find((n) => n.id === selectedId);
  if (!selected || state.nodes.length >= MAX_NODES) return state;
  // The root has no sibling; Enter creates its first-level topic.
  const parentId = relation === 'child' || selected.parentId === null ? selected.id : selected.parentId;
  let parent = state.nodes.find((n) => n.id === parentId);
  const directParent = parent;
  let depth = 1;
  while (parent?.parentId) {
    depth++;
    parent = state.nodes.find((n) => n.id === parent?.parentId);
  }
  if (depth > 32) return state;
  const children = state.nodes.filter((n) => n.parentId === parentId);
  const side =
    relation === 'sibling' && selected.parentId
      ? selected.side
      : directParent?.parentId === null
        ? children.filter((n) => n.side === 1).length <= children.filter((n) => n.side === -1).length
          ? 1
          : -1
        : selected.side;
  const node: MindNode = { id, parentId, text: '新主题', emoji: '', side };
  const nodes = [...state.nodes];
  const position =
    relation === 'sibling' && selected.parentId ? nodes.findIndex((n) => n.id === selected.id) + 1 : nodes.length;
  nodes.splice(position, 0, node);
  return { ...state, nodes };
}

export function removeNode(state: MindState, id: string): MindState {
  if (!state.nodes.some((n) => n.id === id && n.parentId !== null)) return state;
  const removed = new Set([id]);
  for (let i = 0; i < 32; i++) {
    const size = removed.size;
    for (const n of state.nodes) if (n.parentId && removed.has(n.parentId)) removed.add(n.id);
    if (removed.size === size) break;
  }
  return { ...state, nodes: state.nodes.filter((n) => !removed.has(n.id)) };
}

export function clampView(view: Viewport): Viewport {
  return {
    x: Math.max(-1000000, Math.min(1000000, view.x)),
    y: Math.max(-1000000, Math.min(1000000, view.y)),
    zoom: Math.max(0.15, Math.min(3, view.zoom)),
  };
}

/** Keep the world point under the cursor stationary while zooming. */
export function zoomAt(view: Viewport, zoom: number, dx: number, dy: number): Viewport {
  const next = clampView({ ...view, zoom });
  return clampView({
    ...next,
    x: view.x + dx / view.zoom - dx / next.zoom,
    y: view.y + dy / view.zoom - dy / next.zoom,
  });
}

export function wrapNodeText(value: string): string[] {
  const lines: string[] = [];
  let line = '',
    width = 0;
  for (const c of Array.from(value || '未命名主题')) {
    const unit = /[^\x20-\x7e]/.test(c) ? 2 : 1;
    if (c === '\n' || width + unit > 20) {
      lines.push(line);
      line = '';
      width = 0;
      if (c === '\n') continue;
    }
    line += c;
    width += unit;
  }
  lines.push(line);
  return lines;
}

export interface PlacedNode extends MindNode {
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  lines: string[];
}
export function layoutMind(state: Pick<MindState, 'nodes' | 'layout'>) {
  const root = state.nodes.find((n) => n.parentId === null)!;
  const children = new Map<string, MindNode[]>();
  for (const n of state.nodes) if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  const dimensions = new Map(
    state.nodes.map((n) => {
      const lines = wrapNodeText(n.text);
      return [
        n.id,
        {
          lines,
          width: n.parentId === null ? 220 : 200,
          height: Math.max(52, lines.length * 22 + 28 + (n.emoji ? 24 : 0)),
        },
      ];
    }),
  );
  const heights = new Map<string, number>();
  const height = (node: MindNode): number => {
    if (heights.has(node.id)) return heights.get(node.id)!;
    const kids = children.get(node.id) ?? [];
    const value = Math.max(
      dimensions.get(node.id)!.height,
      kids.reduce((sum, n) => sum + height(n), 0) + Math.max(0, kids.length - 1) * 24,
    );
    heights.set(node.id, value);
    return value;
  };
  const placed: PlacedNode[] = [{ ...root, ...dimensions.get(root.id)!, x: 0, y: 0, color: -1 }];
  const placeGroup = (kids: MindNode[], parent: PlacedNode, side: -1 | 1, branchColor?: number) => {
    let top = parent.y - (kids.reduce((sum, n) => sum + height(n), 0) + Math.max(0, kids.length - 1) * 24) / 2;
    for (const n of kids) {
      const dim = dimensions.get(n.id)!;
      const color = branchColor ?? (children.get(root.id) ?? []).findIndex((child) => child.id === n.id) % 5;
      const item = {
        ...n,
        ...dim,
        x: parent.x + side * (parent.width / 2 + 64 + dim.width / 2),
        y: top + height(n) / 2,
        color,
      };
      placed.push(item);
      placeGroup(children.get(n.id) ?? [], item, side, color);
      top += height(n) + 24;
    }
  };
  const first = children.get(root.id) ?? [];
  placeGroup(state.layout === 'logic' ? first : first.filter((n) => n.side === 1), placed[0], 1);
  if (state.layout === 'mind')
    placeGroup(
      first.filter((n) => n.side === -1),
      placed[0],
      -1,
    );
  const byId = new Map(placed.map((n) => [n.id, n]));
  const edges = placed
    .filter((n) => n.parentId)
    .map((n) => {
      const parent = byId.get(n.parentId!)!;
      const side = n.x > parent.x ? 1 : -1;
      const from = parent.x + (side * parent.width) / 2,
        to = n.x - (side * n.width) / 2;
      const middle = (from + to) / 2;
      return {
        id: n.id,
        color: n.color,
        d: `M ${from} ${parent.y} C ${middle} ${parent.y}, ${middle} ${n.y}, ${to} ${n.y}`,
      };
    });
  const bounds = {
    left: Math.min(...placed.map((n) => n.x - n.width / 2)),
    right: Math.max(...placed.map((n) => n.x + n.width / 2)),
    top: Math.min(...placed.map((n) => n.y - n.height / 2)),
    bottom: Math.max(...placed.map((n) => n.y + n.height / 2)),
  };
  return { nodes: placed, edges, bounds };
}
