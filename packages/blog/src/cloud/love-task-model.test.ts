import { describe, expect, it } from 'vitest';
import {
  addLoveGroup,
  emptyLoveTasks,
  loveTaskDay,
  parseLoveTaskSnapshot,
  removeLoveGroup,
  updateLoveGroup,
  updateLoveTask,
  type LoveGroup,
  type LoveTask,
} from './love-task-model';

const task: LoveTask = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  text: '做一顿饭',
  note: '带上相机\n留下回忆',
  createdOn: '2026-11-07',
  completedOn: null,
};
const group: LoveGroup = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  text: '一起在深圳生活',
  note: '',
  createdOn: '2026-11-07',
  tasks: [task, { ...task, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', text: '走一次公园' }],
};
const snapshot = (state: unknown) => ({ state, revision: 1, updatedAt: '2026-11-07T00:00:00Z' });
describe('Love grouped task model', () => {
  it('completes one child independently and preserves its dates when editing the group', () => {
    const added = addLoveGroup(emptyLoveTasks(), group);
    const completed = updateLoveTask(added, group.id, task.id, { completedOn: '2026-11-08' });
    expect(added.groups[0].tasks[0].completedOn).toBeNull();
    expect(completed.groups[0].tasks[1].completedOn).toBeNull();
    const edited = updateLoveGroup(completed, { ...completed.groups[0], text: '一起生活' });
    expect(parseLoveTaskSnapshot(snapshot(edited)).state?.groups[0].tasks[0]).toMatchObject({
      completedOn: '2026-11-08',
      createdOn: task.createdOn,
      note: task.note,
    });
    const undone = updateLoveTask(edited, group.id, task.id, { completedOn: null });
    expect(undone.groups[0].tasks[0].completedOn).toBeNull();
    expect(removeLoveGroup(undone, group.id).groups).toEqual([]);
    expect(loveTaskDay(new Date('2026-11-07T18:00:00Z'))).toBe('2026-11-08');
  });
  it('normalizes saved v1 content without losing IDs, notes or completions', () => {
    const completed = { ...task, completedOn: '2026-11-08' };
    const legacy = snapshot({ version: 1, tasks: [completed] });
    const migrated = parseLoveTaskSnapshot(legacy);
    expect(migrated.state?.version).toBe(2);
    expect(migrated.state?.groups[0]).toMatchObject({ text: '已记录的愿望', tasks: [completed] });
    expect(parseLoveTaskSnapshot(legacy)).toEqual(migrated);
    expect(parseLoveTaskSnapshot(snapshot({ version: 1, tasks: [] })).state).toEqual(emptyLoveTasks());
    const many = Array.from({ length: 1000 }, (_, i) => ({
      ...task,
      id: `00000000-0000-4000-8000-${(i + 1).toString(16).padStart(12, '0')}`,
    }));
    const state = parseLoveTaskSnapshot(snapshot({ version: 1, tasks: many })).state!;
    expect(state.groups).toHaveLength(10);
    expect(state.groups.flatMap((item) => item.tasks)).toEqual(many);
    expect(parseLoveTaskSnapshot(snapshot(state)).state).toEqual(state);
  });
  it('rejects malformed children in both formats and duplicate IDs across groups', () => {
    for (const value of [
      null,
      { ...task, text: '' },
      { ...task, text: '  看海' },
      { ...task, text: 'x'.repeat(121) },
      { ...task, id: 'wrong' },
      { ...task, note: null },
      { ...task, note: 'x'.repeat(2001) },
      { ...task, text: '看\n海' },
      { ...task, note: '\u0000' },
      { ...task, createdOn: '2026-02-30' },
      { ...task, completedOn: '2026-11-06' },
      { ...task, completedOn: true },
      { ...task, user_id: 'other' },
    ]) {
      expect(() => parseLoveTaskSnapshot(snapshot({ version: 1, tasks: [value] }))).toThrow();
      expect(() => parseLoveTaskSnapshot(snapshot({ version: 2, groups: [{ ...group, tasks: [value] }] }))).toThrow();
    }
    for (const value of [
      { ...group, text: '' },
      { ...group, tasks: null },
      { ...group, tasks: [] },
      { ...group, completedOn: null },
      { ...group, id: task.id.toUpperCase() },
      { ...group, tasks: [task, { ...task, id: task.id.toUpperCase() }] },
      { ...group, tasks: Array(101).fill(task) },
    ])
      expect(() => parseLoveTaskSnapshot(snapshot({ version: 2, groups: [value] }))).toThrow();
    expect(() =>
      parseLoveTaskSnapshot(
        snapshot({ version: 2, groups: [group, { ...group, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }] }),
      ),
    ).toThrow();
    expect(() => parseLoveTaskSnapshot({ ...snapshot(emptyLoveTasks()), revision: -1 })).toThrow();
    expect(() => addLoveGroup({ version: 2, groups: Array(1000).fill(group) }, group)).toThrow('1000');
    expect(parseLoveTaskSnapshot({ state: null, revision: 0, updatedAt: null }).state).toBeNull();
  });
  it('caps the total child count independently from per-group limits', () => {
    let id = 0;
    const uuid = () => `00000000-0000-4000-8000-${(++id).toString(16).padStart(12, '0')}`;
    const groups = Array.from({ length: 50 }, () => ({
      ...group,
      id: uuid(),
      tasks: Array.from({ length: 100 }, () => ({ ...task, id: uuid() })),
    }));
    expect(parseLoveTaskSnapshot(snapshot({ version: 2, groups })).state?.groups).toHaveLength(50);
    groups.push({ ...group, id: uuid(), tasks: [{ ...task, id: uuid() }] });
    expect(() => parseLoveTaskSnapshot(snapshot({ version: 2, groups }))).toThrow();
  });
});
