import React, { useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getInitialPosts } from '@/services/posts';
import type { PostMetadata } from '@/types';
import { formatDate } from '@/utils/date';
import { ContentStatus } from './ContentStatus';
import { SlideModal } from './SlideModal';

interface TbdPostsButtonProps {
  posts?: PostMetadata[];
}

export const TbdPostsButton: React.FC<TbdPostsButtonProps> = ({ posts = getInitialPosts() }) => {
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const tbdPosts = useMemo(() => posts.filter((post) => post.tbd === true), [posts]);
  const countLabel = `${tbdPosts.length} 篇`;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group relative inline-flex h-11 w-11 items-center justify-center rounded-icon border border-zinc-300 bg-zinc-100 text-ink transition-colors hover:border-zinc-500 hover:bg-zinc-200 active:bg-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
        aria-label={`查看待补完文章，当前 ${countLabel}`}
      >
        <span className="text-base font-black leading-none" aria-hidden="true">
          !
        </span>
        <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-control border border-zinc-700 bg-black px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
          待补完
        </span>
      </button>

      <SlideModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialFocusRef={closeButtonRef}
        ariaLabelledby={titleId}
        ariaDescribedby={descriptionId}
        className="sm:max-w-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <div className="min-w-0">
            <h3 id={titleId} className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              待补完文章
            </h3>
            <p id={descriptionId} className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              展示 frontmatter 中配置了 `tbd: true` 的文章，当前 {countLabel}。
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setIsOpen(false)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-icon border border-transparent text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 active:scale-[0.98] dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="关闭待补完文章弹窗"
          >
            <span className="text-lg leading-none" aria-hidden="true">
              ×
            </span>
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {tbdPosts.length === 0 ? (
            <ContentStatus
              title="当前没有待补完文章"
              description="后续只要在文章 frontmatter 中写入 tbd: true，这里就会自动显示。"
              className="border-x-0 border-y-0 px-0 py-10"
            />
          ) : (
            <div className="space-y-3">
              {tbdPosts.map((post) => (
                <Link
                  key={post.id}
                  to={`/post/${post.id}`}
                  onClick={() => setIsOpen(false)}
                  className="block rounded-surface border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-200">{post.category}</span>
                    <span>{formatDate(post.date, 'zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-300">
                      待补完
                    </span>
                  </div>
                  <h4 className="mt-2 text-base font-bold text-zinc-900 dark:text-zinc-100">{post.title}</h4>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    {post.excerpt}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </SlideModal>
    </>
  );
};
