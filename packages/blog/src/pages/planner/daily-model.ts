import type { TaskPriority } from './model';

export type DailyTask = {
  id: string;
  text: string;
  date: string;
  note: string;
  priority: TaskPriority;
  scheduledFor: string | null;
  completedOn: string | null;
};
export type DailyPlannerState = { version: 1; tasks: DailyTask[] };
export const emptyDailyState = (): DailyPlannerState => ({ version: 1, tasks: [] });
export const dailyDraftKey = (id: string) => `d-blog-daily-planner-sync-v1:${id}`;
export const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const validDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) < '1970') return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && dateKey(date) === value;
};
export const shiftDate = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  const key = dateKey(date);
  return validDate(key) ? key : value;
};
export const parseDailyState = (raw: string): DailyPlannerState => {
  const value = JSON.parse(raw) as DailyPlannerState;
  if (
    !value ||
    value.version !== 1 ||
    Object.keys(value).length !== 2 ||
    !Array.isArray(value.tasks) ||
    value.tasks.length > 1000
  )
    throw new Error('每日遗留数据格式无效');
  const seen = new Set<string>();
  for (const task of value.tasks) {
    if (
      !task ||
      Object.keys(task).length !== 7 ||
      !['id', 'text', 'date', 'note', 'priority', 'scheduledFor', 'completedOn'].every((key) =>
        Object.hasOwn(task, key),
      ) ||
      typeof task.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(task.id) ||
      seen.has(task.id) ||
      typeof task.text !== 'string' ||
      !task.text.trim() ||
      task.text.length > 500 ||
      typeof task.note !== 'string' ||
      task.note.length > 1000 ||
      !['normal', 'high'].includes(task.priority) ||
      !validDate(task.date) ||
      (task.scheduledFor !== null && (!validDate(task.scheduledFor) || task.scheduledFor < task.date)) ||
      (task.completedOn !== null && (!validDate(task.completedOn) || task.completedOn < task.date))
    )
      throw new Error('每日遗留任务格式无效');
    seen.add(task.id);
  }
  return {
    version: 1,
    tasks: value.tasks.map((task) => ({ ...task, text: task.text.trim(), note: task.note.trim() })),
  };
};
export const dailyTasksFor = (state: DailyPlannerState, day: string, filter: 'open' | 'recorded' | 'done') =>
  state.tasks.filter((task) =>
    filter === 'done'
      ? task.completedOn === day
      : filter === 'recorded'
        ? task.date === day
        : task.date <= day && (!task.completedOn || task.completedOn > day),
  );
