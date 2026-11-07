import { describe, expect, it } from 'vitest';
import { gravePosition, isInsideChurch, openingAngle, walkStep } from './worldPhysics';
describe('confession 3D navigation', () => {
  it('a closed door stops walking while the opened doorway permits passage', () => {
    expect(walkStep({ x: 0, z: 0.7 }, 0, -0.2, [], false).z).toBe(0.7);
    expect(walkStep({ x: 0, z: 0.7 }, 0, -0.2, [], true).z).toBeCloseTo(0.5);
  });
  it('slides along walls without walking through them and stays inside world bounds', () => {
    const next = walkStep({ x: 0, z: 2 }, 0.2, -0.2, [{ minX: 0.3, maxX: 1, minZ: 0, maxZ: 3 }], true);
    expect(next.x).toBe(0);
    expect(next.z).toBeCloseTo(1.8);
    expect(walkStep({ x: 23, z: 25 }, 0.2, 0.2, [], true)).toEqual({ x: 23, z: 25 });
  });
  it('all 100 categories have unique reachable placements outside the chapel', () => {
    const spots = Array.from({ length: 100 }, (_, i) => gravePosition(i));
    expect(new Set(spots.map((p) => `${p.x}:${p.z}`)).size).toBe(100);
    expect(spots.every((p) => Math.abs(p.x) < 23 && p.z > 0 && p.z <= 25)).toBe(true);
  });
  it('opening is monotone and a church visit follows spatial position, not a background toggle', () => {
    expect(openingAngle(1)).toBeGreaterThan(openingAngle(0.5));
    expect(openingAngle(0.5)).toBeGreaterThan(openingAngle(0));
    expect(openingAngle(2)).toBe(openingAngle(1));
    expect(isInsideChurch({ x: 0, z: -4 })).toBe(true);
    expect(isInsideChurch({ x: 7, z: -4 })).toBe(false);
    expect(isInsideChurch({ x: 0, z: 1 })).toBe(false);
  });
});
