/**
 * 文章列表：横向文章条目、站内搜索与分类/排序/分页筛选。
 */

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownWideNarrow, ArrowUpWideNarrow, ChevronRight } from 'lucide-react';
import { SearchField } from '@/components/SearchField';
import type { PostMetadata } from '../types';
import { siteConfig } from '@config/site.config';
import { Seo } from '../components/Seo';
import { PostCard } from '@/components/PostCard';
import { usePostSearch } from '@/hooks/usePostSearch';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ContentStatus, LoadingStatus } from '@/components/ContentStatus';
import { sortPosts } from '@/utils/postSorting';
import { useArticlePosts } from '@/hooks/useArticlePosts';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { Pagination } from '@/components/Pagination';
import { WaveFishDivider } from '@/components/effects/WaveFishDivider';
import { canonicalizeHomeQuery, getHomeQueryState, setHomeQueryParam } from '@/utils/homeQuery';
import { clearSearchQueryParams, setSearchQueryParams } from '@/utils/searchParams';

const ShareModal = lazy(() => import('../components/ShareModal').then((m) => ({ default: m.ShareModal })));

const ALL_CATEGORY = '全部';
// 一篇文章占一行；固定分页大小保证 SSR 与客户端首帧一致。
const POSTS_PER_PAGE = 9;

const SkeletonBlock: React.FC<{ className?: string; shouldReduceMotion: boolean }> = ({
  className,
  shouldReduceMotion,
}) => (
  <div className={`bg-zinc-200 dark:bg-zinc-800 ${shouldReduceMotion ? '' : 'animate-pulse'} ${className || ''}`} />
);

const PostCardSkeleton: React.FC<{ shouldReduceMotion: boolean }> = ({ shouldReduceMotion }) => (
  <div
    aria-hidden="true"
    className="overflow-hidden rounded-surface border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
  >
    <div className="space-y-2.5 p-5 md:space-y-3 md:p-6">
      <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="h-3 w-20" />
      <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="h-4 w-4/5" />
      <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="h-3 w-full" />
      <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="h-3 w-2/3" />
      <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="h-3 w-28" />
      </div>
    </div>
  </div>
);

const LoadingList: React.FC<{ label: string }> = ({ label }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="space-y-3" aria-busy="true">
      <LoadingStatus label={label} />
      {Array.from({ length: POSTS_PER_PAGE }).map((_, index) => (
        <PostCardSkeleton key={index} shouldReduceMotion={shouldReduceMotion} />
      ))}
    </div>
  );
};

