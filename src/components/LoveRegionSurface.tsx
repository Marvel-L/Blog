import React, { startTransition, useId, useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Sparkles, Waves } from 'lucide-react';
import { Seo } from './Seo';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { LOVE_REGIONS, type LoveRegion } from '@/data/loveRegions.data';

const REGION_VIEWBOX = '0 0 320 260';

const RegionCrystalFigure = ({
  activeRegion,
  isHovered,
  shouldReduceMotion,
}: {
  activeRegion: LoveRegion;
  isHovered: boolean;
  shouldReduceMotion: boolean;
}) => {
  const gradientId = useId();
  const glowId = useId();
  const shadowId = useId();
  const specularId = useId();
  const centroid = `${activeRegion.centroid[0]}px ${activeRegion.centroid[1]}px`;

  return (
    <motion.div
      key={activeRegion.id}
      initial={shouldReduceMotion ? false : { opacity: 0, rotateX: 56, rotateY: -20, scale: 0.95, y: 18 }}
      animate={{
        opacity: 1,
        rotateX: isHovered ? 44 : 52,
        rotateY: isHovered ? -12 : -18,
        scale: isHovered ? 1.035 : 1,
        y: isHovered ? -16 : 0,
      }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const }
      }
      className="relative mx-auto aspect-[1.2/1] w-full max-w-[38rem] [perspective:1800px]"
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div className="absolute inset-[9%_6%_14%] rounded-[2.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-[3px]" />
      <div className="pointer-events-none absolute inset-x-[17%] bottom-[4%] h-16 rounded-full bg-[#14050f]/70 blur-2xl" />

      <motion.div
        aria-hidden="true"
        animate={shouldReduceMotion ? undefined : { rotate: [0, 2.4, 0, -2.4, 0] }}
        transition={shouldReduceMotion ? undefined : { duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-0"
        style={{ transformOrigin: centroid, transform: 'translateZ(-110px)' }}
      >
        <svg viewBox={REGION_VIEWBOX} className="h-full w-full overflow-visible">
          <path
            d={activeRegion.path}
            fill="rgba(255, 173, 201, 0.12)"
            stroke="rgba(255, 213, 231, 0.12)"
            strokeWidth="4"
            style={{ filter: 'blur(28px)' }}
            transform="translate(20 30) scale(1.04)"
          />
        </svg>
      </motion.div>

      <motion.div
        aria-hidden="true"
        animate={shouldReduceMotion ? undefined : { rotate: [0, -2, 0, 2, 0] }}
        transition={shouldReduceMotion ? undefined : { duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        className="absolute inset-0"
        style={{ transformOrigin: centroid, transform: 'translateZ(-38px)' }}
      >
        <svg viewBox={REGION_VIEWBOX} className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="16%" x2="80%" y1="4%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
              <stop offset="42%" stopColor="rgba(255,216,232,0.5)" />
              <stop offset="100%" stopColor="rgba(255,130,168,0.14)" />
            </linearGradient>
            <linearGradient id={specularId} x1="28%" x2="70%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.94)" />
              <stop offset="52%" stopColor="rgba(255,255,255,0.18)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            <radialGradient id={glowId} cx="48%" cy="34%" r="68%">
              <stop offset="0%" stopColor="rgba(255,244,248,0.96)" />
              <stop offset="54%" stopColor="rgba(255,197,219,0.32)" />
              <stop offset="100%" stopColor="rgba(255,197,219,0)" />
            </radialGradient>
            <filter id={shadowId} x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow
                dx="0"
                dy={isHovered ? '30' : '22'}
                stdDeviation={isHovered ? '22' : '18'}
                floodColor="rgba(18,5,13,0.42)"
              />
            </filter>
          </defs>

          <path
            d={activeRegion.path}
            fill={`url(#${glowId})`}
            stroke="rgba(255, 245, 249, 0.18)"
            strokeWidth="5"
            transform="translate(16 24) scale(1.03)"
            filter={`url(#${shadowId})`}
          />
          <path
            d={activeRegion.path}
            fill="rgba(255, 176, 206, 0.06)"
            stroke="rgba(255, 234, 240, 0.22)"
            strokeWidth="6"
            transform="translate(10 12) scale(1.015)"
          />
          <path
            d={activeRegion.path}
            fill={`url(#${gradientId})`}
            fillOpacity="0.94"
            stroke="rgba(255,255,255,0.78)"
            strokeOpacity="0.9"
            strokeWidth="3"
          />
          <path
            d={activeRegion.path}
            fill={`url(#${specularId})`}
            fillOpacity="0.44"
            stroke="none"
            transform="translate(-3 -8) scale(0.99)"
          />
          <path
            d={activeRegion.path}
            fill="none"
            stroke="rgba(255,255,255,0.34)"
            strokeWidth="1.5"
            strokeDasharray="8 10"
            transform="translate(-6 -7) scale(1.016)"
          />
          <circle cx={activeRegion.centroid[0]} cy={activeRegion.centroid[1]} r="7" fill="rgba(255,255,255,0.98)" />
          <circle
            cx={activeRegion.centroid[0]}
            cy={activeRegion.centroid[1]}
            r={isHovered ? '22' : '18'}
            fill="none"
            stroke="rgba(255,255,255,0.42)"
            strokeWidth="2"
          />
        </svg>
      </motion.div>
    </motion.div>
  );
};

export const LoveRegionSurface: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const [activeRegionIndex, setActiveRegionIndex] = useState(0);
  const [isMapHovered, setIsMapHovered] = useState(false);

  const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.72, ease: 'easeOut' as const };
  const activeRegion = LOVE_REGIONS[activeRegionIndex]!;

  const showRegionAt = (nextIndex: number) => {
    startTransition(() => {
      setActiveRegionIndex(nextIndex);
    });
  };

  const handleRegionSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextIndex = LOVE_REGIONS.findIndex((region) => region.id === event.target.value);
    if (nextIndex >= 0) {
      showRegionAt(nextIndex);
    }
  };

  return (
    <>
      <Seo title={`${activeRegion.name} 地域`} description={`Love 面地域页：${activeRegion.name} 的透明 3D 地理轮廓展示。`} />
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
              Region View
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.28fr)_22rem]">
            <div className="relative overflow-hidden rounded-[2rem] border border-white/16 bg-black/14 p-6 backdrop-blur-md sm:p-8 md:p-10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(255,255,255,0.16),transparent_22%),linear-gradient(125deg,rgba(255,255,255,0.08),transparent_42%)]" />
              <div className="relative">
                <motion.p
                  initial={shouldReduceMotion ? false : { opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...transition, delay: shouldReduceMotion ? 0 : 0.08 }}
                  className="text-xs font-semibold uppercase tracking-[0.32em] text-rose-100/72"
                >
                  Region Surface
                </motion.p>
                <motion.h1
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transition, delay: shouldReduceMotion ? 0 : 0.14 }}
                  className="mt-5 max-w-4xl font-serif text-5xl font-bold leading-[0.94] tracking-tight text-white sm:text-6xl md:text-7xl lg:text-[5.5rem]"
                >
                  {activeRegion.name}
                </motion.h1>
                <motion.p
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transition, delay: shouldReduceMotion ? 0 : 0.22 }}
                  className="mt-6 max-w-2xl text-base leading-8 text-white/82 sm:text-lg"
                >
                  选择城市后直接切到完整透明版图。当前视角会保持一个更稳定的俯视透视，鼠标移上去时整块版图会整体上浮。
                </motion.p>

                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transition, delay: shouldReduceMotion ? 0 : 0.3 }}
                  className="mt-10 grid gap-3 sm:grid-cols-3"
                >
                  {[
                    ['Mode', 'Love / Region'],
                    ['City', activeRegion.name],
                    ['Hover', isMapHovered ? 'Floating' : 'Idle'],
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
                  className="mt-10 rounded-[1.9rem] border border-white/14 bg-[linear-gradient(155deg,rgba(255,255,255,0.14),rgba(255,255,255,0.05))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-md sm:p-5"
                >
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_18rem]">
                    <div
                      data-testid="love-region-stage"
                      data-hovered={isMapHovered ? 'true' : 'false'}
                      onPointerEnter={() => setIsMapHovered(true)}
                      onPointerLeave={() => setIsMapHovered(false)}
                      className="group relative overflow-hidden rounded-[2rem] border border-white/12 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.22),rgba(255,255,255,0.04)_52%,rgba(255,255,255,0.01)_100%)] px-3 py-5 sm:px-5"
                    >
                      <div className="pointer-events-none absolute inset-x-[8%] top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.34),transparent_70%)]" />
                      <div className="pointer-events-none absolute inset-x-[14%] bottom-[6%] h-20 rounded-full bg-[#0a0307]/65 blur-2xl transition-all duration-300 group-data-[hovered=true]:bottom-[4%] group-data-[hovered=true]:scale-110" />
                      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:28px_28px]" />
                      <RegionCrystalFigure
                        activeRegion={activeRegion}
                        isHovered={isMapHovered}
                        shouldReduceMotion={shouldReduceMotion}
                      />
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="rounded-[1.6rem] border border-white/12 bg-black/18 p-4">
                        <label htmlFor="love-region-city" className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/42">
                          City Select
                        </label>
                        <div className="mt-4">
                          <select
                            id="love-region-city"
                            aria-label="选择地域城市"
                            value={activeRegion.id}
                            onChange={handleRegionSelect}
                            className="min-h-12 w-full rounded-[1.2rem] border border-white/12 bg-white/[0.08] px-4 text-sm font-semibold text-white outline-none transition-colors duration-200 focus:border-rose-200/60 focus:bg-white/[0.12]"
                          >
                            {LOVE_REGIONS.map((region) => (
                              <option key={region.id} value={region.id} className="bg-[#3d1024] text-white">
                                {region.name} · {region.scope}
                              </option>
                            ))}
                          </select>
                        </div>
                        <p className="mt-3 text-xs leading-6 text-white/58">点击下拉后选择城市，版图会直接切换到对应的透明展示。</p>
                      </div>

                      <div className="rounded-[1.6rem] border border-white/12 bg-black/18 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/42">Current Region</p>
                        <div className="mt-4 flex items-center gap-3">
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
                        <p className="mt-4 text-xs leading-6 text-white/62">{activeRegion.description}</p>
                      </div>

                      <div className="rounded-[1.6rem] border border-white/12 bg-black/18 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/42">Surface Note</p>
                        <p className="mt-3 text-sm leading-7 text-white/66">{activeRegion.switchHint}</p>
                      </div>
                    </div>
                  </div>
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-rose-100/70">View Direction</p>
                <div className="mt-8 rounded-[1.5rem] border border-white/12 bg-black/18 p-4">
                  <p className="text-sm font-semibold text-white">透明俯视视角</p>
                  <p className="mt-3 text-xs leading-6 text-white/62">
                    版图整体采用更稳定的俯视角，前后分层拉开之后，透明边缘和投影会比之前更完整，不会显得像一张被压扁的轮廓。
                  </p>
                </div>

                <div className="mt-4 rounded-[1.5rem] border border-white/12 bg-black/18 p-4">
                  <p className="text-sm font-semibold text-white">悬浮反馈</p>
                  <p className="mt-3 text-xs leading-6 text-white/62">
                    鼠标停在版图舞台上时，版图会整体上浮并加深下方阴影，形成明确的悬浮感，而不是只做轻微抖动。
                  </p>
                </div>
              </div>

              <div className="relative mt-10 border-t border-white/12 pt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/40">Visual Rule</p>
                <p className="mt-3 text-xs leading-6 text-white/62">
                  地理轮廓仍然使用本地静态数据渲染为透明玻璃态图形，不依赖客户端请求，因此不会影响 Love 面切换时的确定性。
                </p>
              </div>
            </motion.aside>
          </div>
        </motion.div>
      </section>
    </>
  );
};
