import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sameLibrary, toLibrary, validLibrary, type DraftLibrary } from './model';
import { newDocument } from './library';
import { ResumeSession, resumeDraftKey } from './sync';

const user = { id: '10000000-0000-4000-8000-000000000001', name: '', login: 'alice' };
const format = { normalize: toLibrary, valid: validLibrary, same: sameLibrary };
const sessions: ResumeSession<DraftLibrary>[] = [];
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  sessions.splice(0).forEach((session) => session.dispose());
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('saves edits in different documents during one in-flight save without losing either content or comments', async () => {
  const library: DraftLibrary = {
    version: 2,
    documents: [newDocument('简历'), newDocument('项目主稿')],
  };
  const session = new ResumeSession<DraftLibrary>(
    user.id,
    { state: library, revision: 1, updatedAt: '2026-11-18T10:00:00Z' },
    vi.fn(),
    vi.fn(),
    true,
    format,
  );
  sessions.push(session);
  const saved: DraftLibrary[] = [];
  let finish!: () => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const mutation = JSON.parse(String(init?.body));
      saved.push(mutation.state);
      if (saved.length === 1)
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      return new Response(
        JSON.stringify({
          user,
          resume: {
            state: mutation.state,
            revision: mutation.baseRevision + 1,
            updatedAt: '2026-11-18T11:00:00Z',
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
  session.update({
    ...library,
    documents: library.documents.map((doc, i) =>
      i === 0 ? { ...doc, content: { version: 1, markdown: '简历成果' } } : doc,
    ),
  });
  const saving = session.flush();
  session.update({
    ...session.view.state,
    documents: session.view.state.documents.map((doc, i) =>
      i === 1
        ? {
            ...doc,
            content: {
              version: 1,
              markdown: '异常恢复方案',
              comments: [
                {
                  id: '11111111-1111-4111-8111-111111111111',
                  quote: '方案',
                  body: '核对代码',
                  createdAt: '2026-11-18T10:00:00.000Z',
                },
              ],
            },
          }
        : doc,
    ),
  });
  finish();
  await saving;
  expect(session.view.status).toBe('pending');
  await session.flush();
  expect(saved[1].documents[0].content.markdown).toBe('简历成果');
  expect(saved[1].documents[1].content.comments?.[0].body).toBe('核对代码');
  expect(session.view.status).toBe('saved');
});
it('replays the exact legacy pending mutation before upgrading a restored local draft', async () => {
  const legacy = { version: 1 as const, markdown: '旧版待保存内容', comments: [] };
  const pending = {
    expectedUserId: user.id,
    baseRevision: 0,
    mutationId: '11111111-1111-4111-8111-111111111111',
    state: legacy,
  };
  localStorage.setItem(resumeDraftKey(user.id), JSON.stringify({ state: legacy, revision: 0, pending }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual(pending);
      return new Response(
        JSON.stringify({ user, resume: { state: legacy, revision: 1, updatedAt: '2026-11-18T10:00:00Z' } }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
  const session = new ResumeSession<DraftLibrary>(
    user.id,
    { state: null, revision: 0, updatedAt: null },
    vi.fn(),
    vi.fn(),
    true,
    format,
  );
  sessions.push(session);
  expect(session.view.state.documents[0].content.markdown).toBe(legacy.markdown);
  expect(await session.flush()).toBe(true);
  expect(session.view.status).toBe('saved');
  expect(localStorage.getItem(resumeDraftKey(user.id))).toBeNull();
});

it('restores a categorized library and replays its pending receipt without rewriting historical content', async () => {
  const legacy: DraftLibrary = {
    version: 2,
    documents: [{ ...newDocument('历史主稿'), kind: 'interview' }],
  };
  legacy.documents[0].content.markdown = '# 原始主稿\n\n<mark>重点</mark>';
  const pending = {
    expectedUserId: user.id,
    baseRevision: 1,
    mutationId: '11111111-1111-4111-8111-111111111111',
    state: legacy,
  };
  localStorage.setItem(resumeDraftKey(user.id), JSON.stringify({ state: legacy, revision: 1, pending }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual(pending);
      return new Response(
        JSON.stringify({
          user,
          resume: { state: legacy, revision: 2, updatedAt: '2026-11-18T10:00:00Z' },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
  const session = new ResumeSession<DraftLibrary>(
    user.id,
    { state: legacy, revision: 1, updatedAt: '2026-11-18T09:00:00Z' },
    vi.fn(),
    vi.fn(),
    true,
    format,
  );
  sessions.push(session);
  expect(session.view.state.documents).toEqual(legacy.documents);
  expect(await session.flush()).toBe(true);
  expect(session.view.status).toBe('saved');
});
