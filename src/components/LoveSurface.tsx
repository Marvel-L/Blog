import React, { startTransition, useId, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Heart,
  Map as MapIcon,
  Sparkles,
  Waves,
} from 'lucide-react';
import { Seo } from './Seo';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { LOVE_REGIONS, type LoveRegion } from '@/data/loveRegions.data';

const REGION_VIEWBOX = '0 0 320 260';

const getNextIndex = (currentIndex: number, delta: number) => (currentIndex + delta + LOVE_REGIONS.length) % LOVE_REGIONS.length;

const RegionCrystalFigure = ({
  activeRegion,
  shouldReduceMotion,
}: {
  activeRegion: LoveRegion;
  shouldReduceMotion: boolean;
}) => {
  const gradientId = useId();
  const glowId = useId();
  const shadowId = useId();
  const centroid = `${activeRegion.centroid[0]}px ${activeRegion.centroid[1]}px`;

  return (
    <motion.div
      key={activeRegion.id}
      initial={shouldReduceMotion ? false : { opacity: 0, rotateX: 42, rotateY: -16, scale: 0.94, y: 18 }}
      animate={{ opacity: 1, rotateX: 55, rotateY: -18, scale: 1, y: 0 }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.68, ease: [0.22, 1, 0.36, 1] as const }
      }
      className="relative mx-auto aspect-[1.18/1] w-full max-w-[34rem] [perspective:1500px]"
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div className="absolute inset-[10%_8%_12%] rounded-[2.4rem] border border-white/12 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-[2px]" />
      <motion.div
        aria-hidden="true"
        animate={shouldReduceMotion ? undefined : { rotate: [0, 3, 0, -3, 0] }}
        transition={shouldReduceMotion ? undefined : { duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-0"
        style={{ transformOrigin: centroid, transform: 'translateZ(-90px)' }}
      >
        <svg viewBox={REGION_VIEWBOX} className="h-full w-full overflow-visible">
          <path
            d={activeRegion.path}
            fill="rgba(255, 183, 197, 0.1)"
            stroke="rgba(255, 214, 224, 0.18)"
            strokeWidth="3"
            style={{ filter: 'blur(26px)' }}
            transform="translate(14 20) scale(1.02)"
          />
        </svg>
      </motion.div>
      <motion.div
        aria-hidden="true"
        animate={shouldReduceMotion ? undefined : { rotate: [0, -2.5, 0, 2.5, 0] }}
        transition={shouldReduceMotion ? undefined : { duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
        className="absolute inset-0"
        style={{ transformOrigin: centroid, transform: 'translateZ(-24px)' }}
      >
        <svg viewBox={REGION_VIEWBOX} className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="18%" x2="78%" y1="8%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.82)" />
              <stop offset="38%" stopColor="rgba(255,213,232,0.42)" />
              <stop offset="100%" stopColor="rgba(255,132,163,0.1)" />
            </linearGradient>
            <radialGradient id={glowId} cx="50%" cy="40%" r="65%">
              <stop offset="0%" stopColor="rgba(255,243,247,0.9)" />
              <stop offset="55%" stopColor="rgba(255,186,214,0.28)" />
              <stop offset="100%" stopColor="rgba(255,186,214,0)" />
            </radialGradient>
            <filter id={shadowId} x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="22" stdDeviation="18" floodColor="rgba(18,5,13,0.38)" />
            </filter>
          </defs>
          <path
            d={activeRegion.path}
            fill={`url(#${glowId})`}
            stroke="rgba(255, 250, 252, 0.22)"
            strokeWidth="4"
            transform="translate(12 18)"
            filter={`url(#${shadowId})`}
          />
          <path
            d={activeRegion.path}
            fill="rgba(255, 173, 196, 0.08)"
            stroke="rgba(255, 233, 239, 0.26)"
            strokeWidth="5"
            transform="translate(8 10)"
          />
          <path
            d={activeRegion.path}
            fill={`url(#${gradientId})`}
            fillOpacity="0.92"
            stroke="rgba(255,255,255,0.72)"
            strokeOpacity="0.88"
            strokeWidth="2.8"
          />
          <path
            d={activeRegion.path}
            fill="none"
            stroke="rgba(255,255,255,0.32)"
            strokeWidth="1.4"
            strokeDasharray="7 9"
            transform="translate(-4 -5) scale(1.012)"
          />
          <circle cx={activeRegion.centroid[0]} cy={activeRegion.centroid[1]} r="7" fill="rgba(255,255,255,0.96)" />
          <circle
            cx={activeRegion.centroid[0]}
            cy={activeRegion.centroid[1]}
            r="18"
            fill="none"
            stroke="rgba(255,255,255,0.36)"
            strokeWidth="2"
          />
        </svg>
      </motion.div>
    </motion.div>
  );
};

export const LoveSurface: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const [isRegionPanelOpen, setIsRegionPanelOpen] = useState(false);
  const [activeRegionIndex, setActiveRegionIndex] = useState(0);

  const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.72, ease: 'easeOut' as const };
  const activeRegion = LOVE_REGIONS[activeRegionIndex]!;

  const openRegionPanel = () => {
    setIsRegionPanelOpen(true);
  };

  const showRegionAt = (nextIndex: number) => {
    startTransition(() => {
      setActiveRegionIndex(nextIndex);
      setIsRegionPanelOpen(true);
    });
  };

  const cycleRegion = (delta: number) => {
    showRegionAt(getNextIndex(activeRegionIndex, delta));
  };

  return (
    <>
      <Seo title="Love 面" description="D-blog 的 Love 面：收起原有栏目，只保留更私密的一层入口与氛围。" />
      <section className="relative isolate min-h-[calc(100vh-8rem)] overflow-hidden rounded-[2.25rem] border border-rose-200/30 bg-[linear-gradient(145deg,rgba(38,10,24,0.92),rgba(88,24,48,0.82)_38%,rgba(191,74,101,0.68)_100%)] px-5 py-6 text-white shadow-[0_36px_120px_rgba(84,13,39,0.45)] sm:px-8 sm:py-8 md:px-12 md:py-10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,230,214,0.34),transparent_32%),radial-gradient(circle_at_84%_18%,rgba(255,198,216,0.22),transparent_26%),radial-gradient(circle_at_50%_100%,rgba(255,132,102,0.26),transparent_30%)]" />
          <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(255,255,255,0.22),transparent)]" />
          <div className="absolute inset-y-0 left-[58%] w-px bg-white/14" />
          <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.26)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-position:center_center] [background-size:40px_40px]" />
          <motion.div
            aria-hidden="true"
            initial={shouldReduceMotion ? false : { opacity: 0.4, scale: 0.92 }}
            animate={shouldReduceMotion ? undefined : { opacity: [0.32, 0.46, 0.32], scale: [0.94, 1.02, 0.94] }}
            transition={shouldReduceMotion ? undefined : { duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -left-14 top-12 h-64 w-64 rounded-full bg-rose-200/20 blur-3xl"
          />
          <motion.div
            aria-hidden="true"
            initial={shouldReduceMotion ? false : { opacity: 0.3, scale: 1.05 }}
            animate={shouldReduceMotion ? undefined : { opacity: [0.18, 0.34, 0.18], scale: [1.02, 0.96, 1.02] }}
            transition={shouldReduceMotion ? undefined : { duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
            className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-orange-200/15 blur-3xl"
          />
        </div>

        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition}
          className="relative mx-auto flex max-w-6xl flex-col gap-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.34em] text-rose-50/90 backdrop-blur-sm">
              <Heart size={14} className="fill-current" aria-hidden="true" />
              Love Side
            </div>
            <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.28em] text-white/60">
              <Sparkles size={14} aria-hidden="true" />
              Hidden Switch Active
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_22rem]">
            <div className="relative overflow-hidden rounded-[2rem] border border-white/16 bg-black/14 p-6 backdrop-blur-md sm:p-8 md:p-10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(255,255,255,0.16),transparent_22%),linear-gradient(125deg,rgba(255,255,255,0.08),transparent_42%)]" />
              <div className="relative">
                <motion.p
                  initial={shouldReduceMotion ? false : { opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...transition, delay: shouldReduceMotion ? 0 : 0.08 }}
                  className="text-xs font-semibold uppercase tracking-[0.32em] text-rose-100/72"
                >
                  Alternate Surface
                </motion.p>
                <motion.h1
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transition, delay: shouldReduceMotion ? 0 : 0.14 }}
                  className="mt-5 max-w-4xl font-serif text-5xl font-bold leading-[0.94] tracking-tight text-white sm:text-6xl md:text-7xl lg:text-[5.5rem]"
                >
                  Love 面
                </motion.h1>
                <motion.p
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transition, delay: shouldReduceMotion ? 0 : 0.22 }}
                  className="mt-6 max-w-2xl text-base leading-8 text-white/82 sm:text-lg"
                >
                  切进来之后，不再是博客首页的延伸，而是另一层完整的观看方式。
                  原有文章、说说、归档、标签全部退场，只留下更强烈的色温、留白和情绪。
                </motion.p>

                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transition, delay: shouldReduceMotion ? 0 : 0.3 }}
                  className="mt-10 grid gap-3 sm:grid-cols-3"
                >
                  {[
                    ['Mode', 'Love / B-Side'],
                    ['State', isRegionPanelOpen ? `Region / ${activeRegion.name}` : 'Surface Overview'],
                    ['Focus', isRegionPanelOpen ? 'Crystal Region Model' : 'Region System'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 backdrop-blur-sm">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/46">{label}</p>
                      <p className="mt-2 text-sm font-semibold text-white/86">{value}</p>
                    </div>
                  ))}
                </motion.div>

                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transition, delay: shouldReduceMotion ? 0 : 0.38 }}
                  className="mt-10"
                >
                  {isRegionPanelOpen ? (
                    <div className="rounded-[1.9rem] border border-white/14 bg-[linear-gradient(155deg,rgba(255,255,255,0.14),rgba(255,255,255,0.05))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-md sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-rose-100/68">Region System</p>
                          <div className="mt-3 flex flex-wrap items-end gap-3">
                            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-[2.4rem]">{activeRegion.name}</h2>
                            <span className="rounded-full border border-white/12 bg-white/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/66">
                              {activeRegion.scope} · {activeRegion.level}
                            </span>
                          </div>
                          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/74 sm:text-[0.96rem]">{activeRegion.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsRegionPanelOpen(false)}
                          className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/16 bg-white/[0.08] px-4 text-sm font-semibold text-white/88 transition-colors duration-200 hover:bg-white/[0.14]"
                        >
                          返回概览
                        </button>
                      </div>

                      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_19rem]">
                        <div className="relative overflow-hidden rounded-[1.8rem] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))] px-3 py-4 sm:px-5">
                          <div className="pointer-events-none absolute inset-x-[12%] bottom-6 h-16 rounded-full bg-[#090208]/60 blur-2xl" />
                          <div className="pointer-events-none absolute inset-x-10 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.3),transparent_70%)]" />
                          <RegionCrystalFigure activeRegion={activeRegion} shouldReduceMotion={shouldReduceMotion} />
                        </div>

                        <div className="flex flex-col gap-4">
                          <div className="rounded-[1.6rem] border border-white/12 bg-black/18 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/42">Switch</p>
                            <div className="mt-4 flex gap-3">
                              <button
                                type="button"
                                onClick={() => cycleRegion(-1)}
                                aria-label="切换到上一个地域"
                                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[1.2rem] border border-white/12 bg-white/[0.08] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/[0.14]"
                              >
                                <ArrowLeft size={16} aria-hidden="true" />
                                上一个
                              </button>
                              <button
                                type="button"
                                onClick={() => cycleRegion(1)}
                                aria-label="切换到下一个地域"
                                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[1.2rem] border border-white/12 bg-white/[0.08] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/[0.14]"
                              >
                                下一个
                                <ArrowRight size={16} aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          <div className="rounded-[1.6rem] border border-white/12 bg-black/18 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/42">Available Regions</p>
                            <div className="mt-4 grid gap-2.5">
                              {LOVE_REGIONS.map((region, index) => {
                                const active = region.id === activeRegion.id;
                                return (
                                  <button
                                    key={region.id}
                                    type="button"
                                    onClick={() => showRegionAt(index)}
                                    aria-pressed={active}
                                    aria-label={`查看${region.name}地域`}
                                    className={
                                      active
                                        ? 'rounded-[1.2rem] border border-rose-100/38 bg-rose-200/16 px-4 py-3 text-left'
                                        : 'rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors duration-200 hover:bg-white/[0.09]'
                                    }
                                  >
                                    <span className="flex items-center justify-between gap-3">
                                      <span>
                                        <span className="block text-sm font-semibold text-white">{region.name}</span>
                                        <span className="mt-1 block text-xs leading-6 text-white/56">
                                          {region.scope} · {region.level}
                                        </span>
                                      </span>
                                      <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/40">
                                        {active ? 'Current' : 'Switch'}
                                      </span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="rounded-[1.6rem] border border-white/12 bg-black/18 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/42">Surface Note</p>
                            <p className="mt-3 text-sm leading-7 text-white/66">{activeRegion.switchHint}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 rounded-[1.9rem] border border-white/14 bg-[linear-gradient(155deg,rgba(255,255,255,0.1),rgba(255,255,255,0.04))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-md sm:grid-cols-[minmax(0,1fr)_13rem] sm:p-6">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-rose-100/70">Region Layer</p>
                        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/74">
                          现在地域不再只是占位。点击之后会打开独立地域层，默认展示透明 3D 地理轮廓，并允许在湘潭、长沙、北京之间左右切换。
                        </p>
                      </div>
                      <div className="flex items-center justify-start sm:justify-end">
                        <button
                          type="button"
                          onClick={openRegionPanel}
                          aria-label={`打开地域系统，当前${activeRegion.name}`}
                          className="group inline-flex min-h-14 w-full items-center justify-between rounded-[1.4rem] border border-white/18 bg-black/20 px-4 py-3 text-left text-sm font-semibold text-white transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5 hover:border-white/28 hover:bg-black/28 sm:max-w-[13rem]"
                        >
                          <span className="flex items-center gap-3">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/16 bg-white/10 text-rose-100/90">
                              <MapIcon size={16} aria-hidden="true" />
                            </span>
                            <span>地域</span>
                          </span>
                          <ArrowUpRight
                            size={16}
                            aria-hidden="true"
                            className="text-white/70 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                          />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            </div>

            <motion.aside
              initial={shouldReduceMotion ? false : { opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...transition, delay: shouldReduceMotion ? 0 : 0.18 }}
              className="relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.05))] p-6 backdrop-blur-md"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_38%)]" />
              <div className="relative">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-rose-100/70">Current Entrance</p>
                <p className="mt-4 text-sm leading-7 text-white/72">
                  地域系统已经接进 Love 面。当前默认从 {activeRegion.name} 开始，可以进入后用左右切换不同地域，也可以直接点列表跳转。
                </p>
                <div className="mt-8 rounded-[1.5rem] border border-white/12 bg-black/18 p-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-white/10 text-rose-100/88">
                      <Waves size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{activeRegion.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.24em] text-white/48">
                        {activeRegion.scope} · {activeRegion.level}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs leading-6 text-white/62">{activeRegion.switchHint}</p>
                </div>
              </div>

              <div className="relative mt-10 border-t border-white/12 pt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/40">Visual Rule</p>
                <p className="mt-3 text-xs leading-6 text-white/62">
                  地理轮廓使用本地静态数据渲染为透明玻璃态图形，不依赖客户端请求，因此不会影响首屏确定性和 Love 面的切换一致性。
                </p>
              </div>
            </motion.aside>
          </div>
        </motion.div>
      </section>
    </>
  );
};
