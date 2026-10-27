/**
 * Anki 云端记忆卡片 API 层。
 *
 * 基线契约由后端（Go）权威实现，本文件只做类型化封装与错误如实反馈：
 * - 所有调度结果（dueAt / 间隔 / 算法）都以服务端响应为准，客户端不另算正式排期；
 * - 401 视为未登录，由页面展示登录门；其余失败原样反馈，不假装成功；
 * - 复习提交携带 mutationId（同一张卡同一次评价复用，服务端幂等去重）与 card version（乐观并发）。
 *
 * 端点约定（cloudRequest 统一前缀 /api/v1，同源凭据、no-store）：
 *   GET    /anki/dashboard                 分类、库摘要、目标、今日与历史
 *   POST   /anki/categories                { name } => category
 *   POST   /anki/decks                     { categoryId, name } => deck
 *   GET    /anki/decks/{deckId}/cards      库内全部卡片
 *   POST   /anki/decks/{deckId}/cards      { question, answer } => card
 *   PATCH  /anki/cards/{cardId}            { question, answer, resetProgress, version } => card
 *   GET    /anki/decks/{deckId}/queue      到期队列（服务端快照）
 *   POST   /anki/reviews                   { cardId, version, mutationId, rating?, customDays? } => { card }
 *   PUT    /anki/goal                      { goal } => { goal }
 */
import { cloudRequest } from '@/cloud/api';

export const ANKI_SYNC_EVENT = 'dblog-anki-sync';
export interface AnkiSyncEvent {
  id: number;
  path: string;
  write: boolean;
  phase: 'pending' | 'success' | 'error' | 'cancelled';
  at?: number;
  message?: string;
}
let syncRequestId = 0;
function emitSync(detail: AnkiSyncEvent) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ANKI_SYNC_EVENT, { detail }));
}

/** 成功时间是本浏览器收到云端确认的时间，不冒充数据库写入时间；不保存卡片到本机。 */
async function ankiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const event = { id: ++syncRequestId, path, write: Boolean(init.method && init.method !== 'GET') };
  emitSync({ ...event, phase: 'pending' });
  try {
    const data = await cloudRequest<T>(path, {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)]) : undefined,
    });
    emitSync({ ...event, phase: init.signal?.aborted ? 'cancelled' : 'success', at: Date.now() });
    return data;
  } catch (cause) {
    emitSync({
      ...event,
      phase: init.signal?.aborted ? 'cancelled' : 'error',
      message: cause instanceof Error ? cause.message : '云端同步失败，请重试',
    });
    throw cause;
  }
}

export interface AnkiCategory {
  id: string;
  name: string;
}

export interface AnkiDeckSummary {
  id: string;
  categoryId: string;
  name: string;
  total: number;
  learned: number;
  stable: number;
  due: number;
}

export interface AnkiDayStat {
  date: string;
  uniqueCards: number;
  reviews: number;
  goal: number;
}

/** dashboard.today 后端精确形态可能是数字或当日对象，这里做一次兼容归一。 */
export interface AnkiDashboard {
  categories: AnkiCategory[];
  decks: AnkiDeckSummary[];
  goal: number;
  today: unknown;
  timeZone: string;
  history: AnkiDayStat[];
}

export interface AnkiCard {
  id: string;
  deckId: string;
  question: string;
  answer: string;
  dueAt: string;
  intervalDays: number;
  repetitions: number;
  easeFactor: number;
  reviewCount: number;
  version: number;
}

export type AnkiRating = 'wrong' | 'hard' | 'correct';

export interface AnkiQueueResponse {
  cards: AnkiCard[];
  serverNow: string;
  /** 后端可能按卡给出各评分的预览间隔（天数），供「显示下次间隔」开关使用；缺省即不展示。 */
  previews?: unknown;
}

export interface AnkiReviewResponse {
  card: AnkiCard;
}

export interface AnkiReviewRequest {
  cardId: string;
  version: number;
  mutationId: string;
  rating?: AnkiRating;
  customDays?: number;
}

const NUMBER = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const STRING_ARRAY = (value: unknown): AnkiCategory[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({ id: String(item.id ?? ''), name: String(item.name ?? '') }))
        .filter((item) => item.id)
    : [];

function normalizeDashboard(raw: AnkiDashboard): AnkiDashboard & { todayCards: number } {
  const decks = Array.isArray(raw.decks)
    ? raw.decks
        .filter((item): item is AnkiDeckSummary => Boolean(item) && typeof item === 'object')
        .map((deck) => ({
          id: String(deck.id ?? ''),
          categoryId: String(deck.categoryId ?? ''),
          name: String(deck.name ?? ''),
          total: NUMBER(deck.total),
          learned: NUMBER(deck.learned),
          stable: NUMBER(deck.stable),
          due: NUMBER(deck.due),
        }))
        .filter((deck) => deck.id)
    : [];

  const history = Array.isArray(raw.history)
    ? raw.history
        .filter((item): item is AnkiDayStat => Boolean(item) && typeof item === 'object')
        .map((day) => ({
          date: String(day.date ?? ''),
          uniqueCards: NUMBER(day.uniqueCards),
          reviews: NUMBER(day.reviews),
          goal: NUMBER(day.goal, NUMBER(raw.goal, 12)),
        }))
        .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date))
    : [];

  let todayCards = 0;
  if (typeof raw.today === 'number') {
    todayCards = raw.today;
  } else if (raw.today && typeof raw.today === 'object') {
    todayCards = NUMBER((raw.today as { uniqueCards?: unknown }).uniqueCards);
  }
  // 兜底：history 最后一条即今天（上海自然日），用其 uniqueCards。
  if (todayCards === 0) {
    const last = history[history.length - 1];
    if (last && raw.timeZone === 'Asia/Shanghai') todayCards = last.uniqueCards;
  }

  return {
    categories: STRING_ARRAY(raw.categories),
    decks,
    goal: NUMBER(raw.goal, 12),
    today: raw.today,
    timeZone: typeof raw.timeZone === 'string' ? raw.timeZone : 'Asia/Shanghai',
    history,
    todayCards,
  };
}

