/**
 * Anki 记忆卡片正式页（cloud-only 路由 /anki）。
 *
 * 边界：
 * - 独立学习白面：不接管 Love 面、阅读模式与全站导航；只负责主内容区；
 * - 服务端权威：分类/库/卡片/队列/评价/目标全部走云端 API，客户端不另算排期；
 * - 账号：dashboard 401 即登录门；监听 dblog-account-change（退出/切换）清理本机状态；
 * - 竞态：dashboard 加载、子视图加载都用 AbortController + cancelled 守卫，卸载后不 setState。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Seo } from '@/components/Seo';
import { fetchDashboard, isUnauthorized, type AnkiCard, type NormalizedDashboard } from './anki-api';
import { AnkiReview } from './AnkiReview';
import { AnkiBrowse } from './AnkiBrowse';
import { AnkiDeckDetail } from './AnkiDeckDetail';
import { AnkiStats } from './AnkiStats';
import { AnkiDialogs, type AnkiDialogState } from './AnkiDialogs';

type AnkiView =
  | { name: 'overview' }
  | { name: 'stats' }
  | { name: 'review'; deckId: string | null }
  | { name: 'browse'; deckId: string }
  | { name: 'deck'; deckId: string };

type Phase = 'loading' | 'ready' | 'unauthorized' | 'error';

const ANKI_LOGIN_HREF = '/api/v1/auth/github/start';

export default function AnkiPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [dashboard, setDashboard] = useState<NormalizedDashboard | null>(null);
  const [view, setView] = useState<AnkiView>({ name: 'overview' });
  const [dialog, setDialog] = useState<AnkiDialogState | null>(null);
  const [toast, setToast] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 4200);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // dashboard 加载（账号探测）：401 → 登录门；其他失败如实反馈。
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setPhase('loading');
    fetchDashboard(controller.signal)
      .then((data) => {
        if (cancelled) return;
        setDashboard(data);
        setPhase('ready');
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) return;
        if (isUnauthorized(error)) {
          setPhase('unauthorized');
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : '云端服务暂时不可用，请重试');
        setPhase('error');
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadToken]);

  // 退出/切换账号：CloudAccount 退出时广播 dblog-account-change。
  // 此处清理本机学习状态、队列与弹层，回到登录门，避免跨账号残留。
  useEffect(() => {
    const onAccountChange = () => {
      setDashboard(null);
      setView({ name: 'overview' });
      setDialog(null);
      setPhase('unauthorized');
    };
    window.addEventListener('dblog-account-change', onAccountChange);
    return () => window.removeEventListener('dblog-account-change', onAccountChange);
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  if (phase === 'unauthorized') {
    return (
      <div className="min-h-screen bg-white text-ink dark:bg-zinc-950 dark:text-white">
        <Seo title="Anki 记忆卡片" noindex />
        <AnkiTopBar view={view} onNavigate={setView} showNav={false} />
        <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-surface bg-sky-600 text-xl font-semibold text-white">
            A
          </div>
          <h1 className="text-2xl font-bold text-ink dark:text-white">登录后，查看自己的卡片库</h1>
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            卡片库与练习进度只属于你，由服务端按会话隔离。
          </p>
          <a
            href={ANKI_LOGIN_HREF}
            className="editorial-button-primary mt-6 inline-flex min-h-11 items-center justify-center px-5 text-sm"
          >
            使用 GitHub 登录
          </a>
          <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">登录成功后回到本页即可开始练习。</p>
        </main>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-white text-ink dark:bg-zinc-950 dark:text-white">
        <Seo title="Anki 记忆卡片" noindex />
        <AnkiTopBar view={view} onNavigate={setView} showNav={false} />
        <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
          <h1 className="text-xl font-bold text-ink dark:text-white">学习统计暂时加载失败</h1>
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400" role="alert">
            {errorMessage}
          </p>
          <button
            type="button"
            className="editorial-button-primary mt-6 inline-flex min-h-11 items-center justify-center px-5 text-sm"
            onClick={refresh}
          >
            重新加载
          </button>
        </main>
      </div>
    );
  }

  // 独立白面 shell：白底 + 自有顶部条，不继承全站装饰。
  return (
    <div className="min-h-screen bg-white text-ink dark:bg-zinc-950 dark:text-white">
      <Seo
        title="Anki 记忆卡片"
        description="按分类整理 Q & A 卡片，到期主动回忆并自评，让知识在合适的时间再次出现。"
        noindex
      />
      <AnkiTopBar view={view} onNavigate={setView} showNav={phase === 'ready' && Boolean(dashboard)} />
      <main className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
        {phase === 'loading' || !dashboard ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <p className="text-sm text-zinc-400 dark:text-zinc-500">正在加载卡片库…</p>
          </div>
        ) : (
          <AnkiWorkspace
            dashboard={dashboard}
            view={view}
            onViewChange={setView}
            dialog={dialog}
            onDialogChange={setDialog}
            refresh={refresh}
            showToast={showToast}
          />
        )}
      </main>
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed bottom-20 left-1/2 z-floating -translate-x-1/2"
      >
        {toast && (
          <div className="rounded-surface border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

const ANKI_TABS: Array<{ key: AnkiView['name']; label: string }> = [
  { key: 'overview', label: '卡片库' },
  { key: 'review', label: '今日练习' },
  { key: 'stats', label: '学习统计' },
];

function AnkiTopBar({
  view,
  onNavigate,
  showNav,
}: {
  view: AnkiView;
  onNavigate: (view: AnkiView) => void;
  showNav: boolean;
}) {
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
        <a href="/" className="flex items-center gap-1 text-sm font-semibold tracking-tight">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-sky-600 text-xs font-bold text-white">
            A
          </span>
          <span>Anki</span>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-zinc-500 dark:text-zinc-400">Blog</span>
        </a>
        {showNav && (
          <nav aria-label="Anki 导航" className="flex items-center gap-1">
            {ANKI_TABS.map((tab) => {
              const active = view.name === tab.key || (tab.key === 'review' && view.name === 'review');
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() =>
                    onNavigate(
                      tab.key === 'overview'
                        ? { name: 'overview' }
                        : tab.key === 'stats'
                          ? { name: 'stats' }
                          : { name: 'review', deckId: null },
                    )
                  }
                  className={`rounded px-2.5 py-1.5 text-sm transition-colors ${
                    active
                      ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                      : 'text-zinc-500 hover:text-ink dark:text-zinc-400 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        )}
        <a href="/" className="text-sm text-zinc-500 hover:text-ink dark:text-zinc-400 dark:hover:text-white">
          返回博客
        </a>
      </div>
    </header>
  );
}

interface WorkspaceProps {
  dashboard: NormalizedDashboard;
  view: AnkiView;
  onViewChange: (view: AnkiView) => void;
  dialog: AnkiDialogState | null;
  onDialogChange: (dialog: AnkiDialogState | null) => void;
  refresh: () => void;
  showToast: (message: string) => void;
}

function AnkiWorkspace({ dashboard, view, onViewChange, dialog, onDialogChange, refresh, showToast }: WorkspaceProps) {
  const deckById = useMemo(() => {
    const map = new Map<string, (typeof dashboard.decks)[number]>();
    dashboard.decks.forEach((deck) => map.set(deck.id, deck));
    return map;
  }, [dashboard]);

  return (
    <>
      {view.name === 'review' && (
        <AnkiReview
          decks={dashboard.decks}
          deckId={view.deckId}
          onExit={() => onViewChange({ name: 'overview' })}
          onSessionSettled={() => refresh()}
        />
      )}

      {view.name === 'browse' && (
        <AnkiBrowse
          deckId={view.deckId}
          deckName={deckById.get(view.deckId)?.name ?? ''}
          onExit={() => onViewChange({ name: 'deck', deckId: view.deckId })}
        />
      )}

      {view.name === 'deck' &&
        (() => {
          const deck = deckById.get(view.deckId);
          if (!deck) {
            onViewChange({ name: 'overview' });
            return null;
          }
          return (
            <AnkiDeckDetail
              deck={deck}
              categoryName={dashboard.categories.find((cat) => cat.id === deck.categoryId)?.name ?? ''}
              onBack={() => onViewChange({ name: 'overview' })}
              onNewCard={() => onDialogChange({ kind: 'card', deckId: deck.id })}
              onEditCard={(card: AnkiCard) => onDialogChange({ kind: 'card', card })}
              onBrowse={() => onViewChange({ name: 'browse', deckId: deck.id })}
              onPractice={() => onViewChange({ name: 'review', deckId: deck.id })}
            />
          );
        })()}

      {view.name === 'stats' && (
        <AnkiStats
          dashboard={dashboard}
          onBack={() => onViewChange({ name: 'overview' })}
          onEditGoal={() => onDialogChange({ kind: 'goal' })}
        />
      )}

      {view.name === 'overview' && (
        <AnkiOverview
          dashboard={dashboard}
          onOpenStats={() => onViewChange({ name: 'stats' })}
          onOpenDeck={(deckId) => onViewChange({ name: 'deck', deckId })}
          onStartPractice={(deckId) => onViewChange({ name: 'review', deckId })}
          onBrowse={(deckId) => onViewChange({ name: 'browse', deckId })}
          onNewDeck={() => onDialogChange({ kind: 'deck' })}
          onNewCard={() => {
            if (dashboard.decks.length === 0) {
              onDialogChange({ kind: 'deck' });
              return;
            }
            onDialogChange({ kind: 'card' });
          }}
        />
      )}

      <AnkiDialogs
        state={dialog}
        dashboard={dashboard}
        onClose={() => onDialogChange(null)}
        onDone={(message) => {
          onDialogChange(null);
          refresh();
          showToast(message);
        }}
      />
    </>
  );
}

interface OverviewProps {
  dashboard: NormalizedDashboard;
  onOpenStats: () => void;
  onOpenDeck: (deckId: string) => void;
  onStartPractice: (deckId: string | null) => void;
  onBrowse: (deckId: string) => void;
  onNewDeck: () => void;
  onNewCard: () => void;
}

function AnkiOverview({
  dashboard,
  onOpenStats,
  onOpenDeck,
  onStartPractice,
  onBrowse,
  onNewDeck,
  onNewCard,
}: OverviewProps) {
  const [categoryFilter, setCategoryFilter] = useState('全部');
  const [search, setSearch] = useState('');

  const totalDue = dashboard.decks.reduce((sum, deck) => sum + deck.due, 0);
  const done = dashboard.todayCards;
  const goal = dashboard.goal;
  const goalPct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;

  const categories = useMemo(
    () => ['全部', ...Array.from(new Set(dashboard.decks.map((deck) => deck.categoryId)))],
    [dashboard.decks],
  );
  const categoryName = useMemo(() => {
    const map = new Map<string, string>();
    dashboard.categories.forEach((cat) => map.set(cat.id, cat.name));
    return map;
  }, [dashboard.categories]);

  const visibleDecks = dashboard.decks.filter((deck) => {
    if (categoryFilter !== '全部' && deck.categoryId !== categoryFilter) return false;
    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;
    return [deck.name, categoryName.get(deck.categoryId) ?? ''].join(' ').toLowerCase().includes(keyword);
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink dark:text-white md:text-4xl">我的卡片库</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            记录值得记住的知识。每天留一点时间，让它们重新浮现。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="editorial-button" onClick={onNewCard}>
            录入卡片
          </button>
          <button
            type="button"
            className={totalDue > 0 ? 'editorial-button-primary' : 'editorial-button'}
            disabled={totalDue === 0}
            onClick={() => onStartPractice(null)}
          >
            {totalDue > 0 ? `开始今日练习 · ${totalDue} 张` : '暂无到期卡片'}
          </button>
        </div>
      </header>

      <section aria-label="今日目标" className="flex flex-wrap items-center gap-4">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          今日已练 <strong className="text-ink dark:text-white">{done}</strong> / {goal} 张
        </span>
        <div
          className="h-1 w-32 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          role="progressbar"
          aria-label="今日目标进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={goalPct}
        >
          <div className="h-full rounded-full bg-sky-600" style={{ width: `${goalPct}%` }} />
        </div>
        <button type="button" className="editorial-button text-sm" onClick={onOpenStats}>
          查看学习统计
        </button>
      </section>

      <section aria-label="卡片库列表">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <div className="flex flex-wrap gap-4" role="group" aria-label="按分类筛选">
            {categories.map((categoryId) => {
              const label = categoryId === '全部' ? '全部' : (categoryName.get(categoryId) ?? categoryId);
              const active = categoryFilter === categoryId;
              return (
                <button
                  key={categoryId}
                  type="button"
                  aria-pressed={active}
                  className={`text-sm ${active ? 'font-semibold text-ink dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}
                  onClick={() => setCategoryFilter(categoryId)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <label className="flex min-h-11 items-center gap-2 border-b border-zinc-200 px-1 text-sm text-zinc-400 dark:border-zinc-800">
            <input
              type="search"
              aria-label="搜索卡片库"
              placeholder="搜索卡片库"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-36 border-0 bg-transparent py-2 text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
            />
          </label>
        </div>

        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
          {visibleDecks.length} 个卡片库 · {visibleDecks.reduce((sum, deck) => sum + deck.total, 0)} 张卡片
        </p>

        {visibleDecks.length === 0 ? (
          <div className="py-12 text-center">
            <h2 className="text-lg font-semibold text-ink dark:text-white">还没有匹配的卡片库</h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {dashboard.decks.length === 0 ? '从一个明确的问题开始，先创建卡片库。' : '换个关键词，或创建新的卡片库。'}
            </p>
            <button type="button" className="editorial-button-primary mt-5" onClick={onNewDeck}>
              新建卡片库
            </button>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
            {visibleDecks.map((deck) => {
              const pct = deck.total > 0 ? Math.round((deck.learned / deck.total) * 100) : 0;
              return (
                <li key={deck.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button type="button" className="text-left" onClick={() => onOpenDeck(deck.id)}>
                        <h3 className="text-base font-semibold text-ink dark:text-white">{deck.name}</h3>
                      </button>
                      <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                        {categoryName.get(deck.categoryId) ?? '未分类'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="editorial-button text-sm"
                        disabled={deck.total === 0}
                        onClick={() => onBrowse(deck.id)}
                      >
                        随机浏览
                      </button>
                      <button
                        type="button"
                        className="editorial-button-primary text-sm"
                        disabled={deck.due === 0}
                        onClick={() => onStartPractice(deck.id)}
                      >
                        {deck.due > 0 ? `练习 ${deck.due} 张` : '暂无到期'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{deck.total} 张卡片</span>
                    <span>{pct}% 已学</span>
                    <span>熟练 {deck.stable}</span>
                    <span>待练 {deck.due}</span>
                  </div>
                  <div
                    className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
                    role="progressbar"
                    aria-label={`${deck.name}已学覆盖率`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                  >
                    <div className="h-full rounded-full bg-sky-600" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="flex items-center justify-between border-t border-zinc-200 pt-4 text-xs text-zinc-400 dark:border-zinc-800">
        <span>随机浏览随时可用，不影响你的复习安排。</span>
        <button type="button" className="text-sky-600 underline-offset-4 hover:underline" onClick={onNewDeck}>
          新建卡片库
        </button>
      </footer>
    </div>
  );
}
