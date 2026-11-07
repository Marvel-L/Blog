export type Interest = 'want' | 'seen' | 'skip';
export interface ArticlePreference {
  postId: string;
  interest: Interest;
}
export interface ReadingEvent {
  id: string;
  postId: string;
  day: string;
  undone: boolean;
  previousInterest?: Interest;
}
export interface ReadingState {
  version: 2;
  preferences: ArticlePreference[];
  events: ReadingEvent[];
}
export interface ReadingSnapshot {
  state: ReadingState | null;
  revision: number;
  updatedAt: string | null;
}
export const emptyReadingState = (): ReadingState => ({ version: 2, preferences: [], events: [] });
export const readingDay = (date: Date) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (day: unknown): day is string =>
  typeof day === 'string' &&
  datePattern.test(day) &&
  day >= '1970-01-01' &&
  Number.isFinite(Date.parse(day)) &&
  new Date(day).toISOString().slice(0, 10) === day;
const validPostId = (id: unknown): id is string =>
  typeof id === 'string' &&
  id.length > 0 &&
  id.length <= 240 &&
  !/[\s/\\?#]/u.test(id) &&
  !Array.from(id).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

const isObject = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw);
const validInterest = (interest: unknown): interest is Interest =>
  interest === 'want' || interest === 'seen' || interest === 'skip';
const hasFields = (raw: Record<string, unknown>, keys: string[]) =>
  Object.keys(raw).length === keys.length && keys.every((key) => Object.hasOwn(raw, key));

/** Validate both contracts; normalize legacy schedules without losing reading history. */
export function parseReadingSnapshot(raw: unknown): ReadingSnapshot {
  const invalid = () => new Error('阅读记录格式异常，请重新加载');
  if (!isObject(raw) || typeof raw.revision !== 'number' || !Number.isSafeInteger(raw.revision) || raw.revision < 0)
    throw invalid();
  if (raw.updatedAt !== null && typeof raw.updatedAt !== 'string') throw invalid();
  const snapshot = { revision: raw.revision, updatedAt: raw.updatedAt };
  if (raw.state === null && raw.revision === 0) return { ...snapshot, state: null };
  const state = raw.state;
  if (
    !isObject(state) ||
    !hasFields(state, ['version', 'preferences', 'events']) ||
    (state.version !== 1 && state.version !== 2) ||
    !Array.isArray(state.preferences) ||
    !Array.isArray(state.events) ||
    state.preferences.length > 5000 ||
    state.events.length > 20000
  )
    throw invalid();
  const legacy = state.version === 1;
  const posts = new Set<string>();
  const ids = new Set<string>();
  const days = new Set<string>();
  for (const p of state.preferences) {
    if (
      !isObject(p) ||
      !hasFields(p, legacy ? ['postId', 'interest', 'reviewInterval', 'reviewFrom'] : ['postId', 'interest']) ||
      !validPostId(p.postId) ||
      posts.has(p.postId) ||
      (legacy
        ? !['none', 'want', 'skip'].includes(String(p.interest)) ||
          ![0, 7, 14, 30].includes(p.reviewInterval as number) ||
          (p.reviewInterval === 0 ? p.reviewFrom !== null : !validDay(p.reviewFrom))
        : !validInterest(p.interest))
    )
      throw invalid();
    posts.add(p.postId);
  }
  for (const e of state.events) {
    if (
      !isObject(e) ||
      !hasFields(e, [
        'id',
        'postId',
        'day',
        'undone',
        ...(!legacy && Object.hasOwn(e, 'previousInterest') ? ['previousInterest'] : []),
      ]) ||
      !validPostId(e.postId) ||
      !posts.has(e.postId) ||
      typeof e.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.id) ||
      ids.has(e.id.toLowerCase()) ||
      !validDay(e.day) ||
      typeof e.undone !== 'boolean' ||
      (!legacy && Object.hasOwn(e, 'previousInterest') && !validInterest(e.previousInterest))
    )
      throw invalid();
    const key = `${e.postId}:${e.day}`;
    if (!e.undone && days.has(key)) throw invalid();
    ids.add(e.id.toLowerCase());
    if (!e.undone) days.add(key);
  }
  if (!legacy) return { ...snapshot, state: state as unknown as ReadingState };
  const events = state.events as ReadingEvent[];
  const readPosts = new Set(events.filter((e) => !e.undone).map((e) => e.postId));
  return {
    ...snapshot,
    state: {
      version: 2,
      preferences: state.preferences.map((p) => ({
        postId: p.postId,
        interest: p.interest === 'skip' ? 'skip' : readPosts.has(p.postId) ? 'seen' : 'want',
      })),
      events,
    },
  };
}

export function preferenceFor(state: ReadingState, postId: string): ArticlePreference {
  return (
    state.preferences.find((p) => p.postId === postId) ?? {
      postId,
      interest: 'want',
    }
  );
}
export function setPreference(state: ReadingState, preference: ArticlePreference): ReadingState {
  if (state.preferences.find((p) => p.postId === preference.postId)?.interest === preference.interest) return state;
  if (state.preferences.length >= 5000 && !state.preferences.some((p) => p.postId === preference.postId))
    throw new Error('文章分类已达容量上限');
  return { ...state, preferences: [...state.preferences.filter((p) => p.postId !== preference.postId), preference] };
}
export function readingStats(state: ReadingState, postId: string, today: string) {
  const events = state.events
    .filter((e) => e.postId === postId && !e.undone)
    .sort((a, b) => b.day.localeCompare(a.day));
  const lastDay = events[0]?.day ?? null;
  const completedToday = events.find((e) => e.day === today) ?? null;
  return { count: events.length, lastDay, completedToday };
}
export function recordReading(state: ReadingState, postId: string, today: string, eventId: string): ReadingState {
  if (readingStats(state, postId, today).completedToday) return state;
  if (state.events.length >= 20000) throw new Error('阅读记录已达容量上限');
  const previous = preferenceFor(state, postId);
  const next = setPreference(state, { postId, interest: 'seen' });
  return {
    ...next,
    events: [...next.events, { id: eventId, postId, day: today, undone: false, previousInterest: previous.interest }],
  };
}
export function undoReading(state: ReadingState, eventId: string): ReadingState {
  const event = state.events.find((e) => e.id === eventId && !e.undone);
  if (!event) return state;
  let next = { ...state, events: state.events.map((e) => (e.id === eventId ? { ...e, undone: true } : e)) };
  const newerRead = state.events.some((e) => e.postId === event.postId && !e.undone && e.day > event.day);
  if (!newerRead && preferenceFor(state, event.postId).interest === 'seen') {
    const remaining = next.events.some((e) => e.postId === event.postId && !e.undone);
    next = setPreference(next, {
      postId: event.postId,
      interest: event.previousInterest ?? (remaining ? 'seen' : 'want'),
    });
  }
  return next;
}
export function indexReadingStats(state: ReadingState, today: string) {
  const groups = new Map<string, ReadingEvent[]>();
  for (const event of state.events) {
    const group = groups.get(event.postId) ?? [];
    group.push(event);
    groups.set(event.postId, group);
  }
  return new Map(
    state.preferences.map((p) => [
      p.postId,
      readingStats(
        {
          version: 2,
          preferences: [p],
          events: groups.get(p.postId) ?? [],
        },
        p.postId,
        today,
      ),
    ]),
  );
}
