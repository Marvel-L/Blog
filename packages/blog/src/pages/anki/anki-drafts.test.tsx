import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnkiPage from './Anki';
import { AnkiDialogs } from './AnkiDialogs';
import { listAnkiDrafts, saveAnkiDraft, type AnkiDraft } from './anki-drafts';
import { readAnkiView, writeAnkiView } from './anki-view';
import type { AnkiCard } from './anki-api';

const card: AnkiCard = {
  id: 'card1',
  deckId: 'd1',
  question: '原问题',
  answer: '原答案',
  dueAt: '',
  intervalDays: 3,
  repetitions: 1,
  easeFactor: 2.5,
  reviewCount: 1,
  version: 2,
  tags: [],
};
const dashboard = {
  categories: [{ id: 'c1', name: '分类' }],
  decks: [{ id: 'd1', categoryId: 'c1', name: 'Go 库', total: 1, learned: 1, stable: 0, due: 1 }],
  goal: 12,
  today: 0,
  todayCards: 0,
  timeZone: 'Asia/Shanghai',
  history: [],
};
const draft: AnkiDraft = {
  id: 'draft1',
  deckId: 'd1',
  question: '草稿问题',
  answer: '    代码\n',
  tags: [],
  resetProgress: false,
  status: 'failed',
  updatedAt: 1,
};
let fail = true;
let userId = 'alice';
let request: ReturnType<typeof vi.fn<typeof fetch>>;
const json = (data: unknown) => new Response(JSON.stringify(data));
function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="url">{location.pathname + location.search}</output>
      <button onClick={() => navigate(-1)}>历史后退</button>
    </>
  );
}
function mount(entry = '/Blog/anki') {
  return render(
    <StrictMode>
      <HelmetProvider>
        <MemoryRouter basename="/Blog" initialEntries={[entry]}>
          <AnkiPage />
          <Probe />
        </MemoryRouter>
      </HelmetProvider>
    </StrictMode>,
  );
}
beforeEach(() => {
  localStorage.clear();
  fail = true;
  userId = 'alice';
  request = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/me')) return json({ user: { id: userId, login: userId, name: userId } });
    if (url.endsWith('/dashboard')) return json(dashboard);
    if (url.endsWith('/tags')) return json({ tags: [] });
    if (init?.method === 'POST' || init?.method === 'PATCH') {
      if (fail) throw new TypeError('Failed to fetch');
      return json(card);
    }
    return json({ cards: [card] });
  });
  vi.stubGlobal('fetch', request);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Anki URL 刷新恢复', () => {
  it('点击库写入 URL，重挂载模拟刷新后仍显示原库，答案保持隐藏', async () => {
    const first = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Go 库' }));
    await screen.findByText('原问题');
    const url = screen.getByTestId('url').textContent!;
    expect(url).toBe('/anki?view=deck&deck=d1');
    first.unmount();
    mount(`/Blog${url}`);
    expect(await screen.findByText('原问题')).toBeInTheDocument();
    expect(screen.queryByText('我的卡片库')).not.toBeInTheDocument();
    expect(screen.queryByText('原答案')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回卡片库' }));
    await screen.findByText('我的卡片库');
    fireEvent.click(screen.getByRole('button', { name: '历史后退' }));
    expect(await screen.findByText('原问题')).toBeInTheDocument();
  });
  it('无效库回到概览，不在渲染阶段导航', async () => {
    mount('/Blog/anki?view=deck&deck=missing');
    expect(await screen.findByText('我的卡片库')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('/anki');
  });
  it('URL 解析保留无标签与无关参数，不携带问题答案', () => {
    const params = writeAnkiView(new URLSearchParams('x=1'), { name: 'deck', deckId: 'd1', tag: '' });
    expect(readAnkiView(params)).toEqual({ name: 'deck', deckId: 'd1', tag: '' });
    expect(params.get('x')).toBe('1');
    expect(readAnkiView(new URLSearchParams('view=bogus'))).toEqual({ name: 'overview' });
  });
});

