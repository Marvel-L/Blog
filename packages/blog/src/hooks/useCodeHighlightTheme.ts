import { useEffect } from 'react';

const HIGHLIGHT_STYLE_ID = 'post-highlight-theme';

/** Share the Post palette and follow theme changes without re-rendering Markdown. */
export const useCodeHighlightTheme = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let generation = 0;
    let style: HTMLStyleElement | null = null;
    const updateTheme = async () => {
      const currentGeneration = ++generation;
      try {
        const theme = document.documentElement.classList.contains('dark')
          ? await import('highlight.js/styles/github-dark.css?raw')
          : await import('highlight.js/styles/github.css?raw');
        if (cancelled || currentGeneration !== generation) return;
        style = document.getElementById(HIGHLIGHT_STYLE_ID) as HTMLStyleElement | null;
        style ??= document.createElement('style');
        style.id = HIGHLIGHT_STYLE_ID;
        style.textContent = theme.default;
        document.head.appendChild(style);
      } catch (error) {
        if (!cancelled && currentGeneration === generation) {
          console.error('代码高亮主题同步失败:', error);
        }
      }
    };

    const observer = new MutationObserver(() => void updateTheme());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    void updateTheme();

    return () => {
      cancelled = true;
      observer.disconnect();
      style?.remove();
    };
  }, [enabled]);
};
