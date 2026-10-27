export const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const tags = new Map<string, string>();
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) continue;
    const name = item.trim();
    const key = name.toLowerCase();
    if (!tags.has(key)) tags.set(key, name);
  }
  return [...tags.values()];
};

/** 逗号/换行分隔，允许“基础语法”这类多字标签；null=全部，空串=无标签。 */
export const parseTags = (value: string): string[] => normalizeTags(value.split(/[,，\n\r]+/));
export const matchesTag = (card: { tags?: string[] }, tag: string | null = null): boolean => {
  const tags = normalizeTags(card.tags);
  return (
    tag === null || (tag === '' ? tags.length === 0 : tags.some((name) => name.toLowerCase() === tag.toLowerCase()))
  );
};
