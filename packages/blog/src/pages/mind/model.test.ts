import { describe, expect, it } from 'vitest';
import { insertNode, layoutMind, newMindState, parseMindState, removeNode, zoomAt } from './model';

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
  it('lays out both sides without overlapping long nodes, logic layout expands right', () => {
    let state = newMindState('mind');
    for (let i = 0; i < 8; i++) {
      const id = crypto.randomUUID();
      state = insertNode(state, state.nodes[0].id, 'child', id);
      state = {
        ...state,
        nodes: state.nodes.map((n) => (n.id === id ? { ...n, text: '这是一个需要折行的长主题'.repeat(8) } : n)),
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
