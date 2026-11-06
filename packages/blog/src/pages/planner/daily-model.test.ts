import { describe, expect, it } from 'vitest';
import { dailyTasksFor, parseDailyState, shiftDate, validDate, type DailyTask } from './daily-model';

const task: DailyTask = {
  id: 'a',
  text: '跟进',
  note: '',
  date: '2026-11-06',
  priority: 'normal',
  scheduledFor: null,
  completedOn: null,
};
describe('每日遗留模型', () => {
  it('保留来源日期，跨日查看未完成记录，按完成日期归档', () => {
    const state = parseDailyState(
      JSON.stringify({ version: 1, tasks: [task, { ...task, id: 'done', completedOn: '2026-11-07' }] }),
    );
    expect(dailyTasksFor(state, '2026-11-06', 'open')).toHaveLength(2);
    expect(dailyTasksFor(state, '2026-11-07', 'open').map((entry) => entry.id)).toEqual(['a']);
    expect(dailyTasksFor(state, '2026-11-07', 'done').map((entry) => entry.id)).toEqual(['done']);
    expect(dailyTasksFor(state, '2026-11-07', 'recorded')).toHaveLength(0);
  });
  it('验证真实日历日期与排期边界', () => {
    expect(validDate('2026-02-30')).toBe(false);
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    for (const invalid of [
      { ...task, date: '2026-02-30' },
      { ...task, scheduledFor: '2026-11-05' },
      { ...task, completedOn: '2026-11-05' },
      { ...task, user_id: 'other' },
    ]) {
      expect(() => parseDailyState(JSON.stringify({ version: 1, tasks: [invalid] }))).toThrow();
    }
  });
});
