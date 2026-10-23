import { describe, expect, it } from 'vitest';
import { parsePlannerMarkdown, plannerToMarkdown } from './markdown';
import { emptyPlannerState, monthKey, parsePlannerState, samePlannerData, taskProgress } from './model';

describe('月度计划模型', () => {
  it('Markdown 往返保留月份、顺序、完成状态和稳定 ID', () => {
    const markdown = `# Monthly Planner\n\n## 2026-10\n\n- [ ] 发布月度规划 <!-- id:publish -->\n- [x] 完成接口测试 <!-- id:test -->\n\n## 2027-01\n\n- [ ] 新年规划\n`;
    const state = parsePlannerMarkdown(markdown);
    expect(state.months['2026-10']).toEqual([
      { id: 'publish', text: '发布月度规划', completed: false },
      { id: 'test', text: '完成接口测试', completed: true },
    ]);
    const reparsed = parsePlannerMarkdown(plannerToMarkdown(state));
    expect(reparsed).toEqual(state);
    expect(reparsed.months['2027-01'][0].id).toMatch(/^md-/);
  });

  it('拒绝未知行、重复 ID 和越界结构', () => {
    expect(() => parsePlannerMarkdown('## 2026-10\nnot a task')).toThrow('无法识别');
    expect(() =>
      parsePlannerState(
        JSON.stringify({
          version: 1,
          months: {
            '2026-10': [
              { id: 'same', text: '一', completed: false },
              { id: 'same', text: '二', completed: false },
            ],
          },
        }),
      ),
    ).toThrow('任务格式无效');
    expect(monthKey(2026, 3)).toBe('2026-03');
    expect(plannerToMarkdown(emptyPlannerState())).toContain('# Monthly Planner');
    const first = parsePlannerState(
      JSON.stringify({
        version: 1,
        months: { '2026-10': [{ id: 'a', text: '任务', completed: false }], '2026-09': [] },
      }),
    );
    const second = parsePlannerState(
      JSON.stringify({
        months: { '2026-09': [], '2026-10': [{ completed: false, text: '任务', id: 'a' }] },
        version: 1,
      }),
    );
    expect(samePlannerData(first, second)).toBe(true);
  });

  it('按月、季度和年份的任务完成率计算 Charge，无任务为 0%', () => {
    expect(taskProgress(emptyPlannerState(), 2026, 10)).toEqual({ year: 0, month: 0, quarter: 0 });
    const state = parsePlannerState(
      JSON.stringify({
        version: 1,
        months: {
          '2026-01': [
            { id: 'jan-1', text: '一月已完成', completed: true },
            { id: 'jan-2', text: '一月未完成', completed: false },
          ],
          '2026-10': [
            { id: 'oct-1', text: '十月已完成', completed: true },
            { id: 'oct-2', text: '十月已完成二', completed: true },
          ],
          '2026-11': [{ id: 'nov-1', text: '十一月未完成', completed: false }],
        },
      }),
    );
    const progress = taskProgress(state, 2026, 10);
    expect(progress.month).toBe(100);
    expect(progress.quarter).toBeCloseTo(200 / 3);
    expect(progress.year).toBe(60);
  });
});
