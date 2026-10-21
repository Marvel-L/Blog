/**
 * 节点文章缩略弹层：展示当前节点关联文章，点击跳转正文。
 */
import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { CompactPostCard } from '@/components/CompactPostCard';
import type { RoadNodeConfig } from '@config/road.config';
import { resolveNodeArticles } from '@/services/road';
import { preloadPage } from '@/utils/preload';

interface NodeArticlesModalProps {
  node: RoadNodeConfig | null;
  onClose: () => void;
}

export const NodeArticlesModal: React.FC<NodeArticlesModalProps> = ({ node, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isOpen = Boolean(node);

  useModalOverlay({
    isOpen,
    onClose,
    initialFocusRef: closeButtonRef,
    containerRef: dialogRef,
  });

  if (!node) {
    return null;
  }

  const { articles, tags, categories } = resolveNodeArticles(node);

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-zinc-950/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="road-node-modal-title"
        className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-paper dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 id="road-node-modal-title" className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {node.title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3">
          {tags.length > 0 || categories.length > 0 ? (
            <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="关联标签与分类">
              {categories.map((category) => (
                <li
                  key={`category-${category}`}
                  className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {category}
                </li>
              ))}
              {tags.map((tag) => (
                <li
                  key={`tag-${tag}`}
                  className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                >
                  #{tag}
                </li>
              ))}
            </ul>
          ) : null}
          {articles.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">暂无关联文章</p>
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {articles.map(({ id, post }) =>
                post ? (
                  <li key={id}>
                    <CompactPostCard post={post} />
                  </li>
                ) : (
                  <li key={id}>
                    <Link
                      to={`/post/${id}`}
                      onMouseEnter={() => preloadPage(`/post/${id}`)}
                      className="block rounded-lg border border-dashed border-zinc-300 px-3 py-2.5 text-sm text-zinc-500 dark:border-zinc-700"
                    >
                      未找到：{id}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
