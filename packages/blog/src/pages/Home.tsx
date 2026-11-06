/**
 * 独立首页：保留站点封面，首页内容可在这里继续扩展。
 */
import { useEffect, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { siteConfig } from '@config/site.config';
import { Seo } from '@/components/Seo';
import { HeroQuote, resolveHeroQuoteSide } from '@/components/HeroQuote';
import { WaveFishDivider } from '@/components/effects/WaveFishDivider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { getHeroQuotesConfig, type HeroQuoteSide } from '@/utils/heroQuotes';

export const Home = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 340], [1, 0.3]);
  const quotesEnabled = Boolean(getHeroQuotesConfig());
  const [quoteSide, setQuoteSide] = useState<HeroQuoteSide>('right');

  useEffect(() => {
    if (quotesEnabled) setQuoteSide(resolveHeroQuoteSide());
  }, [quotesEnabled]);

  useEffect(() => {
    // 旧首页的搜索/分类/分页链接继续可用；水合后再跳转，保持 SSR 首帧一致。
    const params = new URLSearchParams(location.search);
    if (['q', 'category', 'sort', 'page'].some((key) => params.has(key))) {
      navigate(`/articles${location.search}${location.hash}`, { replace: true });
    }
  }, [location.search, location.hash, navigate]);

  return (
    <div className="pb-8 md:pb-12">
      <Seo title={siteConfig.title} description={siteConfig.description} />
      <div className="relative overflow-hidden px-4 pb-8 pt-5 text-center md:pb-10 md:pt-8">
        <motion.div className="relative" style={shouldReduceMotion ? undefined : { opacity: heroOpacity }}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-400">
            {siteConfig.subtitle}
          </p>
          <div className="relative mb-3">
            <h1 className="text-balance font-serif text-5xl font-bold tracking-tight text-ink [overflow-wrap:anywhere] dark:text-white max-[400px]:text-4xl sm:text-6xl md:text-7xl">
              {siteConfig.title}
            </h1>
            {quotesEnabled && (
              <div
                className={`mt-4 flex justify-center sm:absolute sm:top-1/2 sm:mt-0 sm:w-[min(15rem,30%)] sm:-translate-y-1/2 md:w-[min(16rem,28%)] ${
                  quoteSide === 'left'
                    ? 'sm:left-0 sm:justify-start lg:left-2 xl:left-6'
                    : 'sm:right-0 sm:justify-end lg:right-2 xl:right-6'
                }`}
              >
                <HeroQuote side={quoteSide} onSideChange={setQuoteSide} />
              </div>
            )}
          </div>
          <p className="mx-auto max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-300 md:text-base">
            {siteConfig.description}
          </p>
        </motion.div>
      </div>
      <WaveFishDivider variant="wave" className="mx-auto mb-2 max-w-3xl px-4 md:mb-4 md:px-0" />
    </div>
  );
};
