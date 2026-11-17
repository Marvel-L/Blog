import { describe, expect, it } from 'vitest';
import {
  customNodeColors,
  insertNode,
  layoutEditingMind,
  layoutMind,
  moveNode,
  newMindState,
  nodeSize,
  nodeTextLines,
  parseMindState,
  removeNode,
  visibleMindGeometry,
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
  it.each(['logic', 'mind'] as const)(
    'keeps short %s branches close to their own parents instead of aligning cousins by depth',
    (layout) => {
      let state = newMindState(layout);
      const root = state.nodes[0].id,
        long = crypto.randomUUID(),
        short = crypto.randomUUID(),
        longChild = crypto.randomUUID(),
        shortChild = crypto.randomUUID();
      state = insertNode(state, root, 'child', long);
      state = insertNode(state, long, 'sibling', short);
      state = insertNode(state, long, 'child', longChild);
      state = insertNode(state, short, 'child', shortChild);
      state = {
        ...state,
        nodes: state.nodes.map((node) => ({
          ...node,
          text: node.id === long ? '长内容分支'.repeat(16) : '短',
        })),
      };
      const geometry = layoutMind(state);
      const byId = new Map(geometry.nodes.map((node) => [node.id, node]));
      const gap = layout === 'logic' ? 40 : 64;
      for (const node of geometry.nodes) {
        if (!node.parentId) continue;
        const parent = byId.get(node.parentId)!;
        expect(node.x - node.width / 2 - (parent.x + parent.width / 2)).toBeCloseTo(gap);
        const edge = geometry.edges.find((edge) => edge.id === node.id)!;
        expect(edge.bounds.right - edge.bounds.left).toBeCloseTo(gap);
      }
      expect(byId.get(shortChild)!.x).toBeLessThan(byId.get(longChild)!.x);
      const wider = {
        ...state,
        nodes: state.nodes.map((node) => (node.id === long ? { ...node, text: '更长的内容分支'.repeat(20) } : node)),
      };
      const after = layoutMind(wider, undefined, geometry);
      expect(after.nodes.find((node) => node.id === short)).toBe(byId.get(short));
      expect(after.nodes.find((node) => node.id === shortChild)).toBe(byId.get(shortChild));
      expect(after.edges.find((edge) => edge.id === shortChild)).toBe(
        geometry.edges.find((edge) => edge.id === shortChild),
      );
    },
  );
  it.each(['mind', 'logic'] as const)(
    'keeps earlier nodes and edges stable when appending in a large %s map',
    (layout) => {
      const state = newMindState(layout);
      for (let index = 1; index < 990; index++) {
        state.nodes.push({
          id: crypto.randomUUID(),
          parentId: state.nodes[0].id,
          text: `事项 ${index}`,
          emoji: '',
          side: index % 2 ? 1 : -1,
        });
      }
      const before = layoutMind(state);
      const id = crypto.randomUUID();
      const appended = insertNode(state, state.nodes.at(-1)!.id, 'sibling', id);
      const after = layoutMind(appended, undefined, before);
      const grown = {
        ...appended,
        nodes: appended.nodes.map((node) =>
          node.id === id ? { ...node, text: '变长的逻辑框'.repeat(20) + '\n第二行\n第三行' } : node,
        ),
      };
      const finished = layoutMind(grown, undefined, after);
      for (const node of before.nodes) {
        expect(after.nodes.find((n) => n.id === node.id)).toBe(node);
        expect(finished.nodes.find((n) => n.id === node.id)).toBe(node);
      }
      for (const edge of before.edges) {
        expect(after.edges.find((e) => e.id === edge.id)).toBe(edge);
        expect(finished.edges.find((e) => e.id === edge.id)).toBe(edge);
      }
    },
  );
  it('only adjusts descendants horizontally and following subtrees vertically when a topic grows', () => {
    let state = newMindState('logic');
    const root = state.nodes[0].id,
      a = crypto.randomUUID(),
      b = crypto.randomUUID(),
      child = crypto.randomUUID();
    state = insertNode(state, root, 'child', a);
    state = insertNode(state, a, 'child', child);
    state = insertNode(state, a, 'sibling', b);
    const before = layoutMind(state);
    const wide = {
      ...state,
      nodes: state.nodes.map((n) => (n.id === a ? { ...n, text: '更宽的分支'.repeat(20) } : n)),
    };
    const after = layoutMind(wide, undefined, before);
    expect(after.nodes.find((n) => n.id === root)).toBe(before.nodes[0]);
    expect(after.nodes.find((n) => n.id === b)).toBe(before.nodes.find((n) => n.id === b));
    expect(after.nodes.find((n) => n.id === child)!.x).toBeGreaterThan(before.nodes.find((n) => n.id === child)!.x);
    const tall = {
      ...wide,
      nodes: wide.nodes.map((n) => (n.id === child ? { ...n, text: '第一行\n第二行\n第三行\n第四行' } : n)),
    };
    const finished = layoutMind(tall, undefined, after);
    expect(finished.nodes.find((n) => n.id === a)).toBe(after.nodes.find((n) => n.id === a));
    expect(finished.nodes.find((n) => n.id === b)!.y).toBeGreaterThan(after.nodes.find((n) => n.id === b)!.y);
    for (const a of finished.nodes)
      for (const b of finished.nodes)
        if (a.id !== b.id) {
          expect(Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2).toBe(
            false,
          );
        }
  });
  it('renders visible nodes and crossing edges, keeping an offscreen editor mounted', () => {
    let state = newMindState('logic');
    for (let index = 0; index < 60; index++) state = insertNode(state, state.nodes[0].id, 'child', crypto.randomUUID());
    const geometry = layoutMind(state),
      last = geometry.nodes.at(-1)!;
    const size = { width: 800, height: 500 };
    const initial = visibleMindGeometry(geometry, state.viewport, size);
    expect(initial.nodes).toContain(geometry.nodes[0]);
    expect(initial.nodes).not.toContain(last);
    expect(initial.nodes.length).toBeLessThan(20);
    expect(visibleMindGeometry(geometry, state.viewport, size, [last.id]).nodes).toContain(last);
    const moved = visibleMindGeometry(geometry, { x: last.x, y: last.y, zoom: 1 }, size);
    expect(moved.nodes).toContain(last);
    expect(moved.nodes).not.toContain(geometry.nodes[0]);
    expect(moved.edges).toContain(geometry.edges.find((edge) => edge.id === last.id));
    expect(visibleMindGeometry(geometry, { x: 50000, y: 50000, zoom: 1 }, size)).toEqual({ nodes: [], edges: [] });
  });
  it.each(['root', 'branch'])('keeps the %s edit origin and other nodes still across text updates', (kind) => {
    let state = newMindState('logic');
    const root = state.nodes[0].id,
      branch = crypto.randomUUID(),
      child = crypto.randomUUID();
    state = insertNode(state, root, 'child', branch);
    state = insertNode(state, branch, 'child', child);
    state = insertNode(state, branch, 'sibling', crypto.randomUUID());
    const sizes = (value: typeof state) => new Map(value.nodes.map((n) => [n.id, nodeSize(n)]));
    const baseline = layoutMind(state, sizes(state));
    const initial = baseline.nodes;
    const id = kind === 'root' ? root : branch;
    const anchor = initial.find((n) => n.id === id)!;
    const editing = { id, nodes: initial, edges: baseline.edges, layout: state.layout };
    for (const text of [
      '第一',
      '输入时逐字扩展且周围节点保持原位置',
      '更长的第一行用于检验输入框\n这里手动换行',
      '短',
    ]) {
      const next = { ...state, nodes: state.nodes.map((n) => (n.id === id ? { ...n, text } : n)) };
      const preview = layoutEditingMind(next, editing, sizes(next));
      const edited = preview.nodes.find((n) => n.id === id)!;
      expect(edited.x - edited.width / 2).toBeCloseTo(anchor.x - anchor.width / 2);
      expect(edited.y - edited.height / 2).toBeCloseTo(anchor.y - anchor.height / 2);
      expect(edited.width).toBeGreaterThanOrEqual(anchor.width);
      expect(edited.height).toBeGreaterThanOrEqual(anchor.height);
      for (const before of initial.filter((n) => n.id !== id)) {
        const after = preview.nodes.find((n) => n.id === before.id)!;
        expect(after).toBe(before);
        expect([after.x, after.y, after.width, after.height]).toEqual([
          before.x,
          before.y,
          before.width,
          before.height,
        ]);
      }
      expect(preview.edges).toHaveLength(state.nodes.length - 1);
      for (const edge of baseline.edges.filter(
        (edge) => edge.id !== id && initial.find((n) => n.id === edge.id)?.parentId !== id,
      ))
        expect(preview.edges.find((e) => e.id === edge.id)).toBe(edge);
    }
    const final = {
      ...state,
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, text: '编辑完成后统一重新排布'.repeat(4) } : n)),
    };
    expect(layoutMind(final, sizes(final)).nodes.find((n) => n.id === child)?.x).not.toBe(
      initial.find((n) => n.id === child)?.x,
    );
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
