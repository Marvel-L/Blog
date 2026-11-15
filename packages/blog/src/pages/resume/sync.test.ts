import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeSession, resumeDraftKey } from './sync';
import type { ResumeSnapshot } from './model';

const user = { id: '10000000-0000-4000-8000-000000000001', login: 'alice', name: 'Alice' };
const empty: ResumeSnapshot = { state: null, revision: 0, updatedAt: null };
const reply = (resume: ResumeSnapshot, status = 200, owner = user) =>
  new Response(JSON.stringify({ user: owner, resume }), { status, headers: { 'Content-Type': 'application/json' } });
let remote: ResumeSnapshot;
const sessions: ResumeSession[] = [];
function session(snapshot = remote, owner = user.id, unauthorized = vi.fn()) {
  const current = new ResumeSession(owner, snapshot, vi.fn(), unauthorized);
  sessions.push(current);
  return current;
}
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  remote = empty;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_, init) => {
      const body = JSON.parse(String(init?.body));
      remote = { state: body.state, revision: body.baseRevision + 1, updatedAt: '2026-11-15T10:00:00Z' };
      return reply(remote);
    }),
  );
});
afterEach(() => {
  for (const current of sessions.splice(0)) current.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe('private resume autosave', () => {
  it('saves comments-only changes made in flight and restores them after failure without crossing accounts', async () => {
    const s = session();
    const comment = {
      id: '11111111-1111-4111-8111-111111111111',
      quote: '系统',
      body: '补充指标',
      createdAt: '2026-11-16T10:00:00.000Z',
    };
    s.update({ version: 1, markdown: '系统', comments: [comment] });
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = s.flush();
    s.update({ ...s.view.state, comments: [{ ...comment, body: '补充并发指标' }] });
    finish(
      reply({
        state: { version: 1, markdown: '系统', comments: [comment] },
        revision: 1,
        updatedAt: comment.createdAt,
      }),
    );
    await first;
    expect(s.view.status).toBe('pending');
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await s.flush();
    s.dispose();
    const restored = session({
      revision: 1,
      state: { version: 1, markdown: '系统', comments: [comment] },
      updatedAt: comment.createdAt,
    });
    expect(restored.view.state.comments?.[0].body).toBe('补充并发指标');
    expect(session(empty, 'bob').view.state.comments).toBeUndefined();
    await restored.flush();
    expect(remote.state?.comments?.[0].body).toBe('补充并发指标');
    restored.update('系统开发');
    await restored.flush();
    expect(remote.state?.comments).toHaveLength(1);
    restored.update({ ...restored.view.state, comments: [] });
    await restored.flush();
    expect(remote.state?.comments).toEqual([]);
    expect(restored.view.status).toBe('saved');
  });
  it('debounces source edits and includes the account-switch guard', async () => {
    const s = session();
    s.update('# 第一次');
    s.update('# 最终内容');
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(800);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).expectedUserId).toBe(user.id);
    expect(remote.state?.markdown).toBe('# 最终内容');
    expect(s.view.status).toBe('saved');
    expect(localStorage.getItem(resumeDraftKey(user.id))).toBeNull();
  });
  it('serializes edits while a previous request is in flight', async () => {
    const s = session();
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    s.update('第一版');
    const saving = s.flush();
    s.update('第二版');
    expect(fetch).toHaveBeenCalledTimes(1);
    finish(reply({ state: { version: 1, markdown: '第一版' }, revision: 1, updatedAt: '2026-11-15T10:00:00Z' }));
    await saving;
    expect(s.view.status).toBe('pending');
    await s.flush();
    expect(remote.revision).toBe(2);
    expect(remote.state?.markdown).toBe('第二版');
  });
  it('restores local edits and replays the identical receipt after an ambiguous network failure', async () => {
    const s = session();
    s.update('请求已发出');
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await s.flush();
    const original = vi.mocked(fetch).mock.calls[0][1]?.body;
    s.update('断网后继续编辑');
    s.dispose();
    const restored = session();
    expect(restored.view.state.markdown).toBe('断网后继续编辑');
    await restored.flush();
    expect(vi.mocked(fetch).mock.calls[1][1]?.body).toBe(original);
    await restored.flush();
    expect(remote.state?.markdown).toBe('断网后继续编辑');
  });
  it('retains local draft and stops writes on conflict without exposing it to another account', async () => {
    const s = session();
    s.update('私有简历');
    vi.mocked(fetch).mockResolvedValueOnce(reply(empty, 409));
    await s.flush();
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(s.view.status).toBe('conflict');
    expect(session(empty, 'bob').view.state.markdown).toBe('');
    expect(localStorage.getItem(resumeDraftKey(user.id))).toContain('私有简历');
  });
  it('clears drafts and suppresses late requests when the session expires', async () => {
    const expired = vi.fn();
    const s = session(empty, user.id, expired);
    s.update('私有内容');
    vi.mocked(fetch).mockResolvedValueOnce(reply(empty, 401));
    await s.flush();
    expect(expired).toHaveBeenCalledOnce();
    expect(localStorage.getItem(resumeDraftKey(user.id))).toBeNull();
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('reports storage failures and caps automatic retries', async () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const s = session();
    s.update('内容');
    expect(s.view.recoveryError).toContain('无法保留');
    await s.flush();
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(s.view.status).toBe('error');
  });
});
