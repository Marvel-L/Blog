import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MindSession, clearMindDrafts, draftKey } from './sync';
import { newMindState, type MindMap } from './model';

const user = { id: 'alice', login: 'alice', name: 'Alice' };
const id = '10000000-0000-4000-8000-000000000001';
const reply = (map: MindMap, status = 200) =>
  new Response(JSON.stringify({ user, map }), { status, headers: { 'Content-Type': 'application/json' } });
let remote: MindMap;
const sessions: MindSession[] = [];
const session = (map = remote, owner = user.id, unauthorized = vi.fn()) => {
  const s = new MindSession(owner, id, map, vi.fn(), unauthorized);
  sessions.push(s);
  return s;
};
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  remote = { id, revision: 1, updatedAt: '2026-11-15T12:00:00Z', state: newMindState('mind') };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_, init) => {
      const body = JSON.parse(String(init?.body));
      remote = { ...remote, state: body.state, revision: body.baseRevision + 1 };
      return reply(remote);
    }),
  );
});
afterEach(() => {
  for (const s of sessions.splice(0)) s.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe('Mind autosave', () => {
  it('removes all recovery drafts for the departing account only', () => {
    localStorage.setItem(draftKey('alice', 'first'), 'private');
    localStorage.setItem(draftKey('alice', 'second'), 'private');
    localStorage.setItem(draftKey('bob', 'first'), 'keep');
    clearMindDrafts('alice');
    expect(localStorage.getItem(draftKey('alice', 'first'))).toBeNull();
    expect(localStorage.getItem(draftKey('alice', 'second'))).toBeNull();
    expect(localStorage.getItem(draftKey('bob', 'first'))).toBe('keep');
  });
  it('debounces edits and persists the viewport and emoji', async () => {
    const s = session();
    s.update({ ...s.snapshot.state, title: '第一版' });
    s.update({
      ...s.snapshot.state,
      title: '最终版',
      viewport: { x: 150, y: -88, zoom: 1.8 },
      nodes: s.snapshot.state.nodes.map((n) => ({ ...n, emoji: '✅' })),
    });
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(remote.state.title).toBe('最终版');
    expect(remote.state.viewport.zoom).toBe(1.8);
    expect(remote.state.nodes[0].emoji).toBe('✅');
    expect(s.snapshot.status).toBe('saved');
    expect(localStorage.getItem(draftKey(user.id, id))).toBeNull();
  });
  it('serializes edits made during a slow save without marking them saved early', async () => {
    const s = session();
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = { ...s.snapshot.state, title: 'A' };
    s.update(first);
    const saving = s.flush();
    s.update({ ...s.snapshot.state, title: 'B' });
    expect(fetch).toHaveBeenCalledTimes(1);
    finish(reply({ ...remote, state: first, revision: 2 }));
    await saving;
    expect(s.snapshot.status).toBe('pending');
    await s.flush();
    const second = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(second.baseRevision).toBe(2);
    expect(second.state.title).toBe('B');
    expect(s.snapshot.status).toBe('saved');
  });
  it('recovers latest local edits and replays the same mutation after a lost response', async () => {
    const s = session();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    s.update({ ...s.snapshot.state, title: '已发出' });
    await s.flush();
    const original = String(vi.mocked(fetch).mock.calls[0][1]?.body);
    s.update({ ...s.snapshot.state, title: '断网后的新内容' });
    s.dispose();
    const restored = session();
    expect(restored.snapshot.state.title).toBe('断网后的新内容');
    await restored.flush();
    expect(vi.mocked(fetch).mock.calls[1][1]?.body).toBe(original);
    await restored.flush();
    expect(remote.state.title).toBe('断网后的新内容');
    expect(remote.revision).toBe(3);
  });
  it('stops on revision conflicts and isolates recovery data between accounts', async () => {
    const s = session();
    s.update({ ...s.snapshot.state, title: 'Alice 草稿' });
    vi.mocked(fetch).mockResolvedValueOnce(reply(remote, 409));
    await s.flush();
    expect(s.snapshot.status).toBe('conflict');
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(session(remote, 'bob').snapshot.state.title).toBe('未命名导图');
    expect(localStorage.getItem(draftKey('alice', id))).toContain('Alice 草稿');
  });
  it('does not overwrite a newer remote version when an old receipt is replayed', async () => {
    const s = session();
    s.update({ ...s.snapshot.state, title: '旧内容' });
    vi.mocked(fetch).mockResolvedValueOnce(reply({ ...remote, revision: 4 }));
    await s.flush();
    expect(s.snapshot.status).toBe('conflict');
  });
  it('clears private drafts on expired sessions and reports storage failures', async () => {
    const unauthorized = vi.fn(),
      s = session(remote, 'alice', unauthorized);
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new Error('full');
    });
    s.update({ ...s.snapshot.state, title: '不能落盘' });
    expect(s.snapshot.recoveryError).toContain('无法保存');
    vi.mocked(fetch).mockResolvedValueOnce(reply(remote, 401));
    await s.flush();
    expect(unauthorized).toHaveBeenCalledOnce();
    expect(localStorage.getItem(draftKey('alice', id))).toBeNull();
  });
});
