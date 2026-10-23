import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCodeHighlightTheme } from './useCodeHighlightTheme';

vi.mock('highlight.js/styles/github.css?raw', () => ({ default: '.hljs { color: light; }' }));
vi.mock('highlight.js/styles/github-dark.css?raw', () => ({ default: '.hljs { color: dark; }' }));

afterEach(() => {
  document.documentElement.classList.remove('dark');
});

describe('code highlight theme lifecycle', () => {
  it('follows the active theme and removes styles when code is no longer displayed', async () => {
    const { rerender, unmount } = renderHook(({ enabled }) => useCodeHighlightTheme(enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(document.getElementById('post-highlight-theme')).toHaveTextContent('color: light'));
    act(() => document.documentElement.classList.add('dark'));
    await waitFor(() => expect(document.getElementById('post-highlight-theme')).toHaveTextContent('color: dark'));
    rerender({ enabled: false });
    expect(document.getElementById('post-highlight-theme')).toBeNull();
    rerender({ enabled: true });
    await waitFor(() => expect(document.getElementById('post-highlight-theme')).toHaveTextContent('color: dark'));
    unmount();
    expect(document.getElementById('post-highlight-theme')).toBeNull();
  });

  it('ignores stale asynchronous loads after rapid theme changes or unmount', async () => {
    const { unmount } = renderHook(() => useCodeHighlightTheme(true));
    act(() => document.documentElement.classList.add('dark'));
    await waitFor(() => expect(document.getElementById('post-highlight-theme')).toHaveTextContent('color: dark'));
    act(() => document.documentElement.classList.remove('dark'));
    unmount();
    await act(async () => {});
    expect(document.getElementById('post-highlight-theme')).toBeNull();
  });
});
