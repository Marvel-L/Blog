/**
 * 首页首次进入的全屏打字机引导：文案来自 site.config.intro，
 * 打印完成后等待 holdMs 或用户点击/按键后淡出进入主页。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { siteConfig } from '@config/site.config';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { lockBodyScroll, unlockBodyScroll } from '@/hooks/useModalOverlay';
import { easeSmooth } from '@/utils/motion';

const INTRO_SEEN_KEY = 'dblog-intro-seen';
const CHAR_MS = 72;
const LINE_PAUSE_MS = 420;

interface TypewriterIntroProps {
  /** 引导已跳过、不可用或已关闭时回调，供 Cookie 等后续浮层延后展示。 */
  onReady?: () => void;
}

const readIntroSeen = (): boolean => {
  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
};

const writeIntroSeen = () => {
  try {
    sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // 存储不可用时仅本次会话内尽力而为。
  }
};

export const TypewriterIntro: React.FC<TypewriterIntroProps> = ({ onReady }) => {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();
  const lines = useMemo(() => {
    const intro = siteConfig.intro;
    if (!intro?.enabled) {
      return [] as string[];
    }
    return (intro.lines ?? []).map((line) => line.trim()).filter(Boolean);
  }, []);
  const holdMs = siteConfig.intro?.holdMs ?? 10000;
  const onReadyRef = useRef(onReady);
  const dismissedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isVisible, setIsVisible] = useState(false);
  const [displayedLines, setDisplayedLines] = useState<string[]>([]);
  const [activeLine, setActiveLine] = useState('');
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [showCaret, setShowCaret] = useState(true);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const signalReady = useCallback(() => {
    onReadyRef.current?.();
  }, []);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) {
      return;
    }
    dismissedRef.current = true;
    writeIntroSeen();
    setIsVisible(false);
    signalReady();
  }, [signalReady]);

  // 仅首页首次进入：客户端判定后决定是否展示。
  useEffect(() => {
    if (location.pathname !== '/') {
      signalReady();
      return;
    }

    if (lines.length === 0 || readIntroSeen()) {
      signalReady();
      return;
    }

    setIsVisible(true);
  }, [lines.length, location.pathname, signalReady]);

  // 滚动锁 + 初始聚焦，便于键盘跳过。
  useEffect(() => {
    if (!isVisible) {
      return;
    }

    lockBodyScroll();
    const focusFrame = window.requestAnimationFrame(() => {
      containerRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      unlockBodyScroll();
    };
  }, [isVisible]);

  // 打字机 / 减弱动效直出全文。
  useEffect(() => {
    if (!isVisible || lines.length === 0) {
      return;
    }

    if (shouldReduceMotion) {
      setDisplayedLines(lines);
      setActiveLine('');
      setIsTypingComplete(true);
      setShowCaret(false);
      return;
    }

    let cancelled = false;
    let timeoutId = 0;
    let lineIndex = 0;
    let charIndex = 0;
    const completed: string[] = [];

    setDisplayedLines([]);
    setActiveLine('');
    setIsTypingComplete(false);
    setShowCaret(true);

    const tick = () => {
      if (cancelled) {
        return;
      }

      const current = lines[lineIndex] ?? '';
      if (charIndex < current.length) {
        charIndex += 1;
        setActiveLine(current.slice(0, charIndex));
        timeoutId = window.setTimeout(tick, CHAR_MS);
        return;
      }

      completed.push(current);
      setDisplayedLines([...completed]);
      setActiveLine('');
      lineIndex += 1;
      charIndex = 0;

      if (lineIndex >= lines.length) {
        setIsTypingComplete(true);
        return;
      }

      timeoutId = window.setTimeout(tick, LINE_PAUSE_MS);
    };

    timeoutId = window.setTimeout(tick, 360);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isVisible, lines, shouldReduceMotion]);

  // 打印完成后自动进入。
  useEffect(() => {
    if (!isVisible || !isTypingComplete) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => {
        dismiss();
      },
      Math.max(0, holdMs),
    );

    return () => window.clearTimeout(timeoutId);
  }, [dismiss, holdMs, isTypingComplete, isVisible]);

  // 点击 / Enter / Space 随时跳过。
  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        dismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dismiss, isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label="站点欢迎引导"
          tabIndex={-1}
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={shouldReduceMotion ? { duration: 0.12 } : { duration: 0.45, ease: easeSmooth }}
          className="fixed inset-0 z-viewer flex cursor-pointer flex-col items-center justify-center bg-paper px-6 text-center outline-none dark:bg-void"
          onClick={dismiss}
        >
          <div className="mx-auto w-full max-w-2xl" aria-live="polite">
            {displayedLines.map((line, index) => (
              <p
                key={`done-${index}`}
                className="mb-4 font-serif text-xl leading-relaxed text-ink dark:text-white sm:text-2xl md:text-3xl md:leading-snug"
              >
                {line}
              </p>
            ))}
            {(activeLine || (!isTypingComplete && !shouldReduceMotion)) && (
              <p className="mb-4 font-serif text-xl leading-relaxed text-ink dark:text-white sm:text-2xl md:text-3xl md:leading-snug">
                {activeLine}
                {showCaret && (
                  <span
                    className="ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[0.08em] bg-ink align-baseline dark:bg-white"
                    style={shouldReduceMotion ? undefined : { animation: 'typewriter-caret 1s steps(1) infinite' }}
                    aria-hidden="true"
                  />
                )}
              </p>
            )}
          </div>

          <p className="absolute bottom-[max(2rem,env(safe-area-inset-bottom,0px))] left-0 right-0 px-4 text-xs tracking-wide text-zinc-500 dark:text-zinc-400">
            {isTypingComplete ? '点击或等待进入主页' : '点击跳过 · 打印完成后可等待进入'}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
