/** 墓碑是归档分类，记事通过 categoryId 归入对应墓碑。 */
export interface ConfessionCategory {
  /** 服务端校验的 UUID，不接受客户端账号标识。 */
  id: string;
  name: string;
}
export interface ConfessionEntry {
  /** 创建时生成的 UUID，重试保留以避免重复记录。 */
  id: string;
  categoryId: string;
  content: string;
  createdAt: string;
}
export interface ConfessionState {
  version: 1;
  categories: ConfessionCategory[];
  entries: ConfessionEntry[];
}
export interface ConfessionSnapshot {
  state: ConfessionState | null;
  revision: number;
}
export const DEFAULT_CATEGORIES: ConfessionCategory[] = [
  { id: '10000000-0000-4000-8000-000000000001', name: '放弃' },
  { id: '10000000-0000-4000-8000-000000000002', name: '失败' },
  { id: '10000000-0000-4000-8000-000000000003', name: '贪吃' },
  { id: '10000000-0000-4000-8000-000000000004', name: '暴怒' },
];
export const emptyConfession = (): ConfessionState => ({
  version: 1,
  categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })),
  entries: [],
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hasControl = (text: string, multiline = false) =>
  [...text].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (code < 32 || (code >= 127 && code <= 159)) && !(multiline && ['\n', '\r', '\t'].includes(character));
  });
export const validCategoryName = (name: string) =>
  name === name.trim() && [...name].length >= 1 && [...name].length <= 24 && !hasControl(name);
export function parseConfession(value: unknown): ConfessionState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Record<string, unknown>;
  if (
    state.version !== 1 ||
    !Array.isArray(state.categories) ||
    !Array.isArray(state.entries) ||
    state.categories.length > 100 ||
    state.entries.length > 2000
  )
    return null;
  const ids = new Set<string>();
  const names = new Set<string>();
  const categories: ConfessionCategory[] = [];
  for (const raw of state.categories) {
    if (!raw || typeof raw !== 'object') return null;
    const category = raw as Record<string, unknown>;
    if (
      typeof category.id !== 'string' ||
      !uuid.test(category.id) ||
      ids.has(category.id.toLowerCase()) ||
      typeof category.name !== 'string' ||
      !validCategoryName(category.name) ||
      names.has(category.name)
    )
      return null;
    ids.add(category.id.toLowerCase());
    names.add(category.name);
    categories.push({ id: category.id.toLowerCase(), name: category.name });
  }
  const categoryIds = new Set(ids);
  const entries: ConfessionEntry[] = [];
  for (const raw of state.entries) {
    if (!raw || typeof raw !== 'object') return null;
    const entry = raw as Record<string, unknown>;
    if (
      typeof entry.id !== 'string' ||
      !uuid.test(entry.id) ||
      ids.has(entry.id.toLowerCase()) ||
      typeof entry.categoryId !== 'string' ||
      !categoryIds.has(entry.categoryId.toLowerCase()) ||
      typeof entry.content !== 'string' ||
      !entry.content.trim() ||
      [...entry.content].length > 10000 ||
      hasControl(entry.content, true) ||
      typeof entry.createdAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/.test(entry.createdAt) ||
      !Number.isFinite(Date.parse(entry.createdAt))
    )
      return null;
    ids.add(entry.id.toLowerCase());
    entries.push({
      id: entry.id.toLowerCase(),
      categoryId: entry.categoryId.toLowerCase(),
      content: entry.content,
      createdAt: entry.createdAt,
    });
  }
  return { version: 1, categories, entries };
}
