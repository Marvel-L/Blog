export interface LoveTask {
  id: string;
  text: string;
  note: string;
  createdOn: string;
  completedOn: string | null;
}
export interface LoveTaskState {
  version: 2;
  groups: LoveGroup[];
}
export interface LoveGroup {
  id: string;
  text: string;
  note: string;
  createdOn: string;
  tasks: LoveTask[];
}
export interface LoveTaskSnapshot {
  state: LoveTaskState | null;
  revision: number;
  updatedAt: string | null;
}
export const emptyLoveTasks = (): LoveTaskState => ({ version: 2, groups: [] });
export const loveTaskDay = (date: Date) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exactFields = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const validDay = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  value >= '1970-01-01' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const controlChars = (value: string, multiline = false) =>
  Array.from(value).some((char) => {
    const code = char.codePointAt(0)!;
    return (code < 32 && !(multiline && (code === 9 || code === 10 || code === 13))) || (code >= 127 && code <= 159);
  });
export const validLoveText = (value: unknown): value is string =>
  typeof value === 'string' &&
  value === value.trim() &&
  value.length > 0 &&
  Array.from(value).length <= 120 &&
  !controlChars(value);

const validRecord = (value: Record<string, unknown>, ids: Set<string>) => {
  if (
    typeof value.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id) ||
    ids.has(value.id.toLowerCase()) ||
    !validLoveText(value.text) ||
    typeof value.note !== 'string' ||
    Array.from(value.note).length > 2000 ||
    controlChars(value.note, true) ||
    !validDay(value.createdOn)
  )
    return false;
  ids.add(value.id.toLowerCase());
  return true;
};
const validTask = (task: unknown, ids: Set<string>) =>
  object(task) &&
  exactFields(task, ['id', 'text', 'note', 'createdOn', 'completedOn']) &&
  validRecord(task, ids) &&
  (task.completedOn === null || (validDay(task.completedOn) && task.completedOn >= (task.createdOn as string)));

/** Keep every legacy wish and completion; stable group IDs also survive a reload before the first v2 save. */
function migrateLegacy(tasks: LoveTask[]): LoveTaskState {
  const ids = new Set(tasks.map((task) => task.id.toLowerCase()));
  const groups: LoveGroup[] = [];
  let next = 0;
  for (let start = 0; start < tasks.length; start += 100) {
    let id: string;
    do {
      id = `00000000-0000-4000-8000-${(++next).toString(16).padStart(12, '0')}`;
    } while (ids.has(id));
    ids.add(id);
    const children = tasks.slice(start, start + 100);
    groups.push({
      id,
      text: groups.length ? `已记录的愿望 ${groups.length + 1}` : '已记录的愿望',
      note: '',
      createdOn: children.reduce((day, task) => (task.createdOn < day ? task.createdOn : day), children[0].createdOn),
      tasks: children,
    });
  }
  return { version: 2, groups };
}

export function parseLoveTaskSnapshot(raw: unknown): LoveTaskSnapshot {
  const invalid = () => new Error('必做清单格式异常，请重新加载');
  if (
    !object(raw) ||
    !Number.isSafeInteger(raw.revision) ||
    (raw.revision as number) < 0 ||
    (raw.updatedAt !== null && (typeof raw.updatedAt !== 'string' || !Number.isFinite(Date.parse(raw.updatedAt))))
  )
    throw invalid();
  const meta = { revision: raw.revision as number, updatedAt: raw.updatedAt as string | null };
  if (raw.state === null && raw.revision === 0 && raw.updatedAt === null) return { ...meta, state: null };
  const state = raw.state;
  if (!object(state)) throw invalid();
  const ids = new Set<string>();
  if (state.version === 1) {
    if (
      !exactFields(state, ['version', 'tasks']) ||
      !Array.isArray(state.tasks) ||
      state.tasks.length > 1000 ||
      !state.tasks.every((task) => validTask(task, ids))
    )
      throw invalid();
    return { ...meta, state: migrateLegacy(state.tasks as LoveTask[]) };
  }
  if (
    !exactFields(state, ['version', 'groups']) ||
    state.version !== 2 ||
    !Array.isArray(state.groups) ||
    state.groups.length > 1000
  )
    throw invalid();
  let total = 0;
  for (const group of state.groups) {
    if (
      !object(group) ||
      !exactFields(group, ['id', 'text', 'note', 'createdOn', 'tasks']) ||
      !validRecord(group, ids) ||
      !Array.isArray(group.tasks) ||
      group.tasks.length === 0 ||
      group.tasks.length > 100 ||
      !group.tasks.every((task) => validTask(task, ids))
    )
      throw invalid();
    total += group.tasks.length;
    if (total > 5000) throw invalid();
  }
  return { ...meta, state: state as unknown as LoveTaskState };
}

export function addLoveGroup(state: LoveTaskState, group: LoveGroup): LoveTaskState {
  if (state.groups.length >= 1000) throw new Error('清单最多保存 1000 个大事项，请先整理已有记录');
  return { ...state, groups: [group, ...state.groups] };
}
export function updateLoveGroup(state: LoveTaskState, group: LoveGroup): LoveTaskState {
  return { ...state, groups: state.groups.map((item) => (item.id === group.id ? group : item)) };
}
export function updateLoveTask(
  state: LoveTaskState,
  groupId: string,
  id: string,
  update: Partial<Pick<LoveTask, 'text' | 'note' | 'completedOn'>>,
): LoveTaskState {
  return {
    ...state,
    groups: state.groups.map((group) =>
      group.id === groupId
        ? { ...group, tasks: group.tasks.map((task) => (task.id === id ? { ...task, ...update } : task)) }
        : group,
    ),
  };
}
export function removeLoveGroup(state: LoveTaskState, id: string): LoveTaskState {
  return { ...state, groups: state.groups.filter((group) => group.id !== id) };
}