export type NormalizedDashboard = ReturnType<typeof normalizeDashboard>;

const normalizeCard = (raw: Record<string, unknown>): AnkiCard => ({
  id: String(raw.id ?? ''),
  deckId: String(raw.deckId ?? ''),
  question: String(raw.question ?? ''),
  answer: String(raw.answer ?? ''),
  dueAt: String(raw.dueAt ?? ''),
  intervalDays: NUMBER(raw.intervalDays),
  repetitions: NUMBER(raw.repetitions),
  easeFactor: NUMBER(raw.easeFactor),
  reviewCount: NUMBER(raw.reviewCount),
  version: NUMBER(raw.version),
});

const normalizeCardList = (raw: unknown): AnkiCard[] => {
  if (!Array.isArray(raw)) return [];
  const out: AnkiCard[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const card = normalizeCard(item as Record<string, unknown>);
    if (card.id) out.push(card);
  }
  return out;
};

/** 401 时 cloudRequest 抛出此文案；页面据此展示登录门而非网络错误。 */
export const UNAUTHORIZED_MESSAGE = '登录已失效，请重新登录';

export const isUnauthorized = (error: unknown): boolean =>
  error instanceof Error && error.message === UNAUTHORIZED_MESSAGE;

export const fetchDashboard = (signal?: AbortSignal) =>
  ankiRequest<AnkiDashboard>('/anki/dashboard', { signal }).then(normalizeDashboard);

export const createCategory = (name: string, signal?: AbortSignal) =>
  ankiRequest<AnkiCategory>('/anki/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
    signal,
  });

export const createDeck = (categoryId: string, name: string, signal?: AbortSignal) =>
  ankiRequest<AnkiDeckSummary>('/anki/decks', {
    method: 'POST',
    body: JSON.stringify({ categoryId, name }),
    signal,
  });

export const fetchDeckCards = (deckId: string, signal?: AbortSignal) =>
  ankiRequest<{ cards: unknown }>(`/anki/decks/${encodeURIComponent(deckId)}/cards`, { signal }).then((data) =>
    normalizeCardList(data.cards),
  );

export const createCard = (deckId: string, question: string, answer: string, signal?: AbortSignal) =>
  ankiRequest<AnkiCard>(`/anki/decks/${encodeURIComponent(deckId)}/cards`, {
    method: 'POST',
    body: JSON.stringify({ question, answer }),
    signal,
  }).then((card) => normalizeCard(card as unknown as Record<string, unknown>));

export interface UpdateCardPatch {
  deckId?: string;
  question: string;
  answer: string;
  resetProgress: boolean;
  version: number;
}

export const updateCard = (cardId: string, patch: UpdateCardPatch, signal?: AbortSignal) =>
  ankiRequest<AnkiCard>(`/anki/cards/${encodeURIComponent(cardId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
    signal,
  }).then((card) => normalizeCard(card as unknown as Record<string, unknown>));

export const fetchDeckQueue = (deckId: string, signal?: AbortSignal) =>
  ankiRequest<{ cards: unknown; serverNow?: string; previews?: unknown }>(
    `/anki/decks/${encodeURIComponent(deckId)}/queue`,
    { signal },
  ).then((data) => ({
    cards: normalizeCardList(data.cards),
    serverNow: typeof data.serverNow === 'string' ? data.serverNow : '',
    previews: data.previews,
  }));

export const submitReview = (body: AnkiReviewRequest, signal?: AbortSignal) =>
  ankiRequest<{ card: unknown }>('/anki/reviews', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  }).then((data) => normalizeCard(data.card as Record<string, unknown>));

export const updateGoal = (goal: number, signal?: AbortSignal) =>
  ankiRequest<{ goal: number }>('/anki/goal', {
    method: 'PUT',
    body: JSON.stringify({ goal }),
    signal,
  });

/** 生成复习评价幂等键：同一张卡同一次「评价尝试」复用，双击/重试不会产生两条记录。 */
export const newMutationId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `rev-${Date.now()}-${Math.random()}`;

export interface ReviewPreview {
  /** 错误/再学：分钟数（SM2 初学步，当前为 10 分钟）。 */
  againMinutes?: number;
  /** 本次 hard 与 correct 共用的下次间隔（天数）；两者 EF 差异影响未来，不在前端展示。 */
  nextDays?: number;
}

/**
 * 读取队列预览间隔（后端可选下发）：
 * 形状为 { [cardId]: { againMinutes, nextDays } }。
 * 缺省时返回 null，客户端不自行推算间隔。
 */
export const readReviewPreview = (previews: unknown, cardId: string): ReviewPreview | null => {
  if (!previews || typeof previews !== 'object') return null;
  const record = previews as Record<string, unknown>;
  const byCard =
    typeof record[cardId] === 'object' && record[cardId] !== null
      ? (record[cardId] as Record<string, unknown>)
      : record;
  const pick = (key: string): number | undefined =>
    typeof byCard[key] === 'number' ? (byCard[key] as number) : undefined;
  const preview: ReviewPreview = {
    againMinutes: pick('againMinutes'),
    nextDays: pick('nextDays'),
  };
  if (preview.againMinutes === undefined && preview.nextDays === undefined) return null;
  return preview;
};
