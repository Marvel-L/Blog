import { describe, expect, it } from 'vitest';
import { emptyConfession, parseConfession, validCategoryName } from './model';
describe('private confession archive', () => {
  it('starts with four categories and never fabricated personal entries', () => {
    expect(emptyConfession().categories.map((category) => category.name)).toEqual(['放弃', '失败', '贪吃', '暴怒']);
    expect(emptyConfession().entries).toEqual([]);
    expect(parseConfession(emptyConfession())).toEqual(emptyConfession());
  });
  it('rejects missing categories, duplicates, invalid timestamps and oversized private text', () => {
    const state = emptyConfession();
    const entry = {
      id: '20000000-0000-4000-8000-000000000001',
      categoryId: state.categories[0].id,
      content: '今天放弃了阅读\n想再试一次',
      createdAt: '2026-11-08T12:00:00.000Z',
    };
    expect(parseConfession({ ...state, entries: [entry] })?.entries).toEqual([entry]);
    for (const invalid of [
      { ...state, entries: [{ ...entry, categoryId: entry.id }] },
      { ...state, entries: [entry, entry] },
      { ...state, categories: [...state.categories, state.categories[0]] },
      { ...state, entries: [{ ...entry, createdAt: 'today' }] },
      { ...state, entries: [{ ...entry, content: 'x'.repeat(10001) }] },
      { ...state, entries: [{ ...entry, content: '\u0000' }] },
    ])
      expect(parseConfession(invalid)).toBeNull();
    expect(validCategoryName(' 放弃')).toBe(false);
    expect(validCategoryName('')).toBe(false);
  });
});
