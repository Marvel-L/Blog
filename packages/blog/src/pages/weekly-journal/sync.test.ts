import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JournalSession, journalDraftKey, type WeekResponse } from './sync';
import { emptyWeek, type WeeklyState } from './weekly-model';

const week = '2026-11-09';
const response = (state: WeeklyState | null = null, revision = 0): WeekResponse => ({
  user: { id: 'alice', login: 'alice', name: 'Alice' },
  weekStart: week,
  today: '2026-11-12',
  archive: { state, revision, updatedAt: revision ? '2026-11-12T01:30:00Z' : null },
});
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const sessions: JournalSession[] = [];
function session(remote = response()) {
  const unauthorized = vi.fn();
  const current = new JournalSession(remote, vi.fn(), unauthorized);
  sessions.push(current);
  return { current, unauthorized };
}
function edit(current: JournalSession, text: string, index = 0) {
  current.update({
    ...current.view.state,
    days: current.view.state.days.map((day, i) => (i === index ? { ...day, content: text } : day)),
  });
}
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_, init) => {
      const mutation = JSON.parse(init.body);
      return json(response(mutation.state, mutation.baseRevision + 1));
    }),
  );
});
afterEach(() => {
  sessions.splice(0).forEach((entry) => entry.dispose());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('周记自动保存', () => {
  it('停笔后自动保存；刷新前的草稿按账号和周次恢复', async () => {
    const { current } = session();
    edit(current, '我的草稿');
    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem(journalDraftKey('alice', week))).toContain('我的草稿');
    current.dispose();
    const restored = session().current;
    expect(restored.view.state.days[0].content).toBe('我的草稿');
    const another = new JournalSession(
      { ...response(), user: { id: 'bob', login: 'bob', name: 'Bob' } },
      vi.fn(),
      vi.fn(),
    );
    sessions.push(another);
    expect(another.view.state.days[0].content).toBe('');
    restored.start();
    await vi.advanceTimersByTimeAsync(800);
    expect(restored.view.status).toBe('saved');
    expect(localStorage.getItem(journalDraftKey('alice', week))).toBeNull();
  });

  it('保存期间继续输入，下一次写入保留最新正文和其他日期', async () => {
    let finish!: (value: Response) => void;
    const writes: string[] = [];
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      writes.push(String(init?.body));
      if (writes.length === 1)
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      const mutation = JSON.parse(String(init?.body));
      return json(response(mutation.state, mutation.baseRevision + 1));
    });
    const { current } = session();
    edit(current, '第一版');
    const first = current.flush();
    edit(current, '继续输入的第二版');
    edit(current, '周二记录', 1);
    finish(json(response(JSON.parse(writes[0]).state, 1)));
    await first;
    expect(current.view.status).toBe('pending');
    await vi.advanceTimersByTimeAsync(800);
    expect(current.view.status).toBe('saved');
    expect(JSON.parse(writes[1]).state.days[0].content).toBe('继续输入的第二版');
    expect(JSON.parse(writes[1]).state.days[1].content).toBe('周二记录');
    expect(JSON.parse(writes[1]).baseRevision).toBe(1);
  });

  it('失败后重试原回执，再保存失败期间的新输入', async () => {
    const writes: string[] = [];
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      writes.push(String(init?.body));
      if (writes.length === 1) throw new Error('断网');
      const mutation = JSON.parse(String(init?.body));
      return json(response(mutation.state, mutation.baseRevision + 1));
    });
    const { current } = session();
    edit(current, '原始输入');
    expect(await current.flush()).toBe(false);
    edit(current, '断网后继续输入');
    expect(await current.flush()).toBe(true);
    expect(writes[0]).toBe(writes[1]);
    await current.flush();
    expect(JSON.parse(writes[2]).state.days[0].content).toBe('断网后继续输入');
    expect(current.view.status).toBe('saved');
  });

  it('版本冲突停止自动写入，保留本机内容与远端其他天记录', async () => {
    const fresh = emptyWeek(week);
    fresh.days[0].content = '远端周一';
    fresh.days[1].content = '远端周二';
    fresh.days[0].thoughts = [
      { id: '11111111-1111-4111-8111-111111111111', content: '远端随想', createdAt: '2026-11-12T01:30:00Z' },
    ];
    vi.mocked(fetch).mockImplementation(async (_, init) =>
      init?.method === 'PUT' ? json({}, 409) : json(response(fresh, 1)),
    );
    const { current } = session();
    edit(current, '本机周一');
    expect(await current.flush()).toBe(false);
    expect(current.view.status).toBe('conflict');
    expect(current.view.state.days[0].content).toBe('本机周一');
    expect(current.view.state.days[1].content).toBe('远端周二');
    expect(current.view.state.days[0].thoughts).toEqual(fresh.days[0].thoughts);
    const calls = vi.mocked(fetch).mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetch).toHaveBeenCalledTimes(calls);
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      const mutation = JSON.parse(String(init?.body));
      return json(response(mutation.state, mutation.baseRevision + 1));
    });
    expect(await current.flush(true)).toBe(true);
    expect(current.view.status).toBe('saved');
  });

  it('退出时清理本机草稿，迟到响应不能重新展示正文', async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const { current, unauthorized } = session();
    edit(current, '私密内容');
    const saving = current.flush();
    current.dispose(true);
    finish(json(response(current.view.state, 1)));
    expect(await saving).toBe(false);
    expect(localStorage.getItem(journalDraftKey('alice', week))).toBeNull();
    expect(unauthorized).not.toHaveBeenCalled();
  });
});
