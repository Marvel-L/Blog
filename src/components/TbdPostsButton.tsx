import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getInitialPosts } from '@/services/posts';
import type { PostMetadata } from '@/types';
import { preloadPage } from '@/utils/preload';

interface TbdPostsButtonProps {
  posts?: PostMetadata[];
}

type AlertLevel = 'quiet' | 'low' | 'medium' | 'high';

const resolveAlertLevel = (count: number): AlertLevel => {
  if (count >= 5) {
    return 'high';
  }
  if (count >= 3) {
    return 'medium';
  }
  if (count >= 1) {
    return 'low';
  }
  return 'quiet';
};

const ALERT_LEVEL_CLASS: Record<AlertLevel, string> = {
  quiet:
    'border-red-200 bg-red-50/60 text-red-300 hover:border-red-300 hover:bg-red-100 dark:border-red-950/60 dark:bg-red-950/20 dark:text-red-900 dark:hover:border-red-900 dark:hover:bg-red-950/30',
  low: 'border-red-300 bg-red-50 text-red-500 hover:border-red-400 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400 dark:hover:border-red-800 dark:hover:bg-red-950/40',
  medium:
    'border-red-400 bg-red-100 text-red-600 shadow-[0_0_0_1px_rgba(220,38,38,0.08)] hover:border-red-500 hover:bg-red-200 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:border-red-700 dark:hover:bg-red-950/50',
  high: 'border-red-600 bg-red-600 text-white shadow-[0_10px_24px_rgba(220,38,38,0.22)] hover:border-red-700 hover:bg-red-700 dark:border-red-500 dark:bg-red-500 dark:text-white dark:hover:border-red-400 dark:hover:bg-red-400',
};

export const TbdPostsButton: React.FC<TbdPostsButtonProps> = ({ posts = getInitialPosts() }) => {
  const tbdCount = useMemo(() => posts.filter((post) => post.tbd === true).length, [posts]);
  const alertLevel = resolveAlertLevel(tbdCount);

  return (
    <Link
      to="/tbd"
      onMouseEnter={() => preloadPage('/tbd')}
      data-alert-level={alertLevel}
      className={`group relative inline-flex h-11 min-w-11 items-center justify-center rounded-icon border px-2 transition-colors active:scale-[0.98] ${ALERT_LEVEL_CLASS[alertLevel]}`}
      aria-label={`查看待补完文章页，当前 ${tbdCount} 篇`}
      title={`待补完文章 ${tbdCount} 篇`}
    >
      <span className="text-sm font-black tracking-[-0.18em] leading-none" aria-hidden="true">
        !!
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-control border border-zinc-700 bg-black px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
        待补完 {tbdCount}
      </span>
    </Link>
  );
};
