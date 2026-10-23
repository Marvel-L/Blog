export interface OceanSettings {
  species: 'whale' | 'fish';
  cellSize: number;
  whaleColor: string;
  dotPrimary: string;
  dotSecondary: string;
  dotDensity: number;
  accent: string;
}

export class World {
  constructor(specs: Array<{ kind: 'whale'; size: number }>, options?: { fish?: boolean });
  readonly sharks: Array<{ kind: string; length: number; nodes: Float32Array }>;
  readonly fish: Array<{ x: number; y: number }>;
  pointer: { x: number; y: number; active: boolean };
  resize(width: number, height: number, cellWidth: number, cellHeight: number): void;
  step(dt: number): void;
  ripple(x: number, y: number): void;
}

export class AsciiRenderer {
  constructor(canvas: HTMLCanvasElement);
  world: World;
  readonly cellWidth: number;
  readonly cellHeight: number;
  updateSettings(settings: Partial<OceanSettings>): void;
  resize(width: number, height: number, dpr: number): void;
  render(world: World, dt: number): void;
}
