import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Heart, Map as MapIcon, Sparkles } from 'lucide-react';
import { Seo } from './Seo';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export const LoveSurface: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();

  const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.72, ease: 'easeOut' as const };

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
                    ['State', 'Hidden but active'],
                    ['Focus', 'Region Placeholder'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 backdrop-blur-sm">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/46">{label}</p>
                      <p className="mt-2 text-sm font-semibold text-white/86">{value}</p>
                    </div>
                  ))}
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
                  这里只有一个入口被保留下来。它目前不连向任何功能，只作为 Love 面内部的下一层占位。
                </p>
                <button
                  type="button"
                  aria-label="地域（暂未开放）"
                  className="group mt-8 inline-flex min-h-14 w-full items-center justify-between rounded-[1.4rem] border border-white/18 bg-black/20 px-4 py-3 text-left text-sm font-semibold text-white transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5 hover:border-white/28 hover:bg-black/28"
                >
                  <span className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/16 bg-white/10 text-rose-100/90">
                      <MapIcon size={16} aria-hidden="true" />
                    </span>
                    <span>地域</span>
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" className="text-white/70 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>

              <div className="relative mt-10 border-t border-white/12 pt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/40">Surface Note</p>
                <p className="mt-3 text-xs leading-6 text-white/62">
                  当前按钮仅用于展示结构，不触发跳转、弹层或请求。后续可在这里接入更具体的地域内容。
                </p>
              </div>
            </motion.aside>
          </div>
        </motion.div>
      </section>
    </>
  );
};