describe('Anki 持久草稿', () => {
  it.each([false, true])('编辑=%s 保存失败，关闭并刷新后从草稿恢复，成功才清除', async (editing) => {
    const first = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Go 库' }));
    await screen.findByText('原问题');
    fireEvent.click(screen.getByRole('button', { name: editing ? '编辑' : '录入卡片' }));
    fireEvent.change(screen.getByLabelText('Q · 问题'), { target: { value: draft.question } });
    fireEvent.change(screen.getByLabelText('A · 答案'), { target: { value: draft.answer } });
    await screen.findByText('当前库没有标签，可以先保存无标签卡片，或返回卡片库管理标签。');
    fireEvent.click(screen.getByRole('button', { name: '保存卡片' }));
    await screen.findByText(/内容已保留在「卡片草稿」/);
    expect(listAnkiDrafts('alice').drafts).toHaveLength(1);
    expect(listAnkiDrafts('alice').drafts[0].status).toBe('failed');
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    first.unmount();
    mount('/Blog/anki?view=drafts');
    await screen.findByText('草稿问题');
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
    expect(screen.getByLabelText('Q · 问题')).toHaveValue(draft.question);
    expect(screen.getByLabelText('A · 答案')).toHaveValue(draft.answer);
    fail = false;
    await screen.findByText('当前库没有标签，可以先保存无标签卡片，或返回卡片库管理标签。');
    fireEvent.click(screen.getByRole('button', { name: '保存卡片' }));
    await waitFor(() => expect(listAnkiDrafts('alice').drafts).toHaveLength(0));
    expect(request.mock.calls.filter(([, init]) => init?.method === (editing ? 'PATCH' : 'POST'))).toHaveLength(2);
    const body = JSON.parse(String(request.mock.calls.filter(([, init]) => init?.method).at(-1)?.[1]?.body));
    expect(body.answer).toBe(draft.answer);
    if (editing) expect(body).toMatchObject({ version: 2, resetProgress: false });
  });
  it('未提交内容也在刷新后保留，账号间不串草稿；退出隐藏旧账号内容', async () => {
    saveAnkiDraft('alice', draft);
    userId = 'bob';
    const page = mount('/Blog/anki?view=drafts');
    expect(await screen.findByText('暂无卡片草稿。')).toBeInTheDocument();
    expect(screen.queryByText('草稿问题')).not.toBeInTheDocument();
    page.unmount();
    userId = 'alice';
    mount('/Blog/anki?view=drafts');
    await screen.findByText('草稿问题');
    fireEvent(window, new Event('dblog-account-change'));
    await screen.findByText('登录后，查看自己的卡片库');
    expect(screen.queryByText('草稿问题')).not.toBeInTheDocument();
    expect(listAnkiDrafts('alice').drafts).toHaveLength(1);
  });
  it('存储不可用时如实提示，保留编辑框，不声称已保存草稿', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    render(
      <AnkiDialogs
        userId="alice"
        state={{ kind: 'card', deckId: 'd1' }}
        dashboard={dashboard}
        onClose={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Q · 问题'), { target: { value: draft.question } });
    fireEvent.change(screen.getByLabelText('A · 答案'), { target: { value: draft.answer } });
    await screen.findByText('当前库没有标签，可以先保存无标签卡片，或返回卡片库管理标签。');
    fireEvent.click(screen.getByRole('button', { name: '保存卡片' }));
    await screen.findByText(/本机草稿保存也失败/);
    expect(screen.getByLabelText('A · 答案')).toHaveValue(draft.answer);
    expect(listAnkiDrafts('alice').drafts).toHaveLength(0);
  });
  it('损坏草稿不被覆盖或删除，多条草稿独立保存', () => {
    localStorage.setItem('dblog:anki:draft:v1:alice:draft1', 'broken');
    expect(() => saveAnkiDraft('alice', draft)).toThrow();
    expect(localStorage.getItem('dblog:anki:draft:v1:alice:draft1')).toBe('broken');
    saveAnkiDraft('alice', { ...draft, id: 'draft2' });
    expect(listAnkiDrafts('alice')).toMatchObject({ damaged: 1, drafts: [{ id: 'draft2' }] });
  });
  it('关闭时取消在途保存，晚到响应不清除草稿或触发成功', async () => {
    let release: ((value: Response) => void) | undefined;
    request.mockImplementation((input) =>
      String(input).endsWith('/tags')
        ? Promise.resolve(json({ tags: [] }))
        : new Promise((resolve) => {
            release = resolve;
          }),
    );
    const done = vi.fn();
    const page = render(
      <AnkiDialogs
        userId="alice"
        state={{ kind: 'card', deckId: 'd1' }}
        dashboard={dashboard}
        onClose={vi.fn()}
        onDone={done}
      />,
    );
    fireEvent.change(screen.getByLabelText('Q · 问题'), { target: { value: draft.question } });
    fireEvent.change(screen.getByLabelText('A · 答案'), { target: { value: draft.answer } });
    await screen.findByText('当前库没有标签，可以先保存无标签卡片，或返回卡片库管理标签。');
    fireEvent.click(screen.getByRole('button', { name: '保存卡片' }));
    page.unmount();
    await act(async () => {
      release?.(json(card));
    });
    expect(done).not.toHaveBeenCalled();
    expect(listAnkiDrafts('alice').drafts).toHaveLength(1);
  });
});
