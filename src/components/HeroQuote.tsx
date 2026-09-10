/**
 * 首页标题旁随机诗词 / 名言：展示一句语录，支持换一句与左右位置切换（本地持久化）。
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import type { SiteHeroQuoteItem } from '@config/site.config';
import {
  getHeroQuotesConfig,
  pickRandomHeroQuote,
  readStoredHeroQuoteSide,
  writeStoredHeroQuoteSide,
  type HeroQuoteSide,
} from '@/utils/heroQuotes';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export interface HeroQuoteProps {
  /** 当前摆放侧，由父级 Hero 控制布局。 */
  side: HeroQuoteSide;
  onSideChange: (side: HeroQuoteSide) => void;
}

export const HeroQuote: React.FC<HeroQuoteProps> = ({ side, onSideChange }) => {
  const shouldReduceMotion = useReducedMotion();
  const [quote, setQuote] = useState<SiteHeroQuoteItem | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const config = getHeroQuotesConfig();
    if (!config) {
      return;
    }
    setQuote(pickRandomHeroQuote(config.items));
    setReady(true);
  }, []);

  if (!ready || !quote) {
    // 桌面端诗词为绝对定位，无需占位；移动端稍留高度减轻出现时跳动。
    return <div className="min-h-[3rem] w-full max-w-[14rem] sm:hidden" aria-hidden="true" />;
  }

  const toggleSide = () => {
    const next: HeroQuoteSide = side === 'left' ? 'right' : 'left';
    writeStoredHeroQuoteSide(next);
    onSideChange(next);
  };

  const refreshQuote = () => {
    const config = getHeroQuotesConfig();
    if (!config) {
      return;
    }
    setQuote(pickRandomHeroQuote(config.items, quote.text));
  };

  const alignClass = side === 'left' ? 'items-end text-right' : 'items-start text-left';

  return (
    <figure
      className={`flex w-full max-w-[14rem] flex-col gap-1.5 sm:max-w-[11rem] md:max-w-[13rem] ${alignClass} ${
        shouldReduceMotion ? '' : 'hero-quote-enter'
      }`}
      aria-label="每日诗词与名言"
    >
      <blockquote className="font-serif text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 md:text-[0.9375rem]">
        <span className="text-zinc-400 dark:text-zinc-500" aria-hidden="true">
          「
        </span>
        {quote.text}
        <span className="text-zinc-400 dark:text-zinc-500" aria-hidden="true">
          」
        </span>
      </blockquote>
      {quote.source ? (
        <figcaption className="text-xs text-zinc-500 dark:text-zinc-400">— {quote.source}</figcaption>
      ) : null}
      <div className={`mt-0.5 flex items-center gap-1 ${side === 'left' ? 'justify-end' : 'justify-start'}`}>
        <button
          type="button"
          onClick={refreshQuote}
          className="inline-flex min-h-9 items-center gap-1 rounded-control px-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white dark:focus-visible:outline-zinc-100"
          aria-label="换一句诗词或名言"
        >
          <RefreshCw size={12} aria-hidden="true" />
          换一句
        </button>
        <button
          type="button"
          onClick={toggleSide}
          className="inline-flex min-h-9 items-center gap-1 rounded-control px-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white dark:focus-visible:outline-zinc-100"
          aria-label={side === 'left' ? '移到标题右侧' : '移到标题左侧'}
        >
          <ArrowLeftRight size={12} aria-hidden="true" />
          {side === 'left' ? '右侧' : '左侧'}
        </button>
      </div>
    </figure>
  );
};

/** 读取配置与本地偏好后的初始侧（仅客户端调用）。 */
export const resolveHeroQuoteSide = (): HeroQuoteSide => {
  const config = getHeroQuotesConfig();
  const fallback = config?.defaultSide ?? 'right';
  return readStoredHeroQuoteSide(fallback);
};
