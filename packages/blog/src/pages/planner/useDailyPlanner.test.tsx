import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDailyPlanner } from './useDailyPlanner';
import type { PlannerSyncUser } from './sync';

const alice = { id: 'alice', login: 'alice', name: 'Alice' };
const bob = { id: 'bob', login: 'bob', name: 'Bob' };
const snapshot = (user: PlannerSyncUser, text: string) =>
  Response.json({
    user,
    planner: {
      state: {
        version: 1,
        tasks: [
          { id: 'task', text, date: '2026-11-07', note: '', priority: 'normal', scheduledFor: null, completedOn: null },
        ],
      },
      revision: 1,
      updatedAt: null,
    },
  });
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('每日遗留账号生命周期', () => {
  it('切换账号即隐藏旧记录并取消旧请求，迟到响应不能覆盖新账号', async () => {
    let resolveAlice!: (response: Response) => void;
    let aliceSignal!: AbortSignal;
    const fetcher = vi
      .fn()
      .mockImplementationOnce((_url, init) => {
        aliceSignal = init.signal;
        return new Promise<Response>((resolve) => {
          resolveAlice = resolve;
        });
      })
      .mockImplementationOnce(async () => snapshot(bob, 'Bob 的记录'));
    vi.stubGlobal('fetch', fetcher);
    const { result, rerender } = renderHook(({ user }) => useDailyPlanner(user), { initialProps: { user: alice } });
    rerender({ user: bob });
    expect(aliceSignal.aborted).toBe(true);
    await waitFor(() => expect(result.current.state.tasks[0]?.text).toBe('Bob 的记录'));
    await act(async () => {
      resolveAlice(snapshot(alice, 'Alice 的迟到记录'));
    });
    expect(result.current.state.tasks[0].text).toBe('Bob 的记录');
  });
  it('退出事件取消在途请求并清空私有视图，未登录不读取缓存', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => snapshot(alice, '私有记录')),
    );
    const { result, rerender } = renderHook(({ user }: { user: PlannerSyncUser | null }) => useDailyPlanner(user), {
      initialProps: { user: alice as PlannerSyncUser | null },
    });
    await waitFor(() => expect(result.current.state.tasks).toHaveLength(1));
    act(() => window.dispatchEvent(new Event('dblog-account-change')));
    expect(result.current.state.tasks).toHaveLength(0);
    rerender({ user: null });
    expect(result.current.view.user).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('首次加载失败可以手动重连，身份不匹配时拒绝显示', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new Error('断网'))
        .mockImplementationOnce(async () => snapshot(alice, '重连记录'))
        .mockImplementationOnce(async () => snapshot(alice, '身份不匹配')),
    );
    const { result, rerender } = renderHook(({ user }) => useDailyPlanner(user), { initialProps: { user: alice } });
    await waitFor(() => expect(result.current.view.error).toBe('断网'));
    act(() => result.current.sync());
    await waitFor(() => expect(result.current.state.tasks[0]?.text).toBe('重连记录'));
    rerender({ user: bob });
    await waitFor(() => expect(result.current.view.error).toContain('账号已切换'));
    expect(result.current.state.tasks).toHaveLength(0);
  });
});
