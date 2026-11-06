import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyPlannerState, PLANNER_STORAGE_KEY, type MonthlyPlannerState } from './model';
import {
  PlannerSynchronizer,
  PlannerSyncError,
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
  it('默认十二个空月份直接读取账号计划，不制造空模板冲突', async () => {
    let view!: PlannerSyncView;
    const apply = vi.fn();
    const engine = new PlannerSynchronizer<MonthlyPlannerState>(
      { version: 1, months: { '2026-01': [], '2026-11': [] } },
      apply,
      (next) => {
        view = next;
      },
      localStorage,
    );
    await engine.connect({ load: async () => response(state('账号目标'), 1), save: vi.fn() });
    expect(view.conflict).toBeNull();
    expect(apply).toHaveBeenLastCalledWith(state('账号目标'), user);
    engine.stop();
  });
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
  it('上传过程中继续编辑，确认前不报成功并自动上传后续修改', async () => {
    let confirm!: (value: PlannerSyncResponse) => void;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<PlannerSyncResponse>((resolve) => {
            confirm = resolve;
          }),
      )
      .mockImplementation(async (mutation) => response(mutation.state, mutation.baseRevision + 1));
    let view!: PlannerSyncView;
    const engine = new PlannerSynchronizer(
      emptyPlannerState(),
      vi.fn(),
      (next) => {
        view = next;
      },
      localStorage,
    );
    await engine.connect({ load: async () => response(state('原目标'), 1), save });
    engine.edit(state('第一版'));
    const saving = engine.tick();
    engine.edit(state('第二版'));
    expect(view.pending).toBe(true);
    expect(view.status).not.toBe('已同步到云端');
    confirm(response(state('第一版'), 2));
    await saving;
    await vi.advanceTimersByTimeAsync(900);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].state).toEqual(state('第二版'));
    expect(view.pending).toBe(false);
    engine.stop();
  });
  it('失败后重用原 mutation ID，409 保留本地修改供选择', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('网络中断'))
      .mockImplementationOnce(async (mutation) => response(mutation.state, 2))
      .mockRejectedValueOnce(new PlannerSyncError(409, response(state('其他设备'), 3)));
    let view!: PlannerSyncView;
    const engine = new PlannerSynchronizer(
      emptyPlannerState(),
      vi.fn(),
      (next) => {
        view = next;
      },
      localStorage,
    );
    await engine.connect({ load: async () => response(state('原目标'), 1), save });
    engine.edit(state('本地修改'));
    await engine.tick();
    expect(view.error).toBe('网络中断');
    expect(view.pending).toBe(true);
    await engine.tick();
    expect(save.mock.calls[0][0].mutationId).toBe(save.mock.calls[1][0].mutationId);
    engine.edit(state('继续修改'));
    await engine.tick();
    expect(view.conflict?.state).toEqual(state('其他设备'));
    expect(JSON.parse(localStorage.getItem(plannerDraftKey(user.id))!).state).toEqual(state('继续修改'));
    engine.stop();
  });
});
