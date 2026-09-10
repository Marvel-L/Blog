import { describe, expect, it } from 'vitest';
import { computeLevels, enumeratePaths, layoutRoadGraph } from './layout';
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

  it('layouts nodes with edges', () => {
    const layout = layoutRoadGraph(sampleNodes, 'golang');
    expect(layout.nodes).toHaveLength(4);
    expect(layout.edges).toHaveLength(4);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});
