export type MonthlyTask = {
  id: string;
  text: string;
  completed: boolean;
};

export type MonthlyPlannerState = {
  version: 1;
  months: Record<string, MonthlyTask[]>;
};

export const PLANNER_STORAGE_KEY = 'd-blog-monthly-planner-v1';
export const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;
export const emptyPlannerState = (): MonthlyPlannerState => ({ version: 1, months: {} });

const MONTH_KEY = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const TASK_ID = /^[A-Za-z0-9_-]{1,120}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parsePlannerState = (raw: string): MonthlyPlannerState => {
  const value: unknown = JSON.parse(raw);
  if (!isObject(value) || value.version !== 1 || !isObject(value.months) || Object.keys(value).length !== 2) {
    throw new Error('月度计划数据格式不正确');
  }
  const entries = Object.entries(value.months);
  if (entries.length > 120) throw new Error('月度计划最多保存 120 个月');
  const months: Record<string, MonthlyTask[]> = {};
  for (const [key, tasks] of entries) {
    const year = Number(key.slice(0, 4));
    if (!MONTH_KEY.test(key) || year < 1970 || !Array.isArray(tasks) || tasks.length > 300) {
      throw new Error('月度计划月份或任务数量无效');
    }
    const seen = new Set<string>();
    months[key] = tasks.map((task) => {
      if (
        !isObject(task) ||
        Object.keys(task).length !== 3 ||
        typeof task.id !== 'string' ||
        !TASK_ID.test(task.id) ||
        seen.has(task.id) ||
        typeof task.text !== 'string' ||
        task.text.length > 500 ||
        !task.text.trim() ||
        typeof task.completed !== 'boolean'
      ) {
        throw new Error('月度计划任务格式无效');
      }
      seen.add(task.id);
      return { id: task.id, text: task.text.trim(), completed: task.completed };
    });
  }
  return { version: 1, months };
};

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

export const samePlannerData = (a: MonthlyPlannerState | null, b: MonthlyPlannerState | null) =>
  canonical(a?.months ?? null) === canonical(b?.months ?? null);

export type TaskProgress = { year: number; month: number; quarter: number };

const completionRate = (tasks: MonthlyTask[]) => {
  if (tasks.length === 0) return 0;
  return (tasks.filter((task) => task.completed).length / tasks.length) * 100;
};

export const taskProgress = (state: MonthlyPlannerState, year: number, month: number): TaskProgress => {
  const selectedMonth = Math.max(1, Math.min(12, month));
  const quarterStart = Math.floor((selectedMonth - 1) / 3) * 3 + 1;
  const collect = (months: number[]) => months.flatMap((value) => state.months[monthKey(year, value)] ?? []);
  return {
    year: completionRate(collect(Array.from({ length: 12 }, (_, index) => index + 1))),
    month: completionRate(collect([selectedMonth])),
    quarter: completionRate(collect([quarterStart, quarterStart + 1, quarterStart + 2])),
  };
};
