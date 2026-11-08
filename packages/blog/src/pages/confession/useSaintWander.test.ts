import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSaintWander } from './useSaintWander';
import { SAINT } from './sceneSpace';
let callback: FrameRequestCallback | undefined;
let now = 0;
const step = (seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds * 50); i++) {
    now += 20;
    act(() => callback?.(now));
  }
};
beforeEach(() => {
  callback = undefined;
  now = 0;
  vi.spyOn(Math, 'random').mockReturnValue(0.9);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    callback = fn;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    callback = undefined;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('Rin centre-aisle wander', () => {
  it('waits briefly then moves continuously inside the aisle', () => {
    const hook = renderHook(() => useSaintWander(true, false));
    step(2);
    expect(hook.result.current.z).toBe(SAINT.z);
    step(3);
    expect(hook.result.current.walking).toBe(true);
    expect(hook.result.current.z).toBeGreaterThan(SAINT.z);
    expect(Math.abs(hook.result.current.x)).toBeLessThanOrEqual(0.325);
    step(30);
    expect(hook.result.current.z).toBeGreaterThanOrEqual(-2.1);
    expect(hook.result.current.z).toBeLessThanOrEqual(3.6);
  });
  it('freezes without losing position during dialogue and resumes from there', () => {
    const hook = renderHook(({ still }) => useSaintWander(true, still), { initialProps: { still: false } });
    step(6);
    const point = { ...hook.result.current };
    hook.rerender({ still: true });
    step(10);
    expect(hook.result.current).toEqual(point);
    hook.rerender({ still: false });
    step(1);
    expect(hook.result.current.z).toBeGreaterThan(point.z);
  });
  it('does not schedule movement outside the church', () => {
    const hook = renderHook(() => useSaintWander(false, false));
    step(20);
    expect(hook.result.current.z).toBe(SAINT.z);
    expect(callback).toBeUndefined();
  });
});
