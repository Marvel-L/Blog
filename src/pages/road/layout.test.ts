import { describe, expect, it } from 'vitest';
import { computeLevels, enumeratePaths, layoutRoadGraph, resolveGraphRootId } from './layout';
import type { RoadNodeConfig } from '@config/road.config';

const sampleNodes: RoadNodeConfig[] = [
  { id: 'golang', title: 'Golang', posts: [] },
  { id: 'channel', title: 'Channel', parents: ['golang'], posts: [] },
  { id: 'goroutine', title: 'Goroutine', parents: ['golang'], posts: [] },
  { id: 'pool', title: '协程池实战', parents: ['channel', 'goroutine'], posts: [] },
];

describe('road layout', () => {
  it('computes layered levels from root', () => {
    const levels = computeLevels(sampleNodes, 'golang');
    expect(levels.get('golang')).toBe(0);
    expect(levels.get('channel')).toBe(1);
    expect(levels.get('goroutine')).toBe(1);
    expect(levels.get('pool')).toBe(2);
  });

  it('enumerates all root-to-leaf paths', () => {
    const paths = enumeratePaths(sampleNodes, 'golang');
    expect(paths).toHaveLength(2);
    expect(paths).toEqual(
      expect.arrayContaining([
        ['golang', 'channel', 'pool'],
        ['golang', 'goroutine', 'pool'],
      ]),
    );
  });

  it('uses the parentless node when the view id is not a node id', () => {
    const nodes: RoadNodeConfig[] = [
      { id: '程序员的一生', title: '程序员的一生', posts: [] },
      { id: '算法', title: '算法', parents: ['程序员的一生'], posts: [] },
      { id: '编程语言', title: '编程语言', parents: ['程序员的一生'], posts: [] },
    ];
    expect(resolveGraphRootId(nodes, '程序员')).toBe('程序员的一生');
    const levels = computeLevels(nodes, '程序员');
    expect(levels.get('程序员的一生')).toBe(0);
    expect(levels.get('算法')).toBe(1);
    expect(levels.get('编程语言')).toBe(1);

    const layout = layoutRoadGraph(nodes, '程序员');
    const root = layout.nodes.find((node) => node.id === '程序员的一生');
    const child = layout.nodes.find((node) => node.id === '算法');
    expect(root && child && child.y).toBeGreaterThan(root?.y ?? 0);
    expect(layout.edges.every((edge) => edge.y2 > edge.y1)).toBe(true);
  });

  it('layouts nodes with edges', () => {
    const layout = layoutRoadGraph(sampleNodes, 'golang');
    expect(layout.nodes).toHaveLength(4);
    expect(layout.edges).toHaveLength(4);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});
