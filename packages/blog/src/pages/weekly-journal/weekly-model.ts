export const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;
export const JOURNAL_TEMPLATE =
  '### 今日完成\n\n- \n\n### 学习与链接\n\n- \n\n### 遗留问题\n\n- \n\n### 生活与感想\n\n';

export interface DailyThought {
  id: string;
  content: string;
  createdAt: string;
}
export interface JournalDay {
  date: string;
  content: string;
  thoughts: DailyThought[];
}
export interface WeeklyState {
  version: 1;
  days: JournalDay[];
}
export interface WeeklyArchive {
  state: WeeklyState | null;
  revision: number;
  updatedAt: string | null;
}

export function validJournalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const date = new Date(`${value}T00:00:00Z`);
  return year >= 1900 && year <= 2100 && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function mondayOf(value: string): string {
  if (!validJournalDate(value)) throw new Error('请选择有效日期');
  const date = new Date(`${value}T00:00:00Z`);
  return shiftDate(value, -((date.getUTCDay() + 6) % 7));
}

export function emptyWeek(week: string): WeeklyState {
  return {
    version: 1,
    days: WEEKDAYS.map((_, index) => ({ date: shiftDate(week, index), content: '', thoughts: [] })),
  };
}

export function shanghaiDate(now: Date): string {
  // UTC getters after a fixed offset avoid host locale and DST.
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function thoughtTime(createdAt: string): string {
  return new Date(new Date(createdAt).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

export function parseWeeklyState(value: unknown, week: string): WeeklyState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as WeeklyState;
  if (state.version !== 1 || !Array.isArray(state.days) || state.days.length !== 7) return null;
  const ids = new Set<string>();
  for (const [index, day] of state.days.entries()) {
    if (
      !day ||
      day.date !== shiftDate(week, index) ||
      typeof day.content !== 'string' ||
      [...day.content].length > 20000 ||
      !Array.isArray(day.thoughts) ||
      day.thoughts.length > 100
    )
      return null;
    for (const thought of day.thoughts) {
      if (
        !thought ||
        typeof thought.id !== 'string' ||
        !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(thought.id) ||
        ids.has(thought.id.toLowerCase()) ||
        typeof thought.content !== 'string' ||
        !thought.content.trim() ||
        [...thought.content].length > 5000 ||
        typeof thought.createdAt !== 'string' ||
        Number.isNaN(new Date(thought.createdAt).getTime())
      )
        return null;
      ids.add(thought.id.toLowerCase());
    }
  }
  return state;
}
