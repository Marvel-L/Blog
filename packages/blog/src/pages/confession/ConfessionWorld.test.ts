import * as T from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfessionWorld } from './ConfessionWorld';
import { gravePosition } from './worldPhysics';

// Exercise the real navigation/render methods without creating a jsdom WebGL context.
function worldHarness() {
  const camera = new T.PerspectiveCamera(64, 1, 0.08, 100);
  camera.position.set(0, 1.65, -9.3);
  const onRegion = vi.fn();
  const onHint = vi.fn();
  const frames: T.Vector3[] = [];
  const fog = { render: vi.fn(() => frames.push(camera.position.clone())) };
  const state = {
    scene: new T.Scene(),
    camera,
    renderer: {},
    fog,
    ready: true,
    disposed: false,
    inside: true,
    paused: false,
    blocked: false,
    reduced: false,
    elapsed: 0,
    density: 0.48,
    yaw: 1,
    pitch: 0.3,
    autoRoute: [new T.Vector3(0, 1.65, -13)],
    autoEnter: true,
    doorMoving: true,
    doorProgress: 1,
    doorLeft: new T.Group(),
    doorRight: new T.Group(),
    keys: new Set(['KeyW']),
    touch: { forward: 1, right: 0 },
    pointer: { id: 1 } as { id: number } | null,
    rin: new T.Group(),
    crows: [],
    hint: '',
    categories: [],
    tombs: new T.Group(),
    callbacks: { onRegion, onHint },
    last: 100,
    clearInput() {
      this.keys.clear();
      this.touch = { forward: 0, right: 0 };
      this.pointer = null;
    },
  };
  const world = Object.assign(Object.create(ConfessionWorld.prototype), state) as typeof state &
    Pick<ConfessionWorld, 'returnToGraves' | 'focusGrave' | 'setState'>;
  return { world, camera, fog, frames, onRegion, onHint };
}

afterEach(() => vi.restoreAllMocks());

describe('confession world state-driven rendering', () => {
  it('redraws the cemetery immediately while background animation is suspended', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const h = worldHarness();
    h.world.returnToGraves();
    expect(h.camera.position.toArray()).toEqual([0, 1.65, 25]);
    expect(h.frames[0].toArray()).toEqual([0, 1.65, 25]);
    expect(h.onRegion).toHaveBeenCalledWith(false);
    expect(h.onHint).toHaveBeenCalledWith(expect.stringContaining('墓地'));
    expect(h.world.autoRoute).toEqual([]);
    expect(h.world.autoEnter).toBe(false);
    expect(h.world.doorMoving).toBe(false);
    expect(h.world.keys.size).toBe(0);
    expect(h.world.touch).toEqual({ forward: 0, right: 0 });
    expect(h.world.pointer).toBeNull();
  });

  it('cancels the pending church route when locating a grave and draws that location', () => {
    const h = worldHarness();
    h.world.focusGrave(3);
    const p = gravePosition(3);
    expect(h.frames[0].toArray()).toEqual([p.x, 1.65, p.z + 2.5]);
    expect(h.onRegion).toHaveBeenCalledWith(false);
    expect(h.world.autoRoute).toEqual([]);
    expect(h.world.doorMoving).toBe(false);
  });

  it('draws changed fog settings while paused without replaying an unchanged region callback', () => {
    const h = worldHarness();
    h.world.setState([], 80, true, false, true);
    expect(h.fog.render).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), h.camera, 0, 0.8);
    expect(h.onRegion).not.toHaveBeenCalled();
    expect(h.world.keys.size).toBe(0);
  });
});
