/**
 * 首页标题旁诗词 / 名言：词库合并、近期去重抽取、左右位置本地持久化。
 */

import { siteConfig } from '@config/site.config';
import type { SiteHeroQuoteItem } from '@config/site.config';
import { DEFAULT_HERO_QUOTES } from '@/data/heroQuotes.data';

export const HERO_QUOTE_SIDE_STORAGE_KEY = 'dblog-hero-quote-side';
export const HERO_QUOTE_RECENT_STORAGE_KEY = 'dblog-hero-quote-recent';

/** 近期已展示句子最多记住多少条（再抽时优先避开）。 */
export const HERO_QUOTE_RECENT_LIMIT = 24;

export type HeroQuoteSide = 'left' | 'right';

export const isHeroQuoteSide = (value: unknown): value is HeroQuoteSide => value === 'left' || value === 'right';

const normalizeQuoteItems = (items: unknown): SiteHeroQuoteItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter(
    (item): item is SiteHeroQuoteItem =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as SiteHeroQuoteItem).text === 'string' &&
      (item as SiteHeroQuoteItem).text.trim().length > 0,
  );
};

const dedupeQuotesByText = (items: SiteHeroQuoteItem[]): SiteHeroQuoteItem[] => {
  const seen = new Set<string>();
  const result: SiteHeroQuoteItem[] = [];
  for (const item of items) {
    const key = item.text.trim();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
};

export const getHeroQuotesConfig = () => {
  const config = siteConfig.heroQuotes;
  if (config && config.enabled === false) {
    return null;
  }
  // 默认大词库 + 站点配置追加项（CMS 可补）；按正文去重。
  const items = dedupeQuotesByText([...normalizeQuoteItems(config?.items), ...DEFAULT_HERO_QUOTES]);
  if (items.length === 0) {
    return null;
  }
  const defaultSide: HeroQuoteSide = isHeroQuoteSide(config?.defaultSide) ? config.defaultSide : 'right';
  return { items, defaultSide };
};

export const readStoredHeroQuoteSide = (fallback: HeroQuoteSide = 'right'): HeroQuoteSide => {
  try {
    const saved = localStorage.getItem(HERO_QUOTE_SIDE_STORAGE_KEY);
    if (isHeroQuoteSide(saved)) {
      return saved;
    }
  } catch {
    // 存储不可用时回退默认位置。
  }
  return fallback;
};

export const writeStoredHeroQuoteSide = (side: HeroQuoteSide): void => {
  try {
    localStorage.setItem(HERO_QUOTE_SIDE_STORAGE_KEY, side);
  } catch {
    // 持久化为可选能力。
  }
};

export const readRecentHeroQuoteTexts = (): string[] => {
  try {
    const raw = localStorage.getItem(HERO_QUOTE_RECENT_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
  } catch {
    return [];
  }
};

export const writeRecentHeroQuoteTexts = (texts: string[]): void => {
  try {
    localStorage.setItem(HERO_QUOTE_RECENT_STORAGE_KEY, JSON.stringify(texts));
  } catch {
    // 持久化为可选能力。
  }
};

const rememberHeroQuoteText = (text: string, previousRecent: string[]): string[] => {
  const next = [text, ...previousRecent.filter((item) => item !== text)];
  return next.slice(0, HERO_QUOTE_RECENT_LIMIT);
};

/**
 * 随机抽取一句，优先避开近期已出现与当前展示句，降低短周期重复。
 */
export const pickRandomHeroQuote = (items: SiteHeroQuoteItem[], excludeText?: string): SiteHeroQuoteItem => {
  if (items.length === 0) {
    throw new Error('pickRandomHeroQuote: empty items');
  }
  if (items.length === 1) {
    return items[0];
  }

  const recent = readRecentHeroQuoteTexts();
  const excluded = new Set<string>(recent);
  if (excludeText) {
    excluded.add(excludeText);
  }

  let pool = items.filter((item) => !excluded.has(item.text));
  // 若近期记忆过满导致无可选：丢掉较早一半记忆再抽。
  if (pool.length === 0) {
    const trimmedRecent = recent.slice(0, Math.ceil(recent.length / 2));
    writeRecentHeroQuoteTexts(trimmedRecent);
    const softExcluded = new Set<string>(trimmedRecent);
    if (excludeText) {
      softExcluded.add(excludeText);
    }
    pool = items.filter((item) => !softExcluded.has(item.text));
  }
  if (pool.length === 0) {
    pool = excludeText ? items.filter((item) => item.text !== excludeText) : items;
  }
  if (pool.length === 0) {
    pool = items;
  }

  const index = Math.floor(Math.random() * pool.length);
  const picked = pool[index];
  writeRecentHeroQuoteTexts(rememberHeroQuoteText(picked.text, recent));
  return picked;
};
