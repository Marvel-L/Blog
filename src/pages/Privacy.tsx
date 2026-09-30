import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { LockKeyhole } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Seo } from '@/components/Seo';
import { PrivacyPasswordModal } from '@/components/PrivacyPasswordModal';
import { ProgressiveImage } from '@/components/ProgressiveImage';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { unlockPrivacyPosts } from '@/services/privacyPosts';
import type { PrivacyPost } from '@/types';
import { remarkCommonPlugins } from '@/utils/markdownPlugins';
import {
  clearPrivacyAccess,
  grantPrivacyAccess,
  readPrivacyAccess,
  readPrivacySessionPassword,
} from '@/utils/privacyAccess';

const formatDateText = (value?: string) => {
  if (!value) {
    return '';
  }

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
};

export const Privacy: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const [hasAccess, setHasAccess] = useState(false);
  const [posts, setPosts] = useState<PrivacyPost[]>([]);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

  const activePost = useMemo(
    () => posts.find((post) => post.id === activePostId) ?? posts[0] ?? null,
    [activePostId, posts],
  );

  const markdownComponents = useMemo(
    () => ({
      img: ({ src, alt, node: _node, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { node?: unknown }) => (
        <span className="my-5 block overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.03] p-2">
          <ProgressiveImage
            {...props}
            src={src}
            alt={alt || ''}
            loading="lazy"
            className="h-auto w-full rounded-[14px]"
          />
        </span>
      ),
    }),
    [],
  );

  const handleUnlock = useCallback(async (password: string) => {
    const unlockedPosts = await unlockPrivacyPosts(password);
    grantPrivacyAccess(password);
    setPosts(unlockedPosts);
    setActivePostId((current) => current ?? unlockedPosts[0]?.id ?? null);
    setHasAccess(true);
    setIsPasswordDialogOpen(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      if (!readPrivacyAccess()) {
        return;
      }

      const password = readPrivacySessionPassword();
      if (!password) {
        clearPrivacyAccess();
        return;
      }

      try {
        const unlockedPosts = await unlockPrivacyPosts(password);
        if (cancelled) {
          return;
        }
        setPosts(unlockedPosts);
        setActivePostId(unlockedPosts[0]?.id ?? null);
        setHasAccess(true);
      } catch {
        if (cancelled) {
          return;
        }
        clearPrivacyAccess();
        setHasAccess(false);
        setPosts([]);
        setActivePostId(null);
      }
    };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const introMotion = shouldReduceMotion
    ? { initial: false, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: 'easeOut' as const } },
      };

  return (
    <div className="relative min-h-[calc(100vh-4.5rem)] overflow-hidden px-0 pb-6 text-zinc-100 sm:pb-8">
      <Seo title="隐私页" description="D-blog 的隐私页，仅对通过口令验证的访问者开放。" noindex />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_18%)]"
      />

      <motion.section
        aria-label="隐私页面"
        className="mx-auto max-w-7xl"
        initial={introMotion.initial}
        animate={introMotion.animate}
      >
        <h1 className="sr-only">隐私页</h1>

        {!hasAccess ? (
          <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-3 sm:px-6">
            <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-3xl sm:p-6">
              <button
                type="button"
                onClick={() => setIsPasswordDialogOpen(true)}
                className="flex min-h-28 w-full items-center justify-center rounded-[22px] border border-white/10 bg-black/40 text-white transition-colors hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
              >
                <span className="inline-flex items-center gap-3 text-sm font-semibold tracking-[0.28em] uppercase">
                  <LockKeyhole size={16} aria-hidden="true" />
                  输入密码
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[calc(100vh-8rem)] gap-4 px-3 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-3xl">
              {posts.length > 0 ? (
                <div className="space-y-2">
                  {posts.map((post) => {
                    const isActive = post.id === activePost?.id;
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => setActivePostId(post.id)}
                        className={`w-full rounded-[18px] border px-4 py-3 text-left transition-colors ${
                          isActive
                            ? 'border-white/24 bg-white/[0.12] text-white'
                            : 'border-white/8 bg-transparent text-zinc-300 hover:border-white/14 hover:bg-white/[0.05]'
                        }`}
                      >
                        <p className="text-sm font-semibold">{post.title}</p>
                        <p className="mt-2 text-xs text-zinc-500">{formatDateText(post.updatedAt || post.date)}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-40 items-center justify-center rounded-[18px] border border-dashed border-white/12 bg-black/20 text-sm text-zinc-500">
                  暂无文章
                </div>
              )}
            </aside>

            <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur-3xl">
              {activePost ? (
                <article className="px-5 py-6 sm:px-7 sm:py-8">
                  <header className="border-b border-white/10 pb-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">{activePost.category}</p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                      {activePost.title}
                    </h2>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                      <time dateTime={activePost.updatedAt || activePost.date}>
                        {formatDateText(activePost.updatedAt || activePost.date)}
                      </time>
                      <span>{activePost.readTime}</span>
                    </div>
                  </header>

                  <div className="mt-6 prose prose-invert max-w-none prose-headings:text-white prose-p:text-zinc-200 prose-strong:text-white prose-a:text-zinc-100 prose-code:text-zinc-100 prose-pre:border prose-pre:border-white/10 prose-pre:bg-black/40 prose-blockquote:border-l-white/30 prose-blockquote:text-zinc-300">
                    <ReactMarkdown remarkPlugins={remarkCommonPlugins} components={markdownComponents}>
                      {activePost.content}
                    </ReactMarkdown>
                  </div>
                </article>
              ) : (
                <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center px-5 text-sm text-zinc-500 sm:px-7">
                  暂无文章
                </div>
              )}
            </div>
          </div>
        )}
      </motion.section>

      <PrivacyPasswordModal
        isOpen={isPasswordDialogOpen}
        onClose={() => setIsPasswordDialogOpen(false)}
        onSuccess={handleUnlock}
        title="验证隐私页密码"
        description="输入密码后才能解锁隐私文章。"
      />
    </div>
  );
};
