import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const LOVE_MODE_STORAGE_KEY = 'd-blog-love-mode';

interface LoveModeContextValue {
  isLoveMode: boolean;
  toggleLoveMode: () => void;
  setLoveMode: (next: boolean) => void;
}

const LoveModeContext = createContext<LoveModeContextValue | null>(null);

export const LoveModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoveMode, setIsLoveMode] = useState(false);

  useEffect(() => {
    try {
      setIsLoveMode(window.localStorage.getItem(LOVE_MODE_STORAGE_KEY) === 'true');
    } catch {
      setIsLoveMode(false);
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    if (isLoveMode) {
      document.documentElement.dataset.loveMode = 'true';
    } else {
      delete document.documentElement.dataset.loveMode;
    }

    try {
      window.localStorage.setItem(LOVE_MODE_STORAGE_KEY, String(isLoveMode));
    } catch {
      // 本地持久化失败时仍保持当前会话状态可用。
    }

    return () => {
      delete document.documentElement.dataset.loveMode;
    };
  }, [isLoveMode]);

  const setLoveMode = useCallback((next: boolean) => {
    setIsLoveMode(next);
  }, []);

  const toggleLoveMode = useCallback(() => {
    setIsLoveMode((value) => !value);
  }, []);

  const value = useMemo(
    () => ({
      isLoveMode,
      toggleLoveMode,
      setLoveMode,
    }),
    [isLoveMode, setLoveMode, toggleLoveMode],
  );

  return <LoveModeContext.Provider value={value}>{children}</LoveModeContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useLoveMode = () => {
  const context = useContext(LoveModeContext);
  if (!context) {
    throw new Error('useLoveMode 必须在 LoveModeProvider 内使用');
  }
  return context;
};
