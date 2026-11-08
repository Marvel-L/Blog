/** Shared orthographic projection. x/z are ground metres; height is vertical metres. */
export const SPACE = { width: 1200, height: 850, groundUnit: 54, rise: 52, centreX: 600, centreY: 490 };
export type GroundPoint = { x: number; z: number; height?: number };
export function project({ x, z, height = 0 }: GroundPoint) {
  return {
    x: SPACE.centreX + (x - z) * SPACE.groundUnit,
    y: SPACE.centreY + ((x + z) * SPACE.groundUnit) / 2 - height * SPACE.rise,
  };
}
export function depth(point: GroundPoint) {
  return point.x + point.z;
}
export function polygon(points: GroundPoint[]) {
  return points
    .map((p) => {
      const v = project(p);
      return `${v.x},${v.y}`;
    })
    .join(' ');
}
export const GRAVES = [
  { x: -1.7, z: 3.8, facing: 'east' as const },
  { x: 3.9, z: 4.8, facing: 'west' as const },
  { x: -0.8, z: 0.6, facing: 'east' as const },
  { x: 4.5, z: 1.2, facing: 'west' as const },
  { x: 0.5, z: -2.1, facing: 'east' as const },
  { x: 5.9, z: -0.9, facing: 'west' as const },
];
export const CHAPEL = { x: 3.1, z: -3.6, height: 5.2 };
export const SAINT = { x: 0, z: -2.0, height: 1.62 };
export const PEWS = [-0.1, 1.55, 3.2].flatMap((z, row) =>
  [-2.05, 2.05].map((x) => ({ x, z, row, facing: 'altar' as const, width: 2.15 })),
);
export const TREES = [
  { x: -4.9, z: -0.1, height: 3.3 },
  { x: -3.8, z: 5.4, height: 3.0 },
  { x: 6.1, z: 5.5, height: 3.6 },
  { x: 7.4, z: -4.0, height: 3.4 },
];
