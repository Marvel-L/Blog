// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolvePostDates, isGitCalendarDate } from './git-file-dates.mjs';

describe('isGitCalendarDate', () => {
  it('接受 YYYY-MM-DD', () => {
    expect(isGitCalendarDate('2026-08-05')).toBe(true);
  });

  it('拒绝非法格式', () => {
    expect(isGitCalendarDate('2026/08/05')).toBe(false);
    expect(isGitCalendarDate('')).toBe(false);
    expect(isGitCalendarDate(undefined)).toBe(false);
  });
});

describe('resolvePostDates', () => {
  it('优先使用合法的 front matter 日期', () => {
    const result = resolvePostDates({
      frontmatterDate: '2024-01-01',
      frontmatterUpdatedAt: '2024-06-01',
      gitCreated: '2025-01-01',
      gitUpdated: '2025-06-01',
      today: '2026-09-10',
    });
    expect(result).toEqual({
      date: '2024-01-01',
      updatedAt: '2024-06-01',
      dateSource: 'frontmatter',
      updatedAtSource: 'frontmatter',
    });
  });

  it('缺省时回退到 Git 日期', () => {
    const result = resolvePostDates({
      gitCreated: '2025-03-01',
      gitUpdated: '2025-08-20',
      today: '2026-09-10',
    });
    expect(result).toEqual({
      date: '2025-03-01',
      updatedAt: '2025-08-20',
      dateSource: 'git',
      updatedAtSource: 'git',
    });
  });

  it('无 Git 时回退到 today，updatedAt 跟随 date', () => {
    const result = resolvePostDates({
      today: '2026-09-10',
    });
    expect(result).toEqual({
      date: '2026-09-10',
      updatedAt: '2026-09-10',
      dateSource: 'fallback',
      updatedAtSource: 'fallback',
    });
  });

  it('仅有 date 手写、updatedAt 缺省时用 Git updated', () => {
    const result = resolvePostDates({
      frontmatterDate: '2024-01-01',
      gitCreated: '2020-01-01',
      gitUpdated: '2025-12-01',
      today: '2026-09-10',
    });
    expect(result.date).toBe('2024-01-01');
    expect(result.dateSource).toBe('frontmatter');
    expect(result.updatedAt).toBe('2025-12-01');
    expect(result.updatedAtSource).toBe('git');
  });

  it('保证 updatedAt >= date（异常颠倒时抬升）', () => {
    const result = resolvePostDates({
      frontmatterDate: '2026-08-01',
      frontmatterUpdatedAt: '2026-01-01',
      today: '2026-09-10',
    });
    expect(result.date).toBe('2026-08-01');
    expect(result.updatedAt).toBe('2026-08-01');
    expect(result.updatedAtSource).toBe('clamped');
  });

  it('非法手写日期视为缺省并走 Git', () => {
    const result = resolvePostDates({
      frontmatterDate: 'not-a-date',
      frontmatterUpdatedAt: 'also-bad',
      gitCreated: '2025-02-02',
      gitUpdated: '2025-03-03',
      today: '2026-09-10',
    });
    expect(result.date).toBe('2025-02-02');
    expect(result.updatedAt).toBe('2025-03-03');
    expect(result.dateSource).toBe('git');
    expect(result.updatedAtSource).toBe('git');
  });
});
