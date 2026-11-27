import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WeeklyJournal from './WeeklyJournal';
import { emptyWeek, type WeeklyState } from './weekly-model';

const owner = { id: 'alice', login: 'alice', name: 'Alice' };
const response = (week = '2026-11-09', state: WeeklyState | null = null, revision = 0) => ({
  user: owner,
  weekStart: week,
  today: '2026-11-12',
  archive: { state, revision, updatedAt: null },
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}
function mount(query = '') {
  return render(
    <MemoryRouter initialEntries={[`/weekly-journal${query}`]}>
      <WeeklyJournal />
      <Location />
    </MemoryRouter>,
  );
}
async function ready() {
  return screen.findByRole('listitem', { name: '周一记录' });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T01:30:00Z'));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json(response())),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('周记页面', () => {
  it('匿名只见登录入口；SSR不请求API、不显示当前时钟', async () => {
    vi.mocked(fetch).mockResolvedValue(json({}, 401));
    const html = renderToString(
      <MemoryRouter>
        <WeeklyJournal />
      </MemoryRouter>,
    );
    expect(html).toContain('正在加载周记');
    expect(html).not.toContain('2026-11-12');
    expect(fetch).not.toHaveBeenCalled();
    mount();
    expect(await screen.findByRole('heading', { name: '登录后，记录自己的这一周' })).toBeInTheDocument();
    expect(screen.queryByLabelText('选择一周')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '使用 GitHub 登录' })).toHaveAttribute(
      'href',
      '/api/v1/auth/github/start?return_to=%2Fweekly-journal',
    );
  });

  it('七天完整分组，日期选择归到周一并更新真实路由', async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      const week = new URL(String(url), 'http://localhost').searchParams.get('week') || '2026-11-09';
      return json(response(week));
    });
    mount();
    await ready();
    for (const label of ['周一', '周二', '周三', '周四', '周五', '周六', '周日']) {
      expect(screen.getByRole('heading', { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
    fireEvent.change(screen.getByLabelText('选择一周'), { target: { value: '2026-01-04' } });
    await screen.findByText('2025-12-29 — 2026-01-04');
    expect(screen.getByTestId('location')).toHaveTextContent('week=2025-12-29');
    fireEvent.click(screen.getByRole('button', { name: '回到本周' }));
    await waitFor(() => expect(screen.getByLabelText('选择一周')).toHaveValue('2026-11-09'));
  });

  it('保存Markdown记录，模板与重新加载后的正文保持', async () => {
    let saved = emptyWeek('2026-11-09');
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      if (init?.method === 'PUT') {
        saved = JSON.parse(String(init.body)).state;
        return json(response('2026-11-09', saved, 1));
      }
      return json(response('2026-11-09', saved));
    });
    const view = mount();
    await ready();
    fireEvent.click(screen.getByRole('listitem', { name: '周一记录' }));
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    await screen.findByRole('textbox', { name: '周一记录内容' });
    fireEvent.click(screen.getByRole('button', { name: '插入记录模板' }));
    expect((screen.getByRole('textbox', { name: '周一记录内容' }) as HTMLTextAreaElement).value).toContain(
      '### 遗留问题',
    );
    fireEvent.change(screen.getByRole('textbox', { name: '周一记录内容' }), {
      target: { value: '### 今日完成\n\n[跳跃游戏](https://leetcode.cn/problems/jump-game/)' },
    });
    await waitFor(() => expect(saved.days[0].content).toContain('跳跃游戏'), { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: '预览' }));
    expect(await screen.findByRole('link', { name: '跳跃游戏' })).toHaveAttribute(
      'href',
      'https://leetcode.cn/problems/jump-game/',
    );
    expect(saved.days[0].content).toContain('跳跃游戏');
    view.unmount();
    mount();
    await waitFor(() => expect(screen.getByRole('link', { name: '跳跃游戏' })).toBeInTheDocument());
  });

  it('移除随想及手动保存入口，旧随想不出现在页面或计数中', async () => {
    const saved = emptyWeek('2026-11-02');
    saved.days[0].thoughts = [
      { id: '11111111-1111-4111-8111-111111111111', content: '过去的想法', createdAt: '2026-11-02T00:00:00Z' },
    ];
    vi.mocked(fetch).mockImplementation(async (_, init) =>
      init?.method === 'PUT'
        ? json(response('2026-11-02', JSON.parse(String(init.body)).state, 2))
        : json(response('2026-11-02', saved, 1)),
    );
    mount('?week=2026-11-02');
    await ready();
    expect(screen.queryByLabelText('当天随想内容')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '记下随想' })).not.toBeInTheDocument();
    expect(screen.queryByText('过去的想法')).not.toBeInTheDocument();
    expect(screen.getByText(/0 \/ 7 天有记录/)).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
    fireEvent.click(screen.getByRole('listitem', { name: '周一记录' }));
    await screen.findByRole('textbox', { name: '周一记录内容' });
    fireEvent.click(screen.getByRole('button', { name: /^周记云端同步/ }));
    expect(
      screen.queryByRole('button', { name: /编辑记录|写点记录|保存记录|立即保存|核对后保存/ }),
    ).not.toBeInTheDocument();
  });

  it('并发冲突加载最新记录并保留编辑草稿，重试不覆盖其他天', async () => {
    const latest = emptyWeek('2026-11-09');
    latest.days[1].content = '另一个窗口的周二记录';
    let reads = 0;
    let writes = 0;
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      if (init?.method === 'PUT') {
        writes++;
        if (writes === 1) return json({}, 409);
        return json(response('2026-11-09', JSON.parse(String(init.body)).state, 2));
      }
      return json(response('2026-11-09', reads++ ? latest : null, reads > 1 ? 1 : 0));
    });
    mount();
    await ready();
    fireEvent.click(screen.getByRole('listitem', { name: '周一记录' }));
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    await screen.findByRole('textbox', { name: '周一记录内容' });
    fireEvent.change(screen.getByRole('textbox', { name: '周一记录内容' }), { target: { value: '我的周一草稿' } });
    await screen.findByText(/周记已在其他窗口更新/, {}, { timeout: 3000 });
    expect(screen.getByRole('textbox', { name: '周一记录内容' })).toHaveValue('我的周一草稿');
    fireEvent.click(screen.getByRole('button', { name: '使用当前版本' }));
    await screen.findByText('已保存到云端');
    expect(screen.getByText('另一个窗口的周二记录')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '周一记录内容' })).toHaveValue('我的周一草稿');
  });

  it('账号退出清理私密正文和草稿，并丢弃迟到的保存响应', async () => {
    let finish!: (value: Response) => void;
    const saved = emptyWeek('2026-11-09');
    saved.days[1].content = '私密周二';
    let loggedIn = true;
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      if (init?.method === 'PUT')
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      return loggedIn ? json(response('2026-11-09', saved, 1)) : json({}, 401);
    });
    mount();
    await ready();
    fireEvent.click(screen.getByRole('listitem', { name: '周一记录' }));
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    fireEvent.change(await screen.findByRole('textbox', { name: '周一记录内容' }), { target: { value: '私密草稿' } });
    await waitFor(() => expect(finish).toBeTypeOf('function'), { timeout: 3000 });
    loggedIn = false;
    act(() => window.dispatchEvent(new Event('dblog-account-change')));
    await screen.findByRole('heading', { name: '登录后，记录自己的这一周' });
    await act(async () => finish(json(response('2026-11-09', saved, 2))));
    expect(screen.queryByText('私密周二')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('私密草稿')).not.toBeInTheDocument();
  });

  it('快速切周丢弃旧周迟到响应', async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(async (url) => {
      const week = new URL(String(url), 'http://localhost').searchParams.get('week');
      if (week === '2026-11-02')
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      return json(response(week || '2026-11-09'));
    });
    const view = mount();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '上一周' }));
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    view.unmount();
    mount('?week=2026-11-16');
    await screen.findByText('2026-11-16 — 2026-11-22');
    await act(async () => finish(json(response('2026-11-02'))));
    expect(screen.getByText('2026-11-16 — 2026-11-22')).toBeInTheDocument();
    expect(screen.queryByText('2026-11-02 — 2026-11-08')).not.toBeInTheDocument();
  });

  it('文档与Markdown切换后自动保存，保留高亮和留言定位，刷新可恢复', async () => {
    let saved = emptyWeek('2026-11-09');
    let revision = 0;
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      if (init?.method === 'PUT') {
        saved = JSON.parse(String(init.body)).state;
        revision++;
      }
      return json(response('2026-11-09', saved, revision));
    });
    const rendered = mount();
    await ready();
    fireEvent.click(screen.getByRole('listitem', { name: '周一记录' }));
    const doc = await screen.findByRole('textbox', { name: '周一记录内容' });
    const editor = (doc as HTMLElement & { editor: import('@tiptap/core').Editor }).editor;
    act(() => editor.commands.insertContent('今日学会自动保存'));
    await waitFor(() => expect(saved.days[0].content).toContain('今日学会自动保存'), { timeout: 3000 });
    expect(doc).toHaveAttribute('contenteditable', 'true');
    act(() => editor.commands.setTextSelection({ from: 3, to: 7 }));
    fireEvent.click(screen.getByRole('button', { name: '高亮' }));
    fireEvent.click(screen.getByRole('button', { name: '添加评论' }));
    fireEvent.change(screen.getByRole('textbox', { name: '评论内容' }), { target: { value: '明天继续练习' } });
    fireEvent.click(screen.getByRole('button', { name: '提交评论' }));
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    expect((screen.getByRole('textbox', { name: '周一记录内容' }) as HTMLTextAreaElement).value).toContain('<mark');
    expect(
      within(screen.getByRole('complementary', { name: '周一留言' })).getByText('明天继续练习'),
    ).toBeInTheDocument();
    await waitFor(() => expect(saved.days[0].comments?.[0].body).toBe('明天继续练习'), { timeout: 3000 });
    rendered.unmount();
    mount();
    expect(await screen.findByText('明天继续练习')).toBeInTheDocument();
    const restored = await screen.findByRole('textbox', { name: '周一记录内容' });
    expect(restored.querySelector('mark')).toHaveTextContent('学会自动');
    fireEvent.click(screen.getByRole('button', { name: '定位原文：学会自动' }));
    expect(restored.querySelector('.is-comment-active')).toHaveTextContent('学会自动');
  });

  it('切周前保存尚未自动写入的内容；未提交留言阻止切周', async () => {
    const archives = new Map<string, WeeklyState>();
    const events: string[] = [];
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const week = new URL(String(url), 'http://localhost').searchParams.get('week') || '2026-11-09';
      events.push(`${init?.method || 'GET'}:${week}`);
      if (init?.method === 'PUT') archives.set(week, JSON.parse(String(init.body)).state);
      return json(response(week, archives.get(week) ?? null, archives.has(week) ? 1 : 0));
    });
    mount();
    await ready();
    fireEvent.click(screen.getByRole('listitem', { name: '周一记录' }));
    const doc = await screen.findByRole('textbox', { name: '周一记录内容' });
    const editor = (doc as HTMLElement & { editor: import('@tiptap/core').Editor }).editor;
    act(() => {
      editor.commands.insertContent('切周前的记录');
      editor.commands.setTextSelection({ from: 1, to: 4 });
    });
    fireEvent.click(screen.getByRole('button', { name: '添加评论' }));
    fireEvent.click(screen.getByRole('button', { name: '上一周' }));
    expect(await screen.findByText(/请先提交或取消正在编写的留言/)).toBeInTheDocument();
    expect(screen.getByLabelText('选择一周')).toHaveValue('2026-11-09');
    fireEvent.click(screen.getByRole('button', { name: '取消评论' }));
    fireEvent.click(screen.getByRole('button', { name: '上一周' }));
    await screen.findByText('2026-11-02 — 2026-11-08');
    expect(archives.get('2026-11-09')?.days[0].content).toContain('切周前的记录');
    expect(events.indexOf('PUT:2026-11-09')).toBeLessThan(events.indexOf('GET:2026-11-02'));
  });

  it('点击卡片即聚焦正文，键盘可切换到另一张记录，切换后保留输入', async () => {
    let saved = emptyWeek('2026-11-09');
    let revision = 0;
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      if (init?.method === 'PUT') {
        saved = JSON.parse(String(init.body)).state;
        revision++;
      }
      return json(response('2026-11-09', saved, revision));
    });
    mount();
    fireEvent.click(await ready());
    const monday = await screen.findByRole('textbox', { name: '周一记录内容' });
    await waitFor(() => expect(monday).toHaveFocus());
    const editor = (monday as HTMLElement & { editor: import('@tiptap/core').Editor }).editor;
    act(() => editor.commands.insertContent('周一自动保存'));
    fireEvent.keyDown(screen.getByRole('listitem', { name: '周二记录' }), { key: 'Enter' });
    const tuesday = await screen.findByRole('textbox', { name: '周二记录内容' });
    await waitFor(() => expect(tuesday).toHaveFocus());
    expect(monday).toHaveAttribute('contenteditable', 'false');
    expect(screen.getAllByRole('toolbar')).toHaveLength(1);
    await waitFor(() => expect(saved.days[0].content).toContain('周一自动保存'), { timeout: 3000 });
    fireEvent.click(screen.getByRole('listitem', { name: '周一记录' }));
    expect(screen.getByRole('textbox', { name: '周一记录内容' })).toHaveTextContent('周一自动保存');
  });
});
