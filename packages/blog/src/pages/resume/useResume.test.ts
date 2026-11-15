import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useResume } from './useResume';

const response = (user = 'alice', markdown = '云端简历') =>
  new Response(
    JSON.stringify({
      user: { id: user, login: user, name: user },
      resume: { state: { version: 1, markdown }, revision: 1, updatedAt: '2026-11-15T10:00:00Z' },
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response()),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('keeps edits made while a manual cloud refresh is in flight', async () => {
  const hook = renderHook(useResume);
  await waitFor(() => expect(hook.result.current.phase).toBe('ready'));
  let finish!: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let loading!: Promise<void>;
  act(() => {
    loading = hook.result.current.reload();
  });
  act(() => {
    hook.result.current.update('刷新期间的新输入');
  });
  await act(async () => {
    finish(response('alice', '较旧的云端内容'));
    await loading;
  });
  expect(hook.result.current.view?.state.markdown).toBe('刷新期间的新输入');
  expect(hook.result.current.error).toContain('已保留你的输入');
});

it('does not revive old private data after an account change with a late response', async () => {
  let finish!: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(useResume);
  vi.mocked(fetch).mockImplementationOnce(async () => response('bob', 'Bob 的内容'));
  act(() => {
    window.dispatchEvent(new CustomEvent('dblog-account-change'));
  });
  await waitFor(() => expect(hook.result.current.user?.id).toBe('bob'));
  await act(async () => {
    finish(response('alice', 'Alice 的私有内容'));
  });
  expect(hook.result.current.view?.state.markdown).toBe('Bob 的内容');
  expect(hook.result.current.user?.id).toBe('bob');
});
