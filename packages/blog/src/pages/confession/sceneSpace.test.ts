import { describe, expect, it } from 'vitest';
import { GRAVES, PEWS, SAINT, SPACE, depth, project } from './sceneSpace';
describe('shared isometric scene space', () => {
  it('uses one orthographic ground projection and only height lifts an anchor', () => {
    const origin = project({ x: 0, z: 0 });
    const x = project({ x: 1, z: 0 }),
      z = project({ x: 0, z: 1 });
    expect(x.x - origin.x).toBe(SPACE.groundUnit);
    expect(z.x - origin.x).toBe(-SPACE.groundUnit);
    expect(x.y - origin.y).toBe(z.y - origin.y);
    expect(project({ ...SAINT, height: 0 }).y - project(SAINT).y).toBeCloseTo(SAINT.height * SPACE.rise);
  });
  it('places paired equal-size pews in three aligned rows, facing the altar', () => {
    expect(PEWS).toHaveLength(6);
    for (let row = 0; row < 3; row++) {
      const pair = PEWS.filter((p) => p.row === row);
      expect(pair).toHaveLength(2);
      expect(pair[0].z).toBe(pair[1].z);
      expect(pair[0].x).toBe(-pair[1].x);
      expect(pair[0].width).toBe(pair[1].width);
      expect(pair.every((p) => p.facing === 'altar')).toBe(true);
    }
  });
  it('gives opposite sides actual distinct grave views and orders objects by ground depth', () => {
    expect(new Set(GRAVES.map((g) => g.facing))).toEqual(new Set(['east', 'west']));
    expect(depth({ x: 2, z: 4, height: 100 })).toBe(6);
  });
});
