import { describe, expect, it } from 'vitest';
import {
  emptyWeek,
  mondayOf,
  parseWeeklyState,
  shanghaiDate,
  shiftDate,
  thoughtTime,
  validJournalDate,
} from './weekly-model';

describe('周记日期', () => {
  it('周一至周日归同一周，跨年和闰年不受宿主时区影响', () => {
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(mondayOf('2026-01-04')).toBe('2025-12-29');
    expect(shiftDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(emptyWeek('2025-12-29').days.map((day) => day.date)).toEqual([
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);
  });
  it('拒绝非法日期，并按北京时间区分零点', () => {
    for (const value of ['', '2026-02-30', '2026-1-1', '1899-01-01', '2101-01-01'])
      expect(validJournalDate(value)).toBe(false);
    expect(shanghaiDate(new Date('2026-11-11T15:59:59Z'))).toBe('2026-11-11');
    expect(shanghaiDate(new Date('2026-11-11T16:00:00Z'))).toBe('2026-11-12');
    expect(thoughtTime('2026-11-12T01:30:00Z')).toBe('09:30');
  });
  it('解析时拒绝串周、损坏数据和重复随想ID', () => {
    const state = emptyWeek('2026-11-09');
    expect(parseWeeklyState(state, '2026-11-09')).toEqual(state);
    expect(parseWeeklyState(state, '2026-11-16')).toBeNull();
    expect(parseWeeklyState({ ...state, days: null }, '2026-11-09')).toBeNull();
    const thought = { id: '11111111-1111-4111-8111-111111111111', content: '想法', createdAt: '2026-11-12T01:30:00Z' };
    state.days[0].thoughts = [thought, thought];
    expect(parseWeeklyState(state, '2026-11-09')).toBeNull();
  });
});
