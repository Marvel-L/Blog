/**
 * Anki 记忆卡片正式页（cloud-only 路由 /anki）。
 *
 * 边界：
 * - 独立学习白面：不接管 Love 面、阅读模式与全站导航；只负责主内容区；
 * - 视觉：以 anki-prototype/anki.html v3 为几何真值（≥1000 / ≥650 两级断点、1100 阅读宽、
 *   单行顶部导航 + 圆点激活、pill 按钮 radius24、连续库行四列 grid、指标行/goal 独立行）；
 * - 服务端权威：分类/库/卡片/队列/评价/目标全部走云端 API，客户端不另算排期；
 *   「连续练习」由服务端 history（reviews>0 的连续自然日）真实推算，不虚构新卡/复习 split；
 * - 账号：dashboard 401 即登录门；监听 dblog-account-change（退出/切换）清理本机状态；
 * - 竞态：dashboard 加载、子视图加载都用 AbortController + cancelled 守卫，卸载后不 setState。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useHref, useLocation } from 'react-router-dom';
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

// v3 设计 token（与原型一致；Anki shell light-only，不改全局主题）。
const T = {
  ink: '#202124',
  muted: '#777d86',
  line: '#e9edf1',
  accent: '#087ae9',
};

export default function AnkiPage() {
  const loginReturn = useHref('/anki');
  const loginHref = `${ANKI_LOGIN_HREF}?return_to=${encodeURIComponent(loginReturn)}`;
  const location = useLocation();
  const explicitLogin = location.pathname === '/anki/login';
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [dashboard, setDashboard] = useState<NormalizedDashboard | null>(null);
  const [view, setView] = useState<AnkiView>({ name: 'overview' });
  const [dialog, setDialog] = useState<AnkiDialogState | null>(null);
  const [toast, setToast] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const toastTimer = useRef<number | undefined>(undefined);
  const dashboardRequest = useRef<AbortController | null>(null);
  const accountGeneration = useRef(0);
  const [accountKey, setAccountKey] = useState(0);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 4200);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // dashboard 加载（账号探测）：401 → 登录门；其他失败如实反馈。
  useEffect(() => {
    const controller = new AbortController();
    dashboardRequest.current = controller;
    const generation = accountGeneration.current;
    let cancelled = false;
    setPhase((previous) => (previous === 'ready' ? 'ready' : 'loading'));
    fetchDashboard(controller.signal)
      .then((data) => {
        if (cancelled || controller.signal.aborted || generation !== accountGeneration.current) return;
        setDashboard(data);
        setErrorMessage('');
        setPhase('ready');
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted || generation !== accountGeneration.current) return;
        setDashboard(null);
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
  useEffect(() => {
    const onAccountChange = () => {
      accountGeneration.current += 1;
      dashboardRequest.current?.abort();
      window.clearTimeout(toastTimer.current);
      setToast('');
      setAccountKey((key) => key + 1);
      setDashboard(null);
      setView({ name: 'overview' });
      setDialog(null);
      setPhase('unauthorized');
    };
    window.addEventListener('dblog-account-change', onAccountChange);
    return () => window.removeEventListener('dblog-account-change', onAccountChange);
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);
  const navigate = useCallback(
    (next: AnkiView) => {
      if (view.name === 'review' && next.name !== 'review') refresh();
      setView(next);
    },
    [view.name, refresh],
  );

  if (phase === 'unauthorized' || explicitLogin) {
    return (
      <div className="min-h-screen bg-white" style={{ color: T.ink }}>
        <Seo title="Anki 记忆卡片" noindex />
        <AnkiTopBar view={view} onNavigate={navigate} showNav={false} />
        <main className="mx-auto flex min-h-[60vh] w-full max-w-[1100px] flex-col items-center justify-center px-6 py-16 text-center">
          <div
            className="mb-5 grid h-[29px] w-[25px] place-items-center rounded-md text-[17px] font-semibold text-white"
            style={{ background: T.accent }}
          >
            A
          </div>
          <h1 className="text-2xl font-semibold" style={{ color: T.ink }}>
            登录后，查看自己的卡片库
          </h1>
          <p className="mt-3 text-sm" style={{ color: T.muted }}>
            卡片库与练习进度只属于你，由服务端按会话隔离。
          </p>
          <a
            href={loginHref}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-medium text-white"
            style={{ background: T.accent }}
          >
            使用 GitHub 登录
          </a>
          <p className="mt-4 text-xs" style={{ color: T.muted }}>
            登录成功后自动返回 Anki。
          </p>
          {phase === 'error' && (
            <p role="alert" className="mt-4 max-w-md text-sm text-red-600">
              {errorMessage}。当前无法确认登录状态，登录也需要可用的账号服务。
            </p>
          )}
          {phase === 'ready' && (
            <Link to="/anki" className="mt-4 text-sm" style={{ color: T.accent }}>
              继续使用当前账号
            </Link>
          )}
        </main>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-white" style={{ color: T.ink }}>
        <Seo title="Anki 记忆卡片" noindex />
        <AnkiTopBar view={view} onNavigate={navigate} showNav={false} />
        <main className="mx-auto flex min-h-[60vh] w-full max-w-[1100px] flex-col items-center justify-center px-6 py-16 text-center">
          <h1 className="text-xl font-semibold" style={{ color: T.ink }}>
            学习统计暂时加载失败
          </h1>
          <p className="mt-3 text-sm" style={{ color: T.muted }} role="alert">
            {errorMessage}
          </p>
          <button
            type="button"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-medium text-white"
            style={{ background: T.accent }}
            onClick={refresh}
          >
            重新加载
          </button>
          <Link to="/anki/login" className="mt-5 text-sm font-medium" style={{ color: T.accent }}>
            查看登录页面
          </Link>
          <p className="mt-3 max-w-md text-xs" style={{ color: T.muted }}>
            无法确认登录状态；若账号 API 未启动或代理返回博客页面，登录操作也暂时不可用。
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" style={{ color: T.ink }}>
      <Seo
        title="Anki 记忆卡片"
        description="按分类整理 Q & A 卡片，到期主动回忆并自评，让知识在合适的时间再次出现。"
        noindex
      />
      <AnkiTopBar view={view} onNavigate={navigate} showNav={phase === 'ready' && Boolean(dashboard)} />
      <main className="mx-auto w-full max-w-[1100px] px-[22px] pb-[65px] pt-[40px] min-[1000px]:px-[35px] min-[1000px]:pb-[75px] min-[1000px]:pt-[60px]">
        {phase === 'loading' || !dashboard ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <p className="text-sm" style={{ color: T.muted }}>
              正在加载卡片库…
            </p>
          </div>
        ) : (
          <AnkiWorkspace
            key={accountKey}
            dashboard={dashboard}
            view={view}
            onViewChange={navigate}
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
          <div
            className="rounded-full border bg-white px-4 py-2 text-sm shadow-md"
            style={{ borderColor: T.line, color: T.ink }}
          >
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
    <header className="border-b bg-white/[.85] backdrop-blur-xl" style={{ borderColor: T.line }}>
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 px-[22px] py-[12px] min-[1000px]:flex-nowrap min-[1000px]:gap-[25px] min-[1000px]:px-[35px]">
        <Link
          to="/"
          className="flex items-center gap-[9px] text-[21px] font-semibold tracking-[-0.045em]"
          style={{ fontWeight: 620 }}
        >
          <span
            className="grid h-[29px] w-[25px] place-items-center rounded-md text-[17px] font-semibold text-white"
            style={{ background: T.accent }}
          >
            A
          </span>
          <span style={{ color: T.ink }}>Anki</span>
          <span className="text-[15px]" style={{ color: '#c5cbd1' }}>
            /
          </span>
          <span className="text-[15px] font-normal" style={{ color: T.muted }}>
            Blog
          </span>
        </Link>
        {showNav && (
          <nav
            aria-label="Anki 导航"
            className="order-3 flex w-full justify-center gap-[26px] min-[1000px]:order-none min-[1000px]:w-auto min-[1000px]:gap-[30px]"
          >
            {ANKI_TABS.map((tab) => {
              const active = view.name === tab.key;
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
                  className="relative min-h-[49px] px-0 pb-2 text-sm min-[1000px]:min-h-[44px] min-[1000px]:pb-0"
                  style={{
                    color: active ? T.ink : T.muted,
                    fontWeight: active ? 550 : 400,
                  }}
                >
                  {tab.label}
                  {active && (
                    <i
                      className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full min-[1000px]:bottom-0"
                      style={{ background: T.ink, height: 4, width: 4 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        )}
        <div className="flex items-center gap-4">
          <Link to="/anki/login" className="text-sm font-medium hover:opacity-80" style={{ color: T.accent }}>
            账号登录
          </Link>
          <Link to="/" className="text-sm font-medium hover:opacity-80" style={{ color: T.accent }}>
            返回博客
          </Link>
        </div>
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
          key={view.deckId ?? 'all'}
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
          onEditGoal={() => onDialogChange({ kind: 'goal' })}
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
  onEditGoal: () => void;
}

// v3 pill 按钮：radius 24px、min-h 44、9/17、14/500。
function PillButton({
  primary,
  disabled,
  onClick,
  children,
  text,
}: {
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  text?: boolean;
}) {
  if (text) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="min-h-11 px-2 text-sm font-medium disabled:opacity-40"
        style={{ color: T.accent }}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-3xl border px-[17px] text-sm font-medium disabled:opacity-[.38]"
      style={{
        borderColor: T.line,
        background: '#fff',
        color: T.ink,
        ...(primary ? { background: T.accent, borderColor: T.accent, color: '#fff' } : {}),
      }}
    >
      {children}
    </button>
  );
}

// 连续练习：从服务端 history 末尾向前数 reviews>0 的自然日（今天还没练可从昨天起算）。
function computeStreak(history: ReadonlyArray<{ date: string; reviews: number }>): number {
  if (history.length === 0) return 0;
  const days = [...history].sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = days[days.length - 1];
  let startIndex = days.length - 1;
  if (last.reviews === 0) startIndex -= 1;
  let streak = 0;
  for (let i = startIndex; i >= 0; i -= 1) {
    if (days[i].reviews > 0) streak += 1;
    else break;
  }
  return streak;
}

function AnkiOverview({
  dashboard,
  onOpenStats,
  onOpenDeck,
  onStartPractice,
  onBrowse,
  onNewDeck,
  onNewCard,
  onEditGoal,
}: OverviewProps) {
  const [categoryFilter, setCategoryFilter] = useState('全部');
  const [search, setSearch] = useState('');

  const totalDue = dashboard.decks.reduce((sum, deck) => sum + deck.due, 0);
  const learned = dashboard.decks.reduce((sum, deck) => sum + deck.learned, 0);
  const done = dashboard.todayCards;
  const goal = dashboard.goal;
  const goalPct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  const streak = computeStreak(dashboard.history);

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

  // v3 库行 glyph 配色轮换。
  const glyphs = [
    { bg: '#f0f6f9', fg: '#538aa9' },
    { bg: '#eff7f3', fg: '#609889' },
  ];

  return (
    <div>
      <header data-testid="anki-hero" className="flex flex-wrap items-start justify-between gap-[26px] pb-[26px]">
        <div>
          <h1
            className="text-[38px] leading-[1.25] tracking-[-0.055em] min-[1000px]:text-[44px]"
            style={{ color: T.ink, fontWeight: 620 }}
          >
            我的卡片库
          </h1>
          <p className="mt-[10px] max-w-[550px] text-sm" style={{ color: T.muted }}>
            记录值得记住的知识。每天留一点时间，让它们重新浮现。
          </p>
        </div>
        <div className="flex flex-col items-start gap-[9px] min-[1000px]:items-end">
          <PillButton primary disabled={totalDue === 0} onClick={() => onStartPractice(null)}>
            {totalDue > 0 ? `开始今日练习 · ${totalDue} 张` : '暂无到期卡片'}
          </PillButton>
          <span className="text-sm" style={{ color: T.muted }}>
            {totalDue} 张待练，先复习，再学新卡。
          </span>
        </div>
      </header>

      {/* 指标行：label(灰14) → value(大数字) → unit(灰14) 三段；移动端 2×2 */}
      <section
        data-testid="anki-metrics"
        aria-label="学习概览"
        className="grid grid-cols-2 gap-x-[12px] gap-y-[14px] px-0 pb-[33px] pt-[8px] min-[650px]:flex min-[650px]:gap-x-[40px] min-[650px]:gap-y-0"
      >
        {[
          { label: '待练', value: totalDue, unit: '张' },
          { label: '已学', value: learned, unit: '张' },
          { label: '今日已练', value: done, unit: '张' },
          { label: '连续练习', value: streak, unit: '天' },
        ].map((metric) => (
          <span key={metric.label} className="flex items-baseline gap-[7px]">
            <span className="text-sm" style={{ color: T.muted, fontSize: 14, lineHeight: 1.65 }}>
              {metric.label}
            </span>
            <strong
              className="text-2xl font-medium tabular-nums min-[1000px]:text-[29px]"
              style={{ color: T.ink, fontWeight: 550, lineHeight: 1.65 }}
            >
              {metric.value}
            </strong>
            <span className="text-sm" style={{ color: T.muted, fontSize: 14, lineHeight: 1.65 }}>
              {metric.unit}
            </span>
          </span>
        ))}
      </section>

      {/* 今日目标独立行：0 0 30，窄屏 24，≥1000 40 */}
      <section
        data-testid="anki-goal"
        aria-label="今日目标"
        className="flex flex-wrap items-center gap-[12px] pb-[24px] text-sm min-[650px]:pb-[30px] min-[1000px]:pb-[40px]"
        style={{ color: T.muted }}
      >
        <span>
          今日目标{' '}
          <strong className="font-medium tabular-nums" style={{ color: T.ink }}>
            {done}
          </strong>{' '}
          / {goal}
        </span>
        <div
          className="h-1 w-[110px] overflow-hidden rounded-full bg-[#eef1f4]"
          role="progressbar"
          aria-label="今日目标进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={goalPct}
        >
          <div className="h-full rounded-full" style={{ width: `${goalPct}%`, background: T.accent }} />
        </div>
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center font-medium hover:opacity-80"
          style={{ color: T.accent }}
          onClick={onEditGoal}
        >
          调整目标
        </button>
      </section>

      <section data-testid="anki-collection" aria-label="卡片库">
        <div className="mb-[18px] flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-[21px] font-medium leading-[1.4]" style={{ color: T.ink, fontWeight: 580 }}>
            知识收藏
          </h2>
          <div className="flex items-center gap-4">
            <PillButton text onClick={onNewCard}>
              录入卡片
            </PillButton>
            <PillButton onClick={onNewDeck}>＋ 新建卡片库</PillButton>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-4 border-t py-[15px]"
          style={{ borderColor: T.line }}
        >
          <div className="flex flex-wrap gap-[22px]" role="group" aria-label="按分类筛选">
            {categories.map((categoryId) => {
              const label = categoryId === '全部' ? '全部' : (categoryName.get(categoryId) ?? categoryId);
              const active = categoryFilter === categoryId;
              return (
                <button
                  key={categoryId}
                  type="button"
                  aria-pressed={active}
                  className="min-h-11 py-[7px] text-sm"
                  style={{ color: active ? T.ink : T.muted, fontWeight: active ? 550 : 400 }}
                  onClick={() => setCategoryFilter(categoryId)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <label className="flex min-h-11 w-full max-w-[240px] items-center gap-2 text-sm" style={{ color: '#949aa2' }}>
            <input
              type="search"
              aria-label="搜索卡片库"
              placeholder="搜索卡片库"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full border-0 bg-transparent py-2 text-base outline-none placeholder:text-[#949aa2]"
            />
          </label>
        </div>

        <p className="mb-[12px] text-sm" style={{ color: T.muted }}>
          {visibleDecks.length} 个卡片库 · {visibleDecks.reduce((sum, deck) => sum + deck.total, 0)} 张卡片
        </p>

        {visibleDecks.length === 0 ? (
          <div className="py-12 text-center">
            <h3 className="text-lg font-medium" style={{ color: T.ink }}>
              还没有匹配的卡片库
            </h3>
            <p className="mt-2 text-sm" style={{ color: T.muted }}>
              {dashboard.decks.length === 0 ? '从一个明确的问题开始，先创建卡片库。' : '换个关键词，或创建新的卡片库。'}
            </p>
            <div className="mt-5 flex justify-center">
              <PillButton primary onClick={onNewDeck}>
                新建卡片库
              </PillButton>
            </div>
          </div>
        ) : (
          <ul>
            {visibleDecks.map((deck, idx) => {
              const pct = deck.total > 0 ? Math.round((deck.learned / deck.total) * 100) : 0;
              const glyph = glyphs[idx % glyphs.length];
              return (
                <li
                  key={deck.id}
                  className="grid grid-cols-[38px_minmax(0,1fr)] gap-[14px] border-b py-[20px] min-[650px]:gap-[21px] min-[1000px]:grid-cols-[45px_minmax(0,1fr)_170px_215px] min-[1000px]:gap-[24px] min-[1000px]:py-[26px]"
                  style={{ borderColor: T.line }}
                >
                  <span
                    className="grid h-[42px] w-[38px] place-items-center rounded-lg text-[19px] font-medium min-[1000px]:h-[47px] min-[1000px]:w-[42px]"
                    style={{ background: glyph.bg, color: glyph.fg, fontWeight: 550 }}
                  >
                    {deck.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <h3
                      className="flex flex-wrap items-baseline gap-3 text-[18px] font-medium leading-[1.5] min-[1000px]:text-[20px]"
                      style={{ color: T.ink, fontWeight: 560 }}
                    >
                      <button type="button" className="text-left" onClick={() => onOpenDeck(deck.id)}>
                        {deck.name}
                      </button>
                      <span className="text-sm font-normal" style={{ color: T.muted }}>
                        {categoryName.get(deck.categoryId) ?? '未分类'}
                      </span>
                    </h3>
                  </div>
                  <div className="col-start-2 text-sm min-[1000px]:col-auto">
                    <div className="mb-[9px] flex gap-[18px] text-sm" style={{ color: T.muted }}>
                      <span>{deck.total} 张卡片</span>
                      <span>{pct}% 已学</span>
                    </div>
                    <div
                      className="h-1 w-[125px] overflow-hidden rounded-full bg-[#eef1f4]"
                      role="progressbar"
                      aria-label={`${deck.name}已学覆盖率`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                    >
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: T.accent }} />
                    </div>
                    <small className="mt-[7px] block text-sm" style={{ color: T.muted }}>
                      已学 {deck.learned}/{deck.total} · 熟练 {deck.stable} · 待练 {deck.due}
                    </small>
                  </div>
                  <div className="col-start-2 flex flex-wrap items-center gap-[8px] min-[1000px]:col-auto min-[1000px]:justify-end min-[1000px]:gap-[10px]">
                    <PillButton text disabled={deck.total === 0} onClick={() => onBrowse(deck.id)}>
                      随机浏览
                    </PillButton>
                    <PillButton disabled={deck.due === 0} onClick={() => onStartPractice(deck.id)}>
                      {deck.due > 0 ? `练习 ${deck.due} 张` : '暂无到期'}
                    </PillButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <footer
          className="mt-[28px] flex flex-wrap items-center justify-between gap-3 text-sm"
          style={{ color: T.muted }}
        >
          <span>随机浏览随时可用，不影响你的复习安排。</span>
          <button
            type="button"
            className="font-medium hover:opacity-80"
            style={{ color: T.accent }}
            onClick={onOpenStats}
          >
            查看学习统计
          </button>
        </footer>
      </section>
    </div>
  );
}
