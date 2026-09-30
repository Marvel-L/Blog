import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownWideNarrow, ArrowUpWideNarrow, ChevronRight, LockKeyhole } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Link, useSearchParams } from 'react-router-dom';
import { Seo } from '@/components/Seo';
import { PrivacyPasswordModal } from '@/components/PrivacyPasswordModal';
import { ProgressiveImage } from '@/components/ProgressiveImage';
import { SearchField } from '@/components/SearchField';
import { Pagination } from '@/components/Pagination';
import { PostCard } from '@/components/PostCard';
import { WaveFishDivider } from '@/components/effects/WaveFishDivider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { unlockPrivacyPosts } from '@/services/privacyPosts';
import { normalizeSearchText } from '@/services/posts';
import type { PrivacyPost, PostMetadata } from '@/types';
import { remarkCommonPlugins } from '@/utils/markdownPlugins';
import { getDateTimestamp } from '@/utils/date';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { clearSearchQueryParams, setSearchQueryParams } from '@/utils/searchParams';
import { canonicalizeHomeQuery, getHomeQueryState, setHomeQueryParam } from '@/utils/homeQuery';
import {
  clearPrivacyAccess,
  grantPrivacyAccess,
  readPrivacyAccess,
  readPrivacySessionPassword,
} from '@/utils/privacyAccess';
import { siteConfig } from '@config/site.config';

const ShareModal = lazy(() => import('../components/ShareModal').then((m) => ({ default: m.ShareModal })));

const ALL_CATEGORY = '全部';
const POSTS_PER_PAGE = 9;
const HERO_SLOTS = 3;

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

const getCategories = (posts: PrivacyPost[]) => Array.from(new Set(posts.map((post) => post.category)));

const filterPrivacyPosts = (posts: PrivacyPost[], selectedCategory: string, query: string, sortOrder: 'newest' | 'oldest') => {
  const normalizedQuery = normalizeSearchText(query);
  const terms = normalizedQuery.split(' ').filter(Boolean);
  const filtered = posts.filter((post) => {
    if (selectedCategory !== ALL_CATEGORY && post.category !== selectedCategory) {
      return false;
    }

    if (terms.length === 0) {
      return true;
    }

    const searchable = normalizeSearchText(
      [post.title, post.excerpt, post.category, post.tags.join(' '), post.content].join(' '),
    );

    return terms.every((term) => searchable.includes(term));
  });

  return filtered.slice().sort((a, b) => {
    const dateDiff = getDateTimestamp(b.updatedAt || b.date) - getDateTimestamp(a.updatedAt || a.date);
    if (dateDiff !== 0) {
      return sortOrder === 'newest' ? dateDiff : -dateDiff;
    }
    return a.id.localeCompare(b.id, 'zh-CN');
  });
};

const toPostCardData = (post: PrivacyPost): PostMetadata => ({
  id: post.id,
  title: post.title,
  excerpt: post.excerpt,
  date: post.date,
  updatedAt: post.updatedAt,
  tags: post.tags,
  category: post.category,
  filePath: post.filePath,
  readTime: post.readTime,
});

interface FilterBarProps {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
  sortOrder: 'newest' | 'oldest';
  onToggleSort: () => void;
}

