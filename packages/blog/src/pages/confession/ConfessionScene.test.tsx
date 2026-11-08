import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { ConfessionScene } from './ConfessionScene';
import { emptyConfession } from './model';

let imageFails = false;
let hidden = false;
const changeRegion = vi.fn();
function Harness({
  paused = false,
  blocked = false,
  many = false,
}: {
  paused?: boolean;
  blocked?: boolean;
  many?: boolean;
}) {
  const [inside, setInside] = useState(false);
  const state = emptyConfession();
  if (many)
    state.categories = Array.from({ length: 100 }, (_, i) => ({
      ...state.categories[0],
      id: `category-${i}`,
      name: `分类${i}`,
    }));
  return (
    <ConfessionScene
      churchView={inside}
      state={state}
      paused={paused}
      blocked={blocked}
      onChurch={(v) => {
        changeRegion(v);
        setInside(v);
      }}
      onTomb={vi.fn()}
      onSaint={vi.fn()}
    />
  );
}
beforeEach(() => {
  imageFails = false;
  hidden = false;
  changeRegion.mockReset();
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => (imageFails ? this.onerror?.() : this.onload?.()));
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('painted 2.5D confession scene', () => {
  it('uses independent grave art and interleaves fog at distinct depth layers', async () => {
    const { container } = render(<Harness />);
    await waitFor(() => expect(screen.getByRole('button', { name: '进入教堂' })).toBeEnabled());
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelectorAll('.conf25-grave img')).toHaveLength(4);
    expect(container.querySelectorAll('.conf25-fog')).toHaveLength(3);
    expect(container.querySelector('[data-ground="projected"]')).toBeInTheDocument();
    expect(container.querySelector('.conf25-base')).toBeNull();
    const children = Array.from(container.querySelectorAll('.confiso-depth'));
    const depths = children.map((e) => Number(e.getAttribute('data-depth')));
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    expect(
      new Set(Array.from(container.querySelectorAll('.conf25-grave')).map((e) => e.getAttribute('data-facing'))),
    ).toEqual(new Set(['east', 'west']));
    expect(
      new Set(Array.from(container.querySelectorAll('.conf25-grave img')).map((e) => e.getAttribute('src'))).size,
    ).toBe(2);
  });
  it('opens the independent door before entering, then returns both art and controls to the cemetery', async () => {
    const { container } = render(<Harness />);
    await waitFor(() => expect(screen.getByRole('button', { name: '点击教堂门' })).toBeEnabled());
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '点击教堂门' }));
    expect(screen.getByText('门正在开启…')).toBeInTheDocument();
    expect(changeRegion).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1349));
    expect(changeRegion).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('button', { name: '与圣女凛交谈' })).toBeInTheDocument();
    expect(container.querySelectorAll('.conf25-pew-row')).toHaveLength(6);
    const pews = Array.from(container.querySelectorAll<HTMLElement>('.conf25-pew-row'));
    expect(new Set(pews.map((p) => p.style.height))).toEqual(new Set(['58px']));
    expect(pews.every((p) => p.dataset.facing === 'altar')).toBe(true);
    expect(new Set(pews.map((p) => p.dataset.row))).toEqual(new Set(['0', '1', '2']));
    expect(container.querySelectorAll('.confiso-column img')).toHaveLength(4);
    expect(container.querySelector('.conf25-saint-wrap')).toHaveAttribute('data-world-height', '1.62');
    fireEvent.click(screen.getByRole('button', { name: '回到墓地' }));
    expect(container.querySelector('.conf25-stage')).toHaveAttribute('data-church', 'false');
    expect(screen.getByRole('button', { name: '点击教堂门' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '与圣女凛交谈' })).toBeNull();
  });
  it('suspends the opening timer behind a modal or a hidden page and resumes safely', async () => {
    const view = render(<Harness />);
    await waitFor(() => expect(screen.getByRole('button', { name: '进入教堂' })).toBeEnabled());
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '进入教堂' }));
    view.rerender(<Harness blocked />);
    act(() => vi.advanceTimersByTime(4000));
    expect(changeRegion).not.toHaveBeenCalled();
    view.rerender(<Harness />);
    hidden = true;
    fireEvent(document, new Event('visibilitychange'));
    act(() => vi.advanceTimersByTime(4000));
    expect(changeRegion).not.toHaveBeenCalled();
    hidden = false;
    fireEvent(document, new Event('visibilitychange'));
    act(() => vi.advanceTimersByTime(1350));
    expect(changeRegion).toHaveBeenCalledTimes(1);
  });
  it('shows an actual asset load error and can retry the same images', async () => {
    imageFails = true;
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '进入教堂' })).toBeDisabled();
    imageFails = false;
    fireEvent.click(screen.getByRole('button', { name: '重新加载场景' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '进入教堂' })).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('keeps 100 categories accessible without stacking them into the scene at once', async () => {
    const { container } = render(<Harness many />);
    await waitFor(() => expect(screen.getByRole('button', { name: '进入教堂' })).toBeEnabled());
    expect(container.querySelectorAll('.conf25-grave')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: '下一片墓地' }));
    expect(container.querySelectorAll('.conf25-grave')).toHaveLength(6);
    expect(screen.getByRole('button', { name: '查看墓碑：分类6' })).toBeInTheDocument();
    expect(container.querySelectorAll('.confession-grave-index button')).toHaveLength(100);
  });
});
