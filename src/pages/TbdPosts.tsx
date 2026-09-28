import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { ContentStatus } from '@/components/ContentStatus';
import { Pagination } from '@/components/Pagination';
import { Seo, buildSiteSchemas } from '@/components/Seo';
import { getInitialPosts } from '@/services/posts';
import type { PostMetadata } from '@/types';
import { formatDate } from '@/utils/date';
import { getDateTimestamp } from '@/utils/date';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { siteConfig } from '@config/site.config';

const POSTS_PER_PAGE = 6;

type AgeLevel = 'fresh' | 'aging' | 'old' | 'overdue';

const resolveAgeLevel = (post: PostMetadata): AgeLevel => {
  const ageDays = post.tbdAgeDays ?? 0;

  if (ageDays >= 180) {
    return 'overdue';
  }
  if (ageDays >= 90) {
    return 'old';
  }
  if (ageDays >= 30) {
    return 'aging';
  }
  return 'fresh';
};

const AGE_LEVEL_CLASS: Record<AgeLevel, string> = {
  fresh:
    'border-red-200 shadow-[inset_0_0_0_1px_rgba(254,202,202,0.9)] dark:border-red-950/70 dark:shadow-[inset_0_0_0_1px_rgba(127,29,29,0.45)]',
  aging:
    'border-red-300 shadow-[inset_0_0_0_2px_rgba(252,165,165,0.75),0_10px_24px_rgba(239,68,68,0.08)] dark:border-red-900 dark:shadow-[inset_0_0_0_2px_rgba(153,27,27,0.45),0_10px_24px_rgba(127,29,29,0.18)]',
  old: 'border-red-400 shadow-[inset_0_0_0_2px_rgba(248,113,113,0.85),0_14px_28px_rgba(220,38,38,0.14)] dark:border-red-800 dark:shadow-[inset_0_0_0_2px_rgba(185,28,28,0.55),0_14px_28px_rgba(127,29,29,0.26)]',
  overdue:
    'border-red-600 shadow-[inset_0_0_0_3px_rgba(220,38,38,0.9),0_18px_34px_rgba(220,38,38,0.18)] dark:border-red-500 dark:shadow-[inset_0_0_0_3px_rgba(239,68,68,0.75),0_18px_34px_rgba(127,29,29,0.32)]',
};

const AGE_LEVEL_LABEL: Record<AgeLevel, string> = {
  fresh: '刚进入待补完',
  aging: '提醒升温',
  old: '提醒明显',
  overdue: '优先补完',
};

const parsePageParam = (value: string | null) => {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
};

interface TbdPostsPageProps {
  posts?: PostMetadata[];
}

export const TbdPosts: React.FC<TbdPostsPageProps> = ({ posts = getInitialPosts() }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageFromUrl = parsePageParam(searchParams.get('page'));
  const [currentPage, setCurrentPage] = useState(1);

  const tbdPosts = useMemo(
    () =>
      posts
        .filter((post) => post.tbd === true)
        .slice()
        .sort((left, right) => {
          const ageDiff = (right.tbdAgeDays ?? 0) - (left.tbdAgeDays ?? 0);
          if (ageDiff !== 0) {
            return ageDiff;
          }
          return getDateTimestamp(left.date) - getDateTimestamp(right.date);
        }),
    [posts],
  );

  const totalPages = Math.max(1, Math.ceil(tbdPosts.length / POSTS_PER_PAGE));

  useEffect(() => {
    const nextPage = Math.min(pageFromUrl, totalPages);
    setCurrentPage(nextPage);

    if (nextPage !== pageFromUrl) {
      setSearchParams(
        (previous) => {
          const nextParams = new URLSearchParams(previous);
          if (nextPage <= 1) {
            nextParams.delete('page');
          } else {
            nextParams.set('page', String(nextPage));
          }
          return nextParams;
        },
        { replace: true },
      );
    }
  }, [pageFromUrl, setSearchParams, totalPages]);

  const currentPosts = useMemo(() => {
    const start = (currentPage - 1) * POSTS_PER_PAGE;
    return tbdPosts.slice(start, start + POSTS_PER_PAGE);
  }, [currentPage, tbdPosts]);

  const handlePageChange = (nextPage: number) => {
    const safePage = Math.min(Math.max(1, nextPage), totalPages);
    setCurrentPage(safePage);
    setSearchParams(
      (previous) => {
        const nextParams = new URLSearchParams(previous);
        if (safePage <= 1) {
          nextParams.delete('page');
        } else {
          nextParams.set('page', String(safePage));
        }
        return nextParams;
      },
      { replace: false },
    );
    window.requestAnimationFrame(() => {
      const panel = document.getElementById('tbd-posts-panel');
      panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      panel?.focus({ preventScroll: true });
    });
  };

  const pageDescription =
    tbdPosts.length > 0
      ? `这里汇总了 ${tbdPosts.length} 篇尚未写完的文章，并按创建时间给出不同强度的红色提醒。`
      : '这里会展示 frontmatter 中配置了 tbd: true 的待补完文章。';
  const structuredData = [
    ...buildSiteSchemas(pageDescription),
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `待补完文章 - ${siteConfig.title}`,
      description: pageDescription,
      url: absoluteSiteUrl('/tbd', siteConfig.url),
      inLanguage: 'zh-CN',
    },
  ];

  return (
    <div className="pb-8 md:pb-14">
      <Seo title="待补完文章" description={pageDescription} structuredData={structuredData} />

      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-zinc-200 pb-5 dark:border-zinc-800 md:pb-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-500 dark:text-red-400">Pending</p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-4xl">待补完文章</h1>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{tbdPosts.length} 篇文章等待补完</p>
      </header>

      <section className="mt-7 md:mt-9">
        <div className="rounded-surface border border-red-200 bg-[linear-gradient(135deg,rgba(254,242,242,0.9),rgba(255,255,255,0.96))] p-5 dark:border-red-950/60 dark:bg-[linear-gradient(135deg,rgba(69,10,10,0.36),rgba(9,9,11,0.96))]">
          <div className="flex flex-wrap items-start gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/70 dark:text-red-300">
              <AlertTriangle size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">红框越重，说明这篇文章挂起得越久。</p>
              <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                强度基于文章的创建时间计算；创建越早、拖得越久，提醒越明显。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="tbd-posts-panel" className="mt-7 md:mt-9" tabIndex={-1}>
        {tbdPosts.length === 0 ? (
          <ContentStatus
            title="当前没有待补完文章"
            description="后续只要在文章 frontmatter 中写入 tbd: true，这里就会自动显示。"
          />
        ) : (
          <div className="space-y-4">
            {currentPosts.map((post) => {
              const ageLevel = resolveAgeLevel(post);
              const ageDays = post.tbdAgeDays ?? 0;

              return (
                <Link
                  key={post.id}
                  to={`/post/${post.id}`}
                  data-age-level={ageLevel}
                  className={`block rounded-surface border bg-white p-5 transition-colors hover:bg-red-50/40 dark:bg-zinc-950 dark:hover:bg-red-950/10 ${AGE_LEVEL_CLASS[ageLevel]}`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                    <span className="rounded-full border border-red-300 bg-red-50 px-2.5 py-1 font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                      {AGE_LEVEL_LABEL[ageLevel]}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400">{post.category}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      创建于 {formatDate(post.date, 'zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{post.title}</h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300">
                      <Clock3 size={13} aria-hidden="true" />
                      已延期 {ageDays} 天
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{post.excerpt}</p>
                </Link>
              );
            })}

            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
          </div>
        )}
      </section>
    </div>
  );
};
