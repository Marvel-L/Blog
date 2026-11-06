import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKGROUND_APPEARANCE_KEY, useBackgroundAppearance } from './useBackgroundAppearance';

describe('background appearance preference', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('does not save a default for visitors without a preference', () => {
    const { result } = renderHook(useBackgroundAppearance);
    expect(result.current.backgroundAppearance).toBe('default');
    expect(window.localStorage.getItem(BACKGROUND_APPEARANCE_KEY)).toBeNull();
  });

  it('restores sky separately from the stored light/dark theme', () => {
    window.localStorage.setItem(BACKGROUND_APPEARANCE_KEY, 'sky');
    window.localStorage.setItem('theme', 'dark');
    const { result } = renderHook(useBackgroundAppearance);
    expect(result.current.backgroundAppearance).toBe('sky');
    act(() => result.current.setBackgroundPreference('default'));
    expect(result.current.backgroundAppearance).toBe('default');
    expect(window.localStorage.getItem(BACKGROUND_APPEARANCE_KEY)).toBe('default');
    expect(window.localStorage.getItem('theme')).toBe('dark');
  });

  it('remembers an explicit selection on remount', () => {
    const first = renderHook(useBackgroundAppearance);
    act(() => first.result.current.setBackgroundPreference('sky'));
    expect(window.localStorage.getItem(BACKGROUND_APPEARANCE_KEY)).toBe('sky');
    first.unmount();
    const second = renderHook(useBackgroundAppearance);
    expect(second.result.current.backgroundAppearance).toBe('sky');
  });

  it.each(['unknown', '"sky"', '{"background":"sky"}', 'dark'])('ignores unsupported stored values: %s', (saved) => {
    window.localStorage.setItem(BACKGROUND_APPEARANCE_KEY, saved);
    const { result } = renderHook(useBackgroundAppearance);
    expect(result.current.backgroundAppearance).toBe('default');
  });

  it('keeps switching usable when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    const { result } = renderHook(useBackgroundAppearance);
    expect(result.current.backgroundAppearance).toBe('default');
    act(() => result.current.setBackgroundPreference('sky'));
    expect(result.current.backgroundAppearance).toBe('sky');
    act(() => result.current.setBackgroundPreference('default'));
    expect(result.current.backgroundAppearance).toBe('default');
  });

  it('renders a deterministic default on the server without reading browser storage', () => {
    window.localStorage.setItem(BACKGROUND_APPEARANCE_KEY, 'sky');
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const Probe = () => <output>{useBackgroundAppearance().backgroundAppearance}</output>;
    const html = renderToString(<Probe />);
    expect(html).toBe('<output>default</output>');
    expect(renderToString(<Probe />)).toBe(html);
    expect(read).not.toHaveBeenCalled();
  });
});
