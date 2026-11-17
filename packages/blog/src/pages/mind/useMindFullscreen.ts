import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { hasOpenOverlay, lockBodyScroll, unlockBodyScroll } from '@/hooks/useModalOverlay';

type FullscreenMode = 'none' | 'window';

export interface MindFullscreen {
  mountRef: RefObject<HTMLDivElement | null>;
  editorRef: RefObject<HTMLDivElement | null>;
  host: HTMLDivElement | null;
  mode: FullscreenMode;
  toggle: () => void;
}

const focusableSelector =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Move one portal host so fullscreen transitions preserve the editor and its history. */
export function useMindFullscreen(): MindFullscreen {
  const mountRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<FullscreenMode>('none');
  const mounted = useRef(false);
  const modeRef = useRef<FullscreenMode>('none');
  const focusFrame = useRef(0);
  const inlineHeight = useRef(0);

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
      element.remove();
    };
  }, []);

  const toggle = useCallback(() => {
    if (!editorRef.current || !host || !mounted.current) return;
    if (modeRef.current === 'window') changeMode('none');
    else {
      inlineHeight.current = host.getBoundingClientRect().height;
      changeMode('window');
    }
  }, [changeMode, host]);

  useLayoutEffect(() => {
    if (!host || mode !== 'window') return;
    const mount = mountRef.current;
    if (!mount) return;
    window.cancelAnimationFrame(focusFrame.current);
    const inertElements = new Map<HTMLElement, string | null>();
    const originalHeight = mount.style.height;
    mount.style.height = `${inlineHeight.current}px`;
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
    const observer = new MutationObserver(isolateBackground);
    observer.observe(document.body, { childList: true });
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || hasOpenOverlay()) return;
      event.preventDefault();
      event.stopPropagation();
      toggle();
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
      observer.disconnect();
      for (const [element, previous] of inertElements) {
        if (previous === null) element.removeAttribute('inert');
        else element.setAttribute('inert', previous);
      }
      host.classList.remove('is-window-fullscreen');
      if (mounted.current) mount.appendChild(host);
      mount.style.height = originalHeight;
      unlockBodyScroll();
      focusFrame.current = window.requestAnimationFrame(() => {
        if (mounted.current && modeRef.current === 'none') {
          host.querySelector<HTMLElement>('[data-mind-fullscreen-toggle]')?.focus({ preventScroll: true });
        }
      });
    };
  }, [host, mode, toggle]);

  return { mountRef, editorRef, host, mode, toggle };
}
