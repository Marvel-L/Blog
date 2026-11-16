import { describe, expect, it } from 'vitest';
import {
  customNodeColors,
  insertNode,
  layoutMind,
  moveNode,
  newMindState,
  nodeSize,
  nodeTextLines,
  parseMindState,
  removeNode,
  zoomAt,
} from './model';
import { nodeDropAt } from './useNodeDrag';

describe('Mind tree and viewport', () => {
  it('creates siblings in order, root Enter creates a child, subtree deletion leaves the root', () => {
    let state = newMindState('mind');
    const root = state.nodes[0].id,
      a = crypto.randomUUID(),
      b = crypto.randomUUID(),
      child = crypto.randomUUID();
    state = insertNode(state, root, 'sibling', a);
    state = insertNode(state, a, 'child', child);
    state = insertNode(state, a, 'sibling', b);
    expect(state.nodes.filter((n) => n.parentId === root).map((n) => n.id)).toEqual([a, b]);
    expect(state.nodes.find((n) => n.id === child)?.parentId).toBe(a);
    state = removeNode(state, a);
    expect(state.nodes.map((n) => n.id)).toEqual([root, b]);
    expect(removeNode(state, root)).toBe(state);
  });
  it('lays out variable node sizes on both sides without overlapping, logic layout expands right', () => {
    let state = newMindState('mind');
    for (let i = 0; i < 8; i++) {
      const id = crypto.randomUUID();
      state = insertNode(state, state.nodes[0].id, 'child', id);
      state = {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, text: i % 2 ? '短主题' : '这是一个不自动换行的长主题'.repeat(8) } : n,
        ),
      };
      state = insertNode(state, id, 'child', crypto.randomUUID());
    }
    const { nodes, edges } = layoutMind(state);
    expect(nodes.some((n) => n.x < 0)).toBe(true);
    expect(nodes.some((n) => n.x > 0)).toBe(true);
    expect(edges).toHaveLength(nodes.length - 1);
    for (const a of nodes)
      for (const b of nodes)
        if (a.id !== b.id) {
          const overlaps =
            Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2;
          expect(overlaps).toBe(false);
        }
    expect(layoutMind({ ...state, layout: 'logic' }).nodes.every((n) => n.x >= 0)).toBe(true);
  });
  it('sizes the node to its text, prefixes markers inline and only splits manual line breaks', () => {
    const node = newMindState('mind').nodes[0];
    const long = 'This is one unbroken line of mixed 中文 content'.repeat(3);
    expect(nodeTextLines(long)).toEqual([long]);
    expect(nodeTextLines('第一行\n\n第三行\r\n最后一行')).toEqual(['第一行', '', '第三行', '最后一行']);
    expect(nodeSize({ ...node, text: long }).width).toBeGreaterThan(nodeSize({ ...node, text: '短' }).width);
    const plain = nodeSize({ ...node, text: '主题' });
    const marked = nodeSize({ ...node, text: '主题', emoji: '✅' });
    expect(marked.width).toBeGreaterThan(plain.width);
    expect(marked.height).toBe(plain.height);
    expect(nodeSize({ ...node, text: '第一行\n第二行' }).height).toBeGreaterThan(plain.height);
  });
  it('accepts optional persisted colors and keeps legacy nodes valid', () => {
    const state = newMindState('logic');
    expect(parseMindState(state)).not.toBeNull();
    expect(parseMindState({ ...state, nodes: state.nodes.map((n) => ({ ...n, color: '#AbC123' })) })).not.toBeNull();
    expect(parseMindState({ ...state, nodes: state.nodes.map((n) => ({ ...n, color: 'url(example)' })) })).toBeNull();
    expect(customNodeColors('#000000')['--branch-text']).toBe('#ffffff');
    expect(customNodeColors('#ffffff')['--branch-text']).toBe('#15241d');
  });
  it('moves before/after a sibling and reparents a complete branch without losing content', () => {
    let state = newMindState('logic');
    const root = state.nodes[0].id,
      a = crypto.randomUUID(),
      b = crypto.randomUUID(),
      c = crypto.randomUUID();
    state = insertNode(state, root, 'child', a);
    state = insertNode(state, a, 'sibling', b);
    state = insertNode(state, a, 'child', c);
    state = {
      ...state,
      nodes: state.nodes.map((n) =>
        n.id === c ? { ...n, color: '#edf5fb', emoji: '✅', text: '保留内容\n手动换行' } : n,
      ),
    };
    const before = moveNode(state, b, a, 'before');
    expect(before.nodes.filter((n) => n.parentId === root).map((n) => n.id)).toEqual([b, a]);
    const after = moveNode(before, b, a, 'after');
    expect(after.nodes.filter((n) => n.parentId === root).map((n) => n.id)).toEqual([a, b]);
    const child = moveNode(state, a, b, 'child');
    expect(child.nodes.find((n) => n.id === a)?.parentId).toBe(b);
    expect(child.nodes.find((n) => n.id === c)).toEqual(
      expect.objectContaining({
        parentId: a,
        color: '#edf5fb',
        emoji: '✅',
        text: '保留内容\n手动换行',
      }),
    );
    expect(moveNode(state, root, a, 'child')).toBe(state);
    expect(moveNode(state, a, c, 'child')).toBe(state);
    expect(moveNode(state, a, a, 'before')).toBe(state);
    expect(moveNode(state, a, root, 'before')).toBe(state);
  });
  it('propagates the destination side and rejects moves that exceed the depth limit', () => {
    let state = newMindState('mind');
    const root = state.nodes[0].id,
      a = crypto.randomUUID(),
      b = crypto.randomUUID(),
      c = crypto.randomUUID();
    state = insertNode(state, root, 'child', a);
    state = insertNode(state, root, 'child', b);
    state = insertNode(state, a, 'child', c);
    const moved = moveNode(state, a, b, 'child');
    expect(moved.nodes.filter((n) => [a, b, c].some((id) => id === n.id)).every((n) => n.side === -1)).toBe(true);
    let parent = c;
    for (let depth = 2; depth < 32; depth++) {
      const id = crypto.randomUUID();
      state = insertNode(state, parent, 'child', id);
      parent = id;
    }
    expect(moveNode(state, a, b, 'child')).toBe(state);
  });
  it('detects top/bottom/child drop zones and excludes the dragged branch', () => {
    let state = newMindState('logic');
    const root = state.nodes[0].id,
      a = crypto.randomUUID(),
      b = crypto.randomUUID();
    state = insertNode(state, root, 'child', a);
    state = insertNode(state, a, 'sibling', b);
    const placed = layoutMind(state).nodes;
    const target = placed.find((n) => n.id === a)!,
      second = placed.find((n) => n.id === b)!;
    expect(nodeDropAt(state, placed, b, { x: target.x, y: target.y - target.height / 2 + 3 })?.placement).toBe(
      'before',
    );
    expect(nodeDropAt(state, placed, a, { x: second.x, y: second.y + second.height / 2 - 3 })?.placement).toBe('after');
    expect(nodeDropAt(state, placed, a, { x: second.x, y: second.y })?.placement).toBe('child');
    expect(
      nodeDropAt(state, placed, a, { x: placed.find((n) => n.id === a)!.x, y: placed.find((n) => n.id === a)!.y }),
    ).toBeNull();
  });
  it('rejects cycles, duplicate roots, missing parents, invalid zoom and excessive depth', () => {
    const state = newMindState('mind'),
      id = crypto.randomUUID();
    const child = insertNode(state, state.nodes[0].id, 'child', id);
    expect(parseMindState(child)).not.toBeNull();
    expect(
      parseMindState({ ...child, nodes: child.nodes.map((n) => (n.id === id ? { ...n, parentId: id } : n)) }),
    ).toBeNull();
    expect(parseMindState({ ...child, nodes: child.nodes.map((n) => ({ ...n, parentId: null })) })).toBeNull();
    expect(parseMindState({ ...child, viewport: { x: 0, y: 0, zoom: Infinity } })).toBeNull();
    let deep = state,
      parent = state.nodes[0].id;
    for (let i = 0; i < 32; i++) {
      const next = crypto.randomUUID();
      deep = insertNode(deep, parent, 'child', next);
      parent = next;
    }
    expect(parseMindState(deep)).not.toBeNull();
    expect(insertNode(deep, parent, 'child', crypto.randomUUID())).toBe(deep);
  });
  it('keeps the cursor anchored and clamps zoom without changing the world point', () => {
    const before = { x: 80, y: -40, zoom: 1 };
    const after = zoomAt(before, 10, 150, -90);
    expect(after.zoom).toBe(3);
    expect(after.x + 150 / after.zoom).toBeCloseTo(before.x + 150 / before.zoom);
    expect(after.y - 90 / after.zoom).toBeCloseTo(before.y - 90 / before.zoom);
  });
});
