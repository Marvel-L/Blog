import { describe, expect, it } from 'vitest';
import { parsePlannerMarkdown, plannerToMarkdown } from './markdown';
import { calendarProgress, emptyPlannerState, monthKey, parsePlannerState, samePlannerData } from './model';

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

  it('按真实日历边界计算年、月、季度进度', () => {
    const progress = calendarProgress(new Date(2024, 1, 15, 12));
    expect(progress.month).toBeGreaterThan(49);
    expect(progress.month).toBeLessThan(51);
    expect(progress.quarter).toBeGreaterThan(49);
    expect(progress.quarter).toBeLessThan(51);
    expect(progress.year).toBeGreaterThan(12);
    expect(progress.year).toBeLessThan(13);
  });
});
