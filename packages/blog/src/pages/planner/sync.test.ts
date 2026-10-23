import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyPlannerState, PLANNER_STORAGE_KEY, type MonthlyPlannerState } from './model';
import {
  PlannerSynchronizer,
  plannerDraftKey,
  type PlannerSyncResponse,
  type PlannerSyncView,
  type PlannerTransport,
} from './sync';

const user = { id: 'alice', login: 'alice', name: 'Alice' };
const state = (text: string): MonthlyPlannerState => ({
  version: 1,
  months: { '2026-10': [{ id: 'task', text, completed: false }] },
});
const response = (value: MonthlyPlannerState | null, revision: number): PlannerSyncResponse => ({
  user,
  planner: { state: value, revision, updatedAt: null, githubStatus: 'pending', githubCommittedAt: null },
});

describe('月度计划自动同步', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('首次连接空云端后上传，修改防抖保存并保留 GitHub 队列状态', async () => {
    const save = vi.fn(async (mutation) => response(mutation.state, mutation.baseRevision + 1));
    const transport: PlannerTransport = { load: vi.fn(async () => response(null, 0)), save };
    let view!: PlannerSyncView;
    const engine = new PlannerSynchronizer(
      state('本地任务'),
      vi.fn(),
      (next) => {
        view = next;
      },
      localStorage,
    );
    await engine.connect(transport);
    await vi.advanceTimersByTimeAsync(900);
    expect(save).toHaveBeenCalledTimes(1);
    expect(view.status).toBe('已同步到云端');
    expect(view.githubStatus).toBe('pending');
    engine.edit(state('更新任务'));
    await vi.advanceTimersByTimeAsync(900);
    expect(save.mock.calls[1][0].state.months['2026-10'][0].text).toBe('更新任务');
    engine.stop();
  });

  it('断开后恢复匿名浏览器计划并隔离账号草稿', async () => {
    localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(state('匿名计划')));
    const apply = vi.fn();
    const transport: PlannerTransport = { load: vi.fn(async () => response(state('账号计划'), 2)), save: vi.fn() };
    const engine = new PlannerSynchronizer(emptyPlannerState(), apply, vi.fn(), localStorage);
    await engine.connect(transport);
    expect(apply).toHaveBeenLastCalledWith(state('账号计划'), user);
    engine.disconnect();
    expect(apply).toHaveBeenLastCalledWith(state('匿名计划'), null);
    expect(JSON.parse(localStorage.getItem(plannerDraftKey(user.id))!).state.months['2026-10'][0].text).toBe(
      '账号计划',
    );
    engine.stop();
  });
});
