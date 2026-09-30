import React from 'react';
import { Calendar, Clock, Pin } from 'lucide-react';
import type { PrivacyPost } from '@/types';

interface PrivacyPostCardProps {
  post: PrivacyPost;
  featured?: boolean;
  active?: boolean;
  onOpen: (post: PrivacyPost) => void;
}

const PrivacyPostCardTags: React.FC<{ tags: string[] }> = ({ tags }) =>
  tags.length > 0 ? (
    <div className="flex flex-wrap gap-1.5">
      {tags.slice(0, 3).map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100/70 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300"
        >
          {tag}
        </span>
      ))}
    </div>
  ) : null;

const PrivacyPostCardImpl: React.FC<PrivacyPostCardProps> = ({ post, featured = false, active = false, onOpen }) => {
  const activeClasses = active
    ? 'border-zinc-500 dark:border-zinc-400 ring-1 ring-zinc-400/60 dark:ring-zinc-500/60'
    : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600';

  if (featured) {
    return (
      <article className="col-span-full w-full">
        <button
          type="button"
          onClick={() => onOpen(post)}
          aria-label={`打开隐私文章：${post.title}`}
          className={`relative flex w-full flex-col overflow-hidden rounded-surface border bg-white text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:bg-zinc-900 md:grid md:grid-cols-5 ${activeClasses}`}
        >
          <div className="flex flex-col p-4 md:col-span-3 md:min-h-80 md:justify-between md:p-7">
            <div className="mb-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400 md:mb-4">
              <span>{post.category}</span>
              <span aria-hidden="true">/</span>
              <span>精选</span>
              {active ? (
                <span className="ml-auto flex items-center gap-1 normal-case tracking-normal text-zinc-600 dark:text-zinc-300">
                  <Pin size={11} />
                  当前阅读
                </span>
              ) : null}
            </div>
            <div>
              <h2 className="mb-2 text-xl font-bold leading-tight text-ink dark:text-white md:mb-3 md:text-3xl">
                {post.title}
              </h2>
              <p className="mb-3 text-sm leading-5 text-zinc-600 dark:text-zinc-300 md:mb-4 md:line-clamp-4 md:leading-6">
                {post.excerpt}
              </p>
              <PrivacyPostCardTags tags={post.tags} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 md:pt-4">
              <span className="flex items-center gap-1.5">
                <Calendar size={12} />
                {post.date}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={12} />
                {post.readTime}
              </span>
            </div>
          </div>
          <div className="flex items-center border-t border-zinc-200 bg-zinc-50/70 px-4 py-4 text-sm font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-300 md:col-span-2 md:border-l md:border-t-0 md:px-7">
            {active ? '正在阅读这篇私密文章' : '点击查看正文'}
          </div>
        </button>
      </article>
    );
  }

  return (
    <article className="flex h-full min-w-0 flex-col">
      <button
        type="button"
        onClick={() => onOpen(post)}
        aria-label={`打开隐私文章：${post.title}`}
        className={`relative flex h-full flex-col overflow-hidden rounded-surface border bg-white p-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:bg-zinc-900 md:p-5 ${activeClasses}`}
      >
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 md:mb-2">
          <span>{post.category}</span>
          {active ? (
            <span className="ml-auto flex items-center gap-1 normal-case tracking-normal">
              <Pin size={10} />
              当前
            </span>
          ) : null}
        </div>
        <h3 className="mb-1.5 min-h-11 text-base font-bold leading-snug text-ink dark:text-zinc-100 md:mb-2 md:line-clamp-2 md:text-lg">
          {post.title}
        </h3>
        <p className="mb-2 text-sm leading-5 text-zinc-600 dark:text-zinc-300 md:mb-3 md:line-clamp-2">{post.excerpt}</p>
        <PrivacyPostCardTags tags={post.tags} />
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-200 pt-2.5 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 md:mt-4 md:pt-3">
          <span className="flex items-center gap-1">
            <Calendar size={11} />
            {post.date}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {post.readTime}
          </span>
        </div>
      </button>
    </article>
  );
};

export const PrivacyPostCard = React.memo(PrivacyPostCardImpl);
