import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { hasOpenOverlay, lockBodyScroll, unlockBodyScroll } from '@/hooks/useModalOverlay';

type FullscreenMode = 'none' | 'window' | 'native';

export interface MindFullscreen {
  mountRef: RefObject<HTMLDivElement | null>;
  editorRef: RefObject<HTMLDivElement | null>;
  host: HTMLDivElement | null;
  mode: FullscreenMode;
  busy: boolean;
  error: string;
  toggle: () => Promise<void>;
}

const focusableSelector =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Move one portal host so fullscreen transitions preserve the editor and its history. */
export function useMindFullscreen(): MindFullscreen {
  const mountRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<FullscreenMode>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const pending = useRef(false);
  const modeRef = useRef<FullscreenMode>('none');
  const focusFrame = useRef(0);

  const changeMode = useCallback((next: FullscreenMode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  useLayoutEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    mounted.current = true;
    const element = document.createElement('div');
    // Keep the page's light/dark variables and control styles when moved to body.
    element.className = 'mind-editor-host mind-page';
    mount.appendChild(element);
    setHost(element);
    return () => {
      mounted.current = false;
      window.cancelAnimationFrame(focusFrame.current);
      const editor = editorRef.current;
      if (editor && document.fullscreenElement === editor) {
        void document.exitFullscreen().catch(() => {});
      }
      element.remove();
    };
  }, []);

  const toggle = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (modeRef.current === 'window') {
        changeMode('none');
      } else if (modeRef.current === 'native') {
        if (document.fullscreenElement === editor) await document.exitFullscreen();
        if (mounted.current) changeMode('none');
      } else {
        if (typeof editor.requestFullscreen === 'function') {
          try {
            await editor.requestFullscreen();
            if (!mounted.current) {
              if (document.fullscreenElement === editor) await document.exitFullscreen();
              return;
            }
            if (document.fullscreenElement === editor) {
              changeMode('native');
              return;
            }
          } catch {
            // Rejected or unsupported system fullscreen falls back to the window.
          }
        }
        if (mounted.current) changeMode('window');
      }
    } catch {
      if (mounted.current) setError('退出全屏失败，请按 Esc 重试');
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [changeMode]);

  useLayoutEffect(() => {
    const onFullscreenChange = () => {
      if (document.fullscreenElement === editorRef.current) {
        changeMode('native');
      } else if (modeRef.current === 'native') {
        changeMode('none');
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [changeMode]);

  useLayoutEffect(() => {
    if (!host || mode === 'none') return;
    const mount = mountRef.current;
    if (!mount) return;
    window.cancelAnimationFrame(focusFrame.current);
    const inertElements = new Map<HTMLElement, string | null>();
    let observer: MutationObserver | undefined;
    if (mode === 'window') {
      host.classList.add('is-window-fullscreen');
      document.body.appendChild(host);
      lockBodyScroll();
      const isolateBackground = () => {
        for (const element of Array.from(document.body.children)) {
          if (!(element instanceof HTMLElement) || element === host || inertElements.has(element)) continue;
          inertElements.set(element, element.getAttribute('inert'));
          element.setAttribute('inert', '');
        }
      };
      isolateBackground();
      observer = new MutationObserver(isolateBackground);
      observer.observe(document.body, { childList: true });
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || hasOpenOverlay()) return;
      event.preventDefault();
      event.stopPropagation();
      void toggle();
    };
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented || hasOpenOverlay()) return;
      const elements = Array.from(host.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
        const style = window.getComputedStyle(element);
        return !element.closest('[inert]') && style.display !== 'none' && style.visibility !== 'hidden';
      });
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !host.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (active === last || !host.contains(active))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onEscape, true);
    window.addEventListener('keydown', onTab);
    return () => {
      window.removeEventListener('keydown', onEscape, true);
      window.removeEventListener('keydown', onTab);
      observer?.disconnect();
      if (mode === 'window') {
        for (const [element, previous] of inertElements) {
          if (previous === null) element.removeAttribute('inert');
          else element.setAttribute('inert', previous);
        }
        host.classList.remove('is-window-fullscreen');
        if (mounted.current) mount.appendChild(host);
        unlockBodyScroll();
      }
      focusFrame.current = window.requestAnimationFrame(() => {
        if (mounted.current && modeRef.current === 'none') {
          host.querySelector<HTMLElement>('[data-mind-fullscreen-toggle]')?.focus({ preventScroll: true });
        }
      });
    };
  }, [host, mode, toggle]);

  return { mountRef, editorRef, host, mode, busy, error, toggle };
}
