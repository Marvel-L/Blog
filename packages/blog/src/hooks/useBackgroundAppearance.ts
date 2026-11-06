import { useCallback, useEffect, useState } from 'react';

export type BackgroundAppearance = 'default' | 'sky';
export const BACKGROUND_APPEARANCE_KEY = 'background-appearance';

/** Background preference is independent of the existing light/dark theme contract. */
export function useBackgroundAppearance() {
  const [backgroundAppearance, setBackgroundAppearance] = useState<BackgroundAppearance>('default');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(BACKGROUND_APPEARANCE_KEY);
      if (saved === 'sky' || saved === 'default') setBackgroundAppearance(saved);
    } catch {
      // Optional persistence: the default background remains usable when storage is blocked.
    }
  }, []);

  const setBackgroundPreference = useCallback((next: BackgroundAppearance) => {
    setBackgroundAppearance(next);
    try {
      window.localStorage.setItem(BACKGROUND_APPEARANCE_KEY, next);
    } catch {
      // Keep the user's selection for this session even if it cannot be persisted.
    }
  }, []);

  return { backgroundAppearance, setBackgroundPreference };
}
