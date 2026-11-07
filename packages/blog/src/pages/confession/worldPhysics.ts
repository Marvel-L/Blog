export type Collider = { minX: number; maxX: number; minZ: number; maxZ: number };
export type Point = { x: number; z: number };
export const PLAYER_RADIUS = 0.3;
/** Wall and prop collision is resolved per-axis, allowing the player to slide along edges. */
export function walkStep(position: Point, dx: number, dz: number, walls: Collider[], doorOpen: boolean): Point {
  const blocked = (x: number, z: number) =>
    Math.abs(x) > 23 ||
    z > 25 ||
    z < -19 ||
    walls.some(
      (w) =>
        x > w.minX - PLAYER_RADIUS &&
        x < w.maxX + PLAYER_RADIUS &&
        z > w.minZ - PLAYER_RADIUS &&
        z < w.maxZ + PLAYER_RADIUS,
    ) ||
    (!doorOpen && Math.abs(x) < 2.05 && Math.abs(z) < 0.65);
  let { x, z } = position;
  if (!blocked(x + dx, z)) x += dx;
  if (!blocked(x, z + dz)) z += dz;
  return { x, z };
}
export const gravePosition = (index: number): Point => ({
  x: (index % 2 ? 1 : -1) * (3.9 + Math.floor(index / 20) * 3.3),
  z: 18 - (Math.floor(index / 2) % 10) * 1.8,
});
export const openingAngle = (progress: number) => 0.24 + Math.min(1, Math.max(0, progress)) ** 2 * 1.35;
export const isInsideChurch = (p: Point) => Math.abs(p.x) < 5.7 && p.z < -0.7 && p.z > -19;
