import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneFog } from './SceneFog';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('automatic atmosphere', () => {
  it('changes bounded density while maintaining continuous speeds and phases', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { container, rerender } = render(<SceneFog still={false} band={1} />);
    const fog = container.querySelector<HTMLElement>('.conf25-fog')!;
    const speed = fog.style.getPropertyValue('--fog-speed'),
      phase = fog.style.getPropertyValue('--fog-phase');
    expect(container.querySelectorAll('i')).toHaveLength(3);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    act(() => vi.advanceTimersByTime(18000));
    expect(Number(fog.style.getPropertyValue('--fog-density'))).toBeCloseTo(0.695);
    expect(fog.style.getPropertyValue('--fog-speed')).toBe(speed);
    expect(fog.style.getPropertyValue('--fog-phase')).toBe(phase);
    rerender(<SceneFog still band={1} />);
    const density = fog.style.getPropertyValue('--fog-density');
    act(() => vi.advanceTimersByTime(72000));
    expect(fog.style.getPropertyValue('--fog-density')).toBe(density);
  });
});
