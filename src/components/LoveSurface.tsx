import React from 'react';
import { Heart, Map as MapIcon } from 'lucide-react';
import { Seo } from './Seo';

export const LoveSurface: React.FC = () => {
  return (
    <>
      <Seo title="Love 面" description="D-blog 的 Love 面：收起原有栏目，只保留更私密的一层入口与氛围。" />
      <section className="relative isolate overflow-hidden rounded-[2rem] border border-rose-200/80 bg-gradient-to-br from-white via-rose-50 to-pink-100 px-5 py-10 shadow-[0_25px_80px_rgba(244,114,182,0.12)] dark:border-rose-900/70 dark:from-zinc-950 dark:via-rose-950/40 dark:to-zinc-950 sm:px-8 sm:py-14 md:px-12 md:py-16">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute -left-12 top-10 h-40 w-40 rounded-full bg-rose-200/60 blur-3xl dark:bg-rose-500/15" />
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-pink-200/60 blur-3xl dark:bg-pink-500/15" />
          <div className="absolute bottom-0 left-1/3 h-44 w-44 rounded-full bg-orange-100/80 blur-3xl dark:bg-orange-300/10" />
        </div>

        <div className="relative mx-auto flex max-w-4xl flex-col gap-10">
          <div className="flex flex-wrap items-center gap-3 text-rose-500 dark:text-rose-300">
            <span className="inline-flex items-center gap-2 rounded-full border border-rose-200/80 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] shadow-sm dark:border-rose-900/80 dark:bg-white/5">
              <Heart size={14} className="fill-current" aria-hidden="true" />
              Love Side
            </span>
            <span className="text-xs tracking-[0.22em] text-rose-400/90 dark:text-rose-200/70">A/B Surface Switch</span>
          </div>

          <div className="grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.8fr)] md:items-end">
            <div>
              <h1 className="max-w-3xl font-serif text-5xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-6xl md:text-7xl">
                Love 面
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-zinc-700 dark:text-zinc-200 sm:text-lg">
                这里暂时收起文章、说说、归档、标签等原有入口，整个站点切换到另一层更轻、更私密的展示面。
              </p>
              <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-500 dark:text-zinc-400">
                目前先保留一个“地域”入口作为占位，后续再接入具体内容。
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-white/70 bg-white/70 p-5 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-rose-400 dark:text-rose-200/80">
                Current Entrance
              </p>
              <button
                type="button"
                aria-label="地域（暂未开放）"
                className="mt-4 inline-flex min-h-12 w-full items-center justify-between rounded-2xl border border-rose-200 bg-transparent px-4 py-3 text-left text-sm font-semibold text-zinc-800 transition-colors hover:bg-rose-50 dark:border-rose-900/70 dark:text-zinc-100 dark:hover:bg-rose-950/30"
              >
                <span>地域</span>
                <MapIcon size={16} aria-hidden="true" className="text-rose-400 dark:text-rose-300" />
              </button>
              <p className="mt-3 text-xs leading-6 text-zinc-500 dark:text-zinc-400">按钮已预留，当前不连接任何页面或动作。</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