const filterAndSortPosts = (posts: PostMetadata[], selectedCategory: string, sortOrder: 'newest' | 'oldest') => {
  const filteredPosts =
    selectedCategory === ALL_CATEGORY ? posts : posts.filter((post) => post.category === selectedCategory);

  return sortPosts(filteredPosts, sortOrder);
};

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
        <div className="flex items-center gap-2" role="group" aria-label="文章分类筛选">
          {[ALL_CATEGORY, ...categories].map((category) => (
            <button
              key={category}
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
        aria-label="文章排序"
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
                if (!active) onToggleSort();
              }}
              aria-pressed={active}
              aria-label={`按${label}优先排序`}
              className={`relative z-10 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control px-3 text-sm font-semibold transition-colors duration-150 active:scale-[.98] ${active ? 'text-white dark:text-zinc-950' : 'text-zinc-700 hover:text-ink dark:text-zinc-300 dark:hover:text-white'}`}
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

export const Articles = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFromUrl = searchParams.get('category');
  const queryFromUrl = searchParams.get('q') || '';
  // 用户最近一次通过输入框编辑的查询值：用于区分「URL 更新还在 startTransition
  // 延迟中」与「URL 确实来自导航（直访 ?q= / 浏览器前进后退）」。见下方同步 effect。
  const lastEditedQueryRef = useRef<string | null>(null);
  const homeQueryState = useMemo(() => getHomeQueryState(searchParams), [searchParams]);
  const { allPosts, categories, loading, loadError, reload } = useArticlePosts();
  // 分类/排序/页码一律以默认值作为初始 state（SSG 预渲染的是无参首页，
  // 首帧用默认值可保证带参直访时客户端首帧与服务端 HTML 一致，水合无冲突）；
  // URL 中的真实状态由下方 effect 在水合后同步（与 ?q= 搜索框的处理一致）。
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [sharePost, setSharePost] = useState<PostMetadata | null>(null);
  const { searchQuery, isSearching, searchError, results, handleSearch, setSearchQuery, clearSearch, hasSearchQuery } =
    // 不把 URL 的 ?q= 作为 useState 初始值（与 Search 页一致）：SSG 预渲染的是
    // 无 q 的默认界面，首帧用空查询渲染可保证带 q 直访时客户端首帧与服务端
    // HTML 一致（水合无冲突）；下方 effect 在水合后把 queryFromUrl 同步进搜索。
    usePostSearch({
      emptyResults: allPosts,
    });

  const shouldReduceMotion = useReducedMotion();

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
    // 单向同步（URL → 输入框），且仅在「URL 值不是用户最近编辑产生」时生效：
    // 生产路由启用 v7_startTransition 后 setSearchParams 的提交是异步延迟的，
    // 用户击键期间 queryFromUrl 仍是旧值 —— 若此时按 queryFromUrl 回写
    // setSearchQuery，会把刚输入的内容回退掉（输入闪变/丢字），并让 usePostSearch
    // 的空查询分支把结果重置回全量列表。lastEditedQueryRef 与 URL 一致说明
    // 本次编辑已落地（或本来就是导航带来的变化），此时才允许 URL → state 同步。
    if (lastEditedQueryRef.current !== null && lastEditedQueryRef.current !== queryFromUrl) {
      return;
    }
    if (queryFromUrl !== searchQuery) {
      setSearchQuery(queryFromUrl);
    }
    // URL 已追平最近编辑值：清空守卫，恢复 URL 驱动同步（后退/前进/粘贴链接）。
    if (lastEditedQueryRef.current !== null && lastEditedQueryRef.current === queryFromUrl) {
      lastEditedQueryRef.current = null;
    }
  }, [queryFromUrl, searchQuery, setSearchQuery]);

  const displayedPosts = useMemo(
    () => filterAndSortPosts(results, selectedCategory, sortOrder),
    [results, selectedCategory, sortOrder],
  );
  const totalPages = Math.max(1, Math.ceil(displayedPosts.length / POSTS_PER_PAGE));

  useEffect(() => {
    const categoryStateFromUrl =
      categoryFromUrl && categories.includes(categoryFromUrl) ? categoryFromUrl : ALL_CATEGORY;
    const filtersAreSynced = selectedCategory === categoryStateFromUrl && searchQuery === queryFromUrl;
    const initialSearchIsPending = Boolean(queryFromUrl.trim()) && results === allPosts;

    if (loading || isSearching || !filtersAreSynced || initialSearchIsPending || currentPage <= totalPages) {
      return;
    }

    setCurrentPage(totalPages);
    setSearchParams((previous) => setHomeQueryParam(previous, 'page', totalPages), { replace: true });
  }, [
    allPosts,
    categories,
    categoryFromUrl,
    currentPage,
    isSearching,
    loading,
    queryFromUrl,
    results,
    searchQuery,
    selectedCategory,
    setSearchParams,
    totalPages,
  ]);

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
    lastEditedQueryRef.current = query;
    handleSearch(query);
    setCurrentPage(1);
    // 搜索时删除 page 页码：搜索结果的页数与无搜索时不一致，保留会跳到错误页。
    setSearchParams((previous) => setSearchQueryParams(previous, query, ['page']), { replace: true });
  };

  const handleClearSearch = () => {
    lastEditedQueryRef.current = '';
    clearSearch();
    setCurrentPage(1);
    setSearchParams((previous) => clearSearchQueryParams(previous, ['page']), { replace: true });
  };

  const currentPosts = useMemo(
    () => displayedPosts.slice((currentPage - 1) * POSTS_PER_PAGE, currentPage * POSTS_PER_PAGE),
    [currentPage, displayedPosts],
  );

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

  // 分类筛选页（?category=xxx）为可索引内容页（robots: index,follow，canonical 自指），
  // 输出独立的 title/description；无效分类回退文章列表标题。
  const activeCategory = categoryFromUrl && categories.includes(categoryFromUrl) ? categoryFromUrl : null;
  const categoryPostCount = activeCategory ? allPosts.filter((post) => post.category === activeCategory).length : 0;
  const seoTitle = hasSearchQuery ? `搜索：${searchQuery}` : activeCategory ? `分类：${activeCategory}` : '文章';
  const seoDescription = activeCategory
    ? `D-blog「${activeCategory}」分类下的全部文章（共 ${categoryPostCount} 篇），涵盖前端开发、后端运维、AI 工具与效率软件测评等主题。`
    : `${siteConfig.title} 的文章列表，按分类浏览技术笔记、学习记录与日常分享。`;

  return (
    <div className="mx-auto max-w-5xl pb-8 md:pb-12">
      {/* 站内搜索页（?q=xxx）统一 noindex：搜索过滤在客户端执行，静态 HTML 无法
          反映搜索意图；且搜索 URL 空间无限，收录会造成软重复与爬虫资源浪费
          （Google 官方对站内搜索结果页的建议即是不索引）。该 noindex 由 Seo 组件
          根据 URL 中的 q 参数自动输出，无需在此显式传入。 */}
      <Seo title={seoTitle} description={seoDescription} />
      <h1 className="sr-only">文章列表</h1>
      <div className="flex justify-end px-4 pb-3 pt-2 md:px-0">
        <Link
          to="/"
          className="shrink-0 py-2 text-sm text-zinc-500 transition-colors hover:text-ink dark:hover:text-white"
        >
          返回首页
        </Link>
      </div>

      <div className="space-y-6 px-4 md:space-y-8 md:px-0">
        <FilterBar
          categories={categories}
          selected={selectedCategory}
          onSelect={handleSelectCategory}
          sortOrder={sortOrder}
          onToggleSort={handleToggleSort}
        />

        <div className="mx-auto max-w-2xl">
          <SearchField
            value={searchQuery}
            onValueChange={handleSearchChange}
            onClear={handleClearSearch}
            placeholder="搜索标题、摘要、分类与正文内容..."
            aria-label="搜索文章"
          />
        </div>

        {loading || isSearching ? (
          <LoadingList label={isSearching ? '正在搜索文章' : '正在加载文章列表'} />
        ) : loadError || searchError ? (
          <div>
            <ContentStatus
              variant="error"
              title={loadError ? '文章加载失败' : '搜索失败'}
              description={loadError || searchError || undefined}
              actionLabel={loadError ? '重新加载' : '清除搜索'}
              onAction={loadError ? reload : handleClearSearch}
            />
          </div>
        ) : (
          <div id="posts-panel" className="space-y-7" aria-live="polite" tabIndex={-1}>
            {hasSearchQuery && results.length > 0 && (
              <div className="flex items-center justify-end px-4 md:px-0">
                <Link
                  to={`/search?q=${encodeURIComponent(searchQuery)}`}
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-zinc-600 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:decoration-zinc-700 dark:hover:text-white"
                >
                  在搜索页查看全部结果 <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </div>
            )}

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {hasSearchQuery ? '搜索结果' : selectedCategory} · {displayedPosts.length} 篇文章
            </p>
            <div id="posts-list" className="flex flex-col gap-3">
              {currentPosts.length > 0 ? (
                currentPosts.map((post) => <PostCard key={post.id} post={post} layout="row" onShare={setSharePost} />)
              ) : (
                <div className="border-y border-zinc-200 py-14 text-center dark:border-zinc-800">
                  <p className="text-base text-zinc-500 dark:text-zinc-400">
                    {hasSearchQuery ? '未找到匹配的文章' : '暂无相关文章'}
                  </p>
                  {hasSearchQuery && (
                    <button
                      onClick={handleClearSearch}
                      className="mt-3 text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-300"
                      aria-label="清除搜索条件"
                    >
                      清除搜索条件
                    </button>
                  )}
                </div>
              )}
            </div>

            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={paginate} />
          </div>
        )}
      </div>

      <WaveFishDivider variant="fish" className="mx-auto mt-10 max-w-3xl px-4 md:mt-14 md:px-0 lg:hidden" />

      {sharePost && (
        <Suspense fallback={null}>
          <ShareModal
            isOpen={!!sharePost}
            onClose={() => setSharePost(null)}
            title={sharePost.title}
            excerpt={sharePost.excerpt}
            url={absoluteSiteUrl(`/post/${sharePost.id}`, window.location.origin)}
          />
        </Suspense>
      )}
    </div>
  );
};