const FilterBar: React.FC<FilterBarProps> = ({ categories, selected, onSelect, sortOrder, onToggleSort }) => {
  return (
    <div className="flex items-center justify-between gap-2 border-y border-zinc-200 py-3 sm:gap-3 dark:border-zinc-800">
      <div className="filter-scroll-mask min-w-0 flex-1 overflow-x-auto overscroll-x-contain scroll-smooth no-scrollbar">
        <div className="flex items-center gap-2" role="group" aria-label="隐私文章分类筛选">
          {[ALL_CATEGORY, ...categories].map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => onSelect(category)}
              aria-pressed={selected === category}
              className={`min-h-11 whitespace-nowrap rounded-control border px-3.5 py-2 text-sm font-semibold transition-[background-color,border-color,color,transform,box-shadow] duration-150 active:scale-[.98] ${
                selected === category
                  ? 'border-ink bg-ink text-white shadow-[0_1px_3px_rgba(24,24,27,0.3)] dark:border-white dark:bg-white dark:text-ink dark:shadow-none'
                  : 'border-zinc-300 bg-paper text-zinc-700 shadow-none hover:border-ink hover:bg-zinc-100 hover:text-ink hover:shadow-[0_1px_2px_rgba(24,24,27,0.08)] dark:border-zinc-700 dark:bg-void dark:text-zinc-300 dark:hover:border-white dark:hover:bg-zinc-900 dark:hover:text-white dark:hover:shadow-none'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
      <div
        className="relative isolate grid grid-cols-2 shrink-0 items-center rounded-control border border-zinc-300 bg-paper p-0.5 dark:border-zinc-700 dark:bg-void"
        role="group"
        aria-label="隐私文章排序"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-control bg-ink shadow-[0_1px_3px_rgba(24,24,27,0.3)] transition-transform duration-200 ease-out dark:bg-white dark:shadow-none"
          style={{ transform: sortOrder === 'oldest' ? 'translateX(100%)' : 'translateX(0)' }}
        />
        {[
          { key: 'newest' as const, label: '最新', Icon: ArrowDownWideNarrow },
          { key: 'oldest' as const, label: '最早', Icon: ArrowUpWideNarrow },
        ].map(({ key, label, Icon }) => {
          const active = sortOrder === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (!active) {
                  onToggleSort();
                }
              }}
              aria-pressed={active}
              aria-label={`按${label}优先排序`}
              className={`relative z-10 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control px-3 text-sm font-semibold transition-colors duration-150 active:scale-[.98] ${
                active ? 'text-white dark:text-zinc-950' : 'text-zinc-700 hover:text-ink dark:text-zinc-300 dark:hover:text-white'
              }`}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const PrivacyHero = () => {
  return (
    <div className="relative overflow-hidden px-4 pb-8 pt-5 text-center md:pb-10 md:pt-8">
      <motion.div className="relative">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-400">
          {siteConfig.subtitle}
        </p>
        <div className="relative mb-3">
          <h1 className="text-balance font-serif text-5xl font-bold tracking-tight text-ink [overflow-wrap:anywhere] dark:text-white max-[400px]:text-4xl sm:text-6xl md:text-7xl">
            {siteConfig.title}
          </h1>
        </div>
        <p className="mx-auto max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-300 md:text-base">
          这里完全沿用 Blog 的文章展示结构，但内容只从隐私文章包中读取，不进入公开文章系统。
        </p>
      </motion.div>
    </div>
  );
};

export const Privacy: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFromUrl = searchParams.get('category');
  const queryFromUrl = searchParams.get('q') || '';
  const postFromUrl = searchParams.get('post');
  const homeQueryState = useMemo(() => getHomeQueryState(searchParams), [searchParams]);
  const [hasAccess, setHasAccess] = useState(false);
  const [posts, setPosts] = useState<PrivacyPost[]>([]);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [sharePost, setSharePost] = useState<PrivacyPost | null>(null);

  const categories = useMemo(() => getCategories(posts), [posts]);
  const postMap = useMemo(() => new Map(posts.map((post) => [post.id, post])), [posts]);

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

  const displayedPosts = useMemo(
    () => filterPrivacyPosts(posts, selectedCategory, searchQuery, sortOrder),
    [posts, selectedCategory, searchQuery, sortOrder],
  );

  const heroPost = displayedPosts[0] ?? null;
  const heroSlots = heroPost ? HERO_SLOTS : 0;
  const totalSlots = heroPost ? displayedPosts.length - 1 + heroSlots : displayedPosts.length;
  const totalPages = Math.max(1, Math.ceil(totalSlots / POSTS_PER_PAGE));

  const currentPosts = useMemo(() => {
    const pageStart = (currentPage - 1) * POSTS_PER_PAGE;
    const pageEnd = pageStart + POSTS_PER_PAGE;
    const pagedPosts: PrivacyPost[] = [];
    let consumedSlots = 0;

    for (const post of displayedPosts) {
      const slots = heroPost && post.id === heroPost.id ? heroSlots : 1;
      const nextConsumedSlots = consumedSlots + slots;

      if (nextConsumedSlots <= pageStart) {
        consumedSlots = nextConsumedSlots;
        continue;
      }

      if (consumedSlots >= pageEnd) {
        break;
      }

      pagedPosts.push(post);
      consumedSlots = nextConsumedSlots;
    }

    return pagedPosts;
  }, [currentPage, displayedPosts, heroPost, heroSlots]);

  const featuredPost = heroPost && currentPosts.some((post) => post.id === heroPost.id) ? heroPost : null;
  const remainingPosts = currentPosts.filter((post) => post.id !== heroPost?.id);
  const activePost = postFromUrl && postMap.has(postFromUrl) ? postMap.get(postFromUrl)! : posts[0] ?? null;

  const stats = useMemo(
    () => ({
      totalPosts: posts.length,
      totalCategories: new Set(posts.map((post) => post.category)).size,
      totalTags: new Set(posts.flatMap((post) => post.tags)).size,
      latestUpdatedAt: posts.reduce<string | null>((latest, post) => {
        const value = post.updatedAt || post.date;
        if (!latest || value > latest) {
          return value;
        }
        return latest;
      }, null),
    }),
    [posts],
  );

  const syncSelectedPost = useCallback(
    (postId: string, replace = false) => {
      setSearchParams(
        (previous) => {
          const nextParams = new URLSearchParams(previous);
          nextParams.set('post', postId);
          return nextParams;
        },
        { replace },
      );
    },
    [setSearchParams],
  );

  const handleUnlock = useCallback(
    async (password: string) => {
      const unlockedPosts = await unlockPrivacyPosts(password);
      grantPrivacyAccess(password);
      setPosts(unlockedPosts);
      setHasAccess(true);
      setIsPasswordDialogOpen(false);
      if (unlockedPosts[0]) {
        syncSelectedPost(unlockedPosts[0].id, true);
      }
    },
    [syncSelectedPost],
  );

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
        setHasAccess(true);
      } catch {
        if (cancelled) {
          return;
        }
        clearPrivacyAccess();
        setHasAccess(false);
        setPosts([]);
      }
    };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canonicalParams = canonicalizeHomeQuery(searchParams);
    if (canonicalParams.toString() !== searchParams.toString()) {
      setSearchParams(canonicalParams, { replace: true });
    }

    setSortOrder(homeQueryState.sortOrder);
    setCurrentPage(homeQueryState.page);
  }, [homeQueryState, searchParams, setSearchParams]);

  useEffect(() => {
    if (!categoryFromUrl) {
      setSelectedCategory(ALL_CATEGORY);
      return;
    }

    if (categories.includes(categoryFromUrl)) {
      setSelectedCategory(categoryFromUrl);
      return;
    }

    if (categories.length > 0) {
      setSearchParams(
        (previous) => {
          const nextParams = new URLSearchParams(previous);
          nextParams.delete('category');
          nextParams.delete('page');
          return nextParams;
        },
        { replace: true },
      );
      setSelectedCategory(ALL_CATEGORY);
    }
  }, [categories, categoryFromUrl, setSearchParams]);

  useEffect(() => {
    setSearchQuery(queryFromUrl);
  }, [queryFromUrl]);

  useEffect(() => {
    if (!hasAccess || posts.length === 0) {
      return;
    }

    if (postFromUrl && postMap.has(postFromUrl)) {
      return;
    }

    syncSelectedPost(posts[0].id, true);
  }, [hasAccess, postFromUrl, postMap, posts, syncSelectedPost]);

  useEffect(() => {
    if (currentPage <= totalPages) {
      return;
    }

    setCurrentPage(totalPages);
    setSearchParams((previous) => setHomeQueryParam(previous, 'page', totalPages), { replace: true });
  }, [currentPage, setSearchParams, totalPages]);

  const handleSelectCategory = (category: string) => {
    setSelectedCategory(category);
    setCurrentPage(1);
    setSearchParams(
      (previous) => {
        const nextParams = new URLSearchParams(previous);

        if (category === ALL_CATEGORY) {
          nextParams.delete('category');
        } else {
          nextParams.set('category', category);
        }
        nextParams.delete('page');

        return nextParams;
      },
      { replace: true },
    );
  };

  const handleToggleSort = () => {
    const nextSortOrder = sortOrder === 'newest' ? 'oldest' : 'newest';
    setSortOrder(nextSortOrder);
    setCurrentPage(1);
    setSearchParams(
      (previous) => {
        const nextParams = setHomeQueryParam(previous, 'sort', nextSortOrder);
        nextParams.delete('page');
        return nextParams;
      },
      { replace: false },
    );
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    setSearchParams((previous) => setSearchQueryParams(previous, query, ['page']), { replace: true });
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setCurrentPage(1);
    setSearchParams((previous) => clearSearchQueryParams(previous, ['page']), { replace: true });
  };

  const paginate = (pageNumber: number) => {
    const nextPage = Math.min(Math.max(1, pageNumber), totalPages);
    setCurrentPage(nextPage);
    setSearchParams((previous) => setHomeQueryParam(previous, 'page', nextPage), { replace: false });
    window.requestAnimationFrame(() => {
      const postsPanel = document.getElementById('posts-panel');
      postsPanel?.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth', block: 'start' });
      postsPanel?.focus({ preventScroll: true });
    });
  };

  const buildPrivacyUrl = useCallback(
    (patch: Record<string, string | null>) => {
      const nextParams = new URLSearchParams(searchParams);
      Object.entries(patch).forEach(([key, value]) => {
        if (!value) {
          nextParams.delete(key);
        } else {
          nextParams.set(key, value);
        }
      });
      const query = nextParams.toString();
      return query ? `/privacy?${query}` : '/privacy';
    },
    [searchParams],
  );

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

      <motion.div initial={introMotion.initial} animate={introMotion.animate}>
        {!hasAccess ? (
          <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-7xl items-center justify-center px-3 sm:px-6">
            <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-3xl sm:p-6">
              <h1 className="sr-only">隐私页</h1>
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
          <div className="pb-8 md:pb-12">
            <PrivacyHero />
            <WaveFishDivider variant="wave" className="mx-auto mb-2 max-w-3xl px-4 md:mb-4 md:px-0" />

            <div className="space-y-6 px-4 md:space-y-8 md:px-0">
              <section id="privacy-posts" className="mx-auto max-w-7xl">
                <FilterBar
                  categories={categories}
                  selected={selectedCategory}
                  onSelect={handleSelectCategory}
                  sortOrder={sortOrder}
                  onToggleSort={handleToggleSort}
                />

                <div className="mx-auto mt-6 max-w-2xl">
                  <SearchField
                    value={searchQuery}
                    onValueChange={handleSearchChange}
                    onClear={handleClearSearch}
                    placeholder="搜索隐私文章标题、摘要、分类、标签与正文..."
                    aria-label="搜索隐私文章"
                  />
                </div>

                <div id="posts-panel" className="mt-6 space-y-7" aria-live="polite" tabIndex={-1}>
                  {searchQuery.trim() && displayedPosts.length > 0 ? (
                    <div className="flex items-center justify-end px-4 md:px-0">
                      <Link
                        to={buildPrivacyUrl({ post: null })}
                        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-zinc-600 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:decoration-zinc-700 dark:hover:text-white"
                      >
                        查看当前筛选结果 <ChevronRight size={14} aria-hidden="true" />
                      </Link>
                    </div>
                  ) : null}

                  <div id="posts-grid" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {featuredPost ? (
                      <PostCard
                        key={featuredPost.id}
                        post={toPostCardData(featuredPost)}
                        featured
                        onShare={() => setSharePost(featuredPost)}
                        getPostHref={() => buildPrivacyUrl({ post: featuredPost.id })}
                        getTagHref={(tag) => buildPrivacyUrl({ q: tag, page: null })}
                        onNavigatePost={() => {
                          window.requestAnimationFrame(() => {
                            document.getElementById('privacy-article')?.scrollIntoView({
                              behavior: shouldReduceMotion ? 'auto' : 'smooth',
                              block: 'start',
                            });
                          });
                        }}
                      />
                    ) : null}
                    {remainingPosts.length > 0 ? (
                      remainingPosts.map((post) => (
                        <PostCard
                          key={post.id}
                          post={toPostCardData(post)}
                          onShare={() => setSharePost(post)}
                          getPostHref={() => buildPrivacyUrl({ post: post.id })}
                          getTagHref={(tag) => buildPrivacyUrl({ q: tag, page: null })}
                          onNavigatePost={() => {
                            window.requestAnimationFrame(() => {
                              document.getElementById('privacy-article')?.scrollIntoView({
                                behavior: shouldReduceMotion ? 'auto' : 'smooth',
                                block: 'start',
                              });
                            });
                          }}
                        />
                      ))
                    ) : !featuredPost ? (
                      <div className="col-span-full border-y border-zinc-200 py-14 text-center dark:border-zinc-800">
                        <p className="text-base text-zinc-500 dark:text-zinc-400">
                          {searchQuery.trim() ? '未找到匹配的隐私文章' : '暂无隐私文章'}
                        </p>
                        {searchQuery.trim() ? (
                          <button
                            type="button"
                            onClick={handleClearSearch}
                            className="mt-3 text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-300"
                            aria-label="清除隐私文章搜索条件"
                          >
                            清除搜索条件
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={paginate} />
                </div>
              </section>

              <section id="privacy-stats" className="mx-auto max-w-7xl scroll-mt-28">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {[
                    { label: '文章数', value: String(stats.totalPosts) },
                    { label: '分类数', value: String(stats.totalCategories) },
                    { label: '标签数', value: String(stats.totalTags) },
                    { label: '最近更新', value: stats.latestUpdatedAt ? formatDateText(stats.latestUpdatedAt) : '—' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-surface border border-white/10 bg-white/[0.04] px-4 py-5 backdrop-blur-2xl"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{item.label}</p>
                      <p className="mt-3 text-2xl font-semibold text-white">{item.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section id="privacy-article" className="mx-auto max-w-7xl scroll-mt-28">
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
                          <button
                            type="button"
                            onClick={() => setSharePost(activePost)}
                            className="inline-flex min-h-11 items-center rounded-control border border-white/12 px-3 text-sm font-medium text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                          >
                            分享
                          </button>
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
              </section>
            </div>

            <WaveFishDivider variant="fish" className="mx-auto mt-10 max-w-3xl px-4 md:mt-14 md:px-0 lg:hidden" />
          </div>
        )}
      </motion.div>

      <PrivacyPasswordModal
        isOpen={isPasswordDialogOpen}
        onClose={() => setIsPasswordDialogOpen(false)}
        onSuccess={handleUnlock}
        title="验证隐私页密码"
        description="输入密码后才能解锁隐私文章。"
      />

      {sharePost ? (
        <Suspense fallback={null}>
          <ShareModal
            isOpen
            onClose={() => setSharePost(null)}
            title={sharePost.title}
            excerpt={sharePost.excerpt}
            url={absoluteSiteUrl(buildPrivacyUrl({ post: sharePost.id }), window.location.origin)}
          />
        </Suspense>
      ) : null}
    </div>
  );
};
