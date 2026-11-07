import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, RotateCcw, X } from 'lucide-react';
import { PostCard } from '@/components/PostCard';
import { Pagination } from '@/components/Pagination';
import { Seo } from '@/components/Seo';
import { useArticlePosts } from '@/hooks/useArticlePosts';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { useArticleReading } from '@/cloud/useArticleReading';
import {
  emptyReadingState,
  indexReadingStats,
  preferenceFor,
  readingDay,
  readingStats,
  recordReading,
  setPreference,
  undoReading,
  type Interest,
} from '@/cloud/articleReading';
import type { PostMetadata } from '@/types';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { siteConfig } from '@config/site.config';

const ShareModal = lazy(() => import('@/components/ShareModal').then((m) => ({ default: m.ShareModal })));
const views = [
  ['all', '全部文章'],
  ['want', '想看'],
  ['seen', '已看'],
  ['skip', '暂不看'],
] as const;
const control = 'frosted-control min-h-10 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'flex min-w-0 flex-col gap-1.5 text-xs text-zinc-500 dark:text-zinc-400';

export default function ArticlesV2() {
  const reading = useArticleReading();
  const { allPosts, categories, loading: postsLoading, loadError, reload: retryLoad } = useArticlePosts();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({ view: 'all', q: '', category: '', sort: 'fewest', page: 1 });
  const [today, setToday] = useState('');
  const [historyPost, setHistoryPost] = useState<PostMetadata | null>(null);
  const [sharePost, setSharePost] = useState<PostMetadata | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeHistory = useCallback(() => setHistoryPost(null), []);
  const historyOpen = Boolean(historyPost && reading.user && reading.snapshot && !reading.loading);
  useModalOverlay({ isOpen: historyOpen, onClose: closeHistory, containerRef: historyRef, initialFocusRef: closeRef });
  useEffect(() => {
    const tick = () => setToday(readingDay(new Date()));
    tick();
    const timer = window.setInterval(tick, 60000);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, []);
  useEffect(() => {
    const view = params.get('view') ?? 'all';
    const sort = params.get('sort') ?? 'fewest';
    const page = Number(params.get('page') ?? 1);
    setFilters({
      view: views.some(([key]) => key === view) ? view : 'all',
      q: params.get('q') ?? '',
      category: params.get('category') ?? '',
      sort: ['fewest', 'most', 'newest'].includes(sort) ? sort : 'fewest',
      page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    });
  }, [params]);
  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: key === 'q' });
  };
  const state = useMemo(() => reading.snapshot?.state ?? emptyReadingState(), [reading.snapshot]);
  const stats = useMemo(() => indexReadingStats(state, today), [state, today]);
  const preferences = useMemo(() => new Map(state.preferences.map((p) => [p.postId, p])), [state]);
  const fallbackStats = useMemo(() => readingStats(emptyReadingState(), '', today), [today]);
  const selected = useMemo(() => {
    const terms = filters.q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return allPosts
      .filter((post) => {
        const interest = preferences.get(post.id)?.interest ?? 'want';
        if (filters.view !== 'all' && interest !== filters.view) return false;
        if (filters.category && post.category !== filters.category) return false;
        const text = `${post.title} ${post.excerpt} ${post.tags.join(' ')}`.toLocaleLowerCase();
        return terms.every((term) => text.includes(term));
      })
      .sort((a, b) => {
        const diff = (stats.get(a.id)?.count ?? 0) - (stats.get(b.id)?.count ?? 0);
        return (
          (filters.sort === 'newest' ? 0 : filters.sort === 'most' ? -diff : diff) ||
          b.date.localeCompare(a.date) ||
          a.id.localeCompare(b.id)
        );
      });
  }, [allPosts, filters, preferences, stats]);
  const totalPages = Math.max(1, Math.ceil(selected.length / 9));
  const page = Math.min(filters.page, totalPages);
  useEffect(() => {
    if (!reading.snapshot || postsLoading || page === filters.page) return;
    const next = new URLSearchParams(params);
    if (page === 1) next.delete('page');
    else next.set('page', String(page));
    setParams(next, { replace: true });
  }, [page, filters.page, params, setParams, reading.snapshot, postsLoading]);
  const disabled = reading.busy || reading.pending || !today;
  const history = historyPost
    ? state.events
        .filter((e) => e.postId === historyPost.id)
        .slice()
        .reverse()
        .sort((a, b) => b.day.localeCompare(a.day))
        .slice(0, 20)
    : [];

  return (
    <div className="mx-auto max-w-5xl pb-8 md:pb-12">
      <Seo title="文章回看 · V2" description="登录后管理想看、已看、暂不看的文章与个人阅读记录。" noindex />
      <h1 className="sr-only">文章列表 · V2</h1>
      <div className="flex justify-end px-4 pb-3 pt-2 md:px-0">
        <Link
          to="/articles"
          className="inline-flex items-center gap-2 py-2 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          返回文章列表
        </Link>
      </div>
      <div className="space-y-6 px-4 md:space-y-8 md:px-0">
        {reading.loading ? (
          <p role="status">正在检查账号与阅读记录…</p>
        ) : !reading.user ? (
          <div className="py-6">
            <p className="mb-4 text-sm leading-7 text-zinc-500 dark:text-zinc-400">
              登录后管理文章分类与阅读次数，记录保存在你的账号中。
            </p>
            <button className={control} onClick={() => window.dispatchEvent(new Event('dblog-account-open'))}>
              登录账号
            </button>
            {reading.error && (
              <p role="alert" className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                {reading.error}
              </p>
            )}
            {reading.error && (
              <button className={`${control} mt-3`} onClick={() => void reading.reload()}>
                重新检查账号
              </button>
            )}
          </div>
        ) : (
          <>
            {reading.error && (
              <div
                role="alert"
                className="mb-5 rounded-surface border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
              >
                <p>{reading.error}</p>
                {reading.pending && !reading.conflict ? (
                  <button className={`${control} mt-3`} disabled={reading.busy} onClick={reading.retry}>
                    重试保存
                  </button>
                ) : (
                  <button className={`${control} mt-3`} onClick={() => void reading.reload()}>
                    读取云端版本
                  </button>
                )}
              </div>
            )}
            {reading.snapshot && (
              <>
                <nav aria-label="阅读分类" className="mb-4 flex flex-wrap gap-2">
                  {views.map(([key, label]) => (
                    <button
                      key={key}
                      className={`${control} ${filters.view === key ? '!border-emerald-400 !bg-emerald-100 !text-emerald-900 dark:!bg-emerald-950 dark:!text-emerald-100' : ''}`}
                      aria-pressed={filters.view === key}
                      onClick={() => updateFilter('view', key)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_10rem_10rem]">
                  <label className={labelClass}>
                    搜索标题、标签与摘要
                    <input
                      type="search"
                      className={control}
                      value={filters.q}
                      onChange={(e) => updateFilter('q', e.target.value)}
                      placeholder="搜索文章…"
                    />
                  </label>
                  <label className={labelClass}>
                    文章分类
                    <select
                      className={control}
                      value={filters.category}
                      onChange={(e) => updateFilter('category', e.target.value)}
                    >
                      <option value="">全部分类</option>
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    排序
                    <select
                      className={control}
                      value={filters.sort}
                      onChange={(e) => updateFilter('sort', e.target.value)}
                    >
                      <option value="fewest">阅读次数少的在前</option>
                      <option value="most">阅读次数多的在前</option>
                      <option value="newest">最新发布</option>
                    </select>
                  </label>
                </div>
                <p role="status" className="mb-4 text-xs leading-6 text-zinc-500 dark:text-zinc-400">
                  {reading.busy ? '正在保存…' : reading.pending ? '等待保存确认' : '已与云端同步'} · 共{' '}
                  {selected.length} 篇 · 同一篇文章每天最多记录一次（北京时间）
                </p>
                {postsLoading && <p role="status">正在加载文章…</p>}
                {loadError && (
                  <div role="alert">
                    {loadError}
                    <button className={control} onClick={retryLoad}>
                      重试加载文章
                    </button>
                  </div>
                )}
                {!postsLoading && !loadError && selected.length === 0 && (
                  <div className="py-10 text-center">
                    <p className="text-sm leading-7">这个分类还没有符合条件的文章。</p>
                    <button
                      className={`${control} mt-4`}
                      onClick={() => {
                        setParams({ view: 'all' });
                      }}
                    >
                      浏览全部文章
                    </button>
                  </div>
                )}
                <div className="mb-6 flex flex-col gap-5" aria-label="个人文章列表">
                  {selected.slice((page - 1) * 9, page * 9).map((post) => {
                    const p = preferences.get(post.id) ?? preferenceFor(state, post.id);
                    const s = stats.get(post.id) ?? fallbackStats;
                    return (
                      <section key={post.id} aria-label={`管理文章：${post.title}`} className="min-w-0">
                        <PostCard post={post} layout="row" onShare={setSharePost} />
                        <div className="flex flex-wrap items-center gap-3 px-4 pt-3 sm:px-6">
                          <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                            阅读分类
                            <select
                              className={control}
                              disabled={disabled}
                              value={p.interest}
                              onChange={(e) =>
                                reading.mutate((v) =>
                                  setPreference(v, {
                                    ...preferenceFor(v, post.id),
                                    interest: e.target.value as Interest,
                                  }),
                                )
                              }
                            >
                              <option value="want">想看</option>
                              <option value="seen">已看</option>
                              <option value="skip">暂不看</option>
                            </select>
                          </label>
                          {s.lastDay && (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">最近阅读 {s.lastDay}</span>
                          )}
                          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                            <button
                              className={control}
                              onClick={() => setHistoryPost(post)}
                              aria-label={`${post.title}的阅读记录`}
                            >
                              已读 {s.count} 次
                            </button>
                            <button
                              className={`${control} !text-emerald-800 dark:!text-emerald-200`}
                              disabled={disabled}
                              onClick={() =>
                                reading.mutate((v) =>
                                  s.completedToday
                                    ? undoReading(v, s.completedToday.id)
                                    : recordReading(v, post.id, today, crypto.randomUUID()),
                                )
                              }
                            >
                              {s.completedToday ? '撤销今日已读' : '记录一次已读'}
                            </button>
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={(value) => updateFilter('page', String(value))}
                />
              </>
            )}
          </>
        )}
      </div>
      {historyOpen && historyPost && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/30 p-4" onClick={closeHistory}>
          <div
            ref={historyRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reading-history-title"
            tabIndex={-1}
            className="frosted-panel max-h-[80dvh] w-full max-w-lg overflow-y-auto p-6 outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 id="reading-history-title" className="text-lg font-semibold">
                {historyPost.title} · 阅读记录
              </h2>
              <button ref={closeRef} className={control} aria-label="关闭阅读记录" onClick={closeHistory}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              显示最近 20 条记录；撤销会调整阅读次数，撤销最近一次阅读时恢复此前分类。
            </p>
            {history.length === 0 ? (
              <p className="text-sm">还没有阅读记录。</p>
            ) : (
              <ul className="space-y-3">
                {history.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      {e.day}
                      {e.undone ? ' · 已撤销' : ' · 已读'}
                    </span>
                    {!e.undone && (
                      <button
                        disabled={disabled}
                        className={control}
                        onClick={() => reading.mutate((v) => undoReading(v, e.id))}
                      >
                        <RotateCcw size={13} className="mr-1 inline" aria-hidden="true" />
                        撤销
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {sharePost && (
        <Suspense fallback={null}>
          <ShareModal
            isOpen
            title={sharePost.title}
            excerpt={sharePost.excerpt}
            url={absoluteSiteUrl(`/post/${sharePost.id}`, siteConfig.url)}
            onClose={() => setSharePost(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
