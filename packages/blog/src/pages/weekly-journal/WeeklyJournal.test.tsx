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
  return screen.findByRole('button', { name: '周一写点记录' });
}

beforeEach(() => {
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
    await ready();
    expect(screen.getByLabelText('选择一周')).toHaveValue('2026-11-09');
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
    fireEvent.click(screen.getByRole('button', { name: '周一写点记录' }));
    fireEvent.click(screen.getByRole('button', { name: '插入记录模板' }));
    expect((screen.getByLabelText('周一记录内容') as HTMLTextAreaElement).value).toContain('### 遗留问题');
    fireEvent.change(screen.getByLabelText('周一记录内容'), {
      target: { value: '### 今日完成\n\n[跳跃游戏](https://leetcode.cn/problems/jump-game/)' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存记录' }));
    expect(await screen.findByRole('link', { name: '跳跃游戏' })).toHaveAttribute(
      'href',
      'https://leetcode.cn/problems/jump-game/',
    );
    expect(saved.days[0].content).toContain('跳跃游戏');
    view.unmount();
    mount();
    await waitFor(() => expect(screen.getByRole('link', { name: '跳跃游戏' })).toBeInTheDocument());
  });

  it('随想归今天、按时间展示；失败保留输入且重试复用请求避免重复', async () => {
    const writes: string[] = [];
    vi.mocked(fetch).mockImplementation(async (_, init) => {
      if (init?.method !== 'PUT') return json(response());
      writes.push(String(init.body));
      if (writes.length === 1) throw new Error('网络暂时失败');
      const state = JSON.parse(String(init.body)).state as WeeklyState;
      return json(response('2026-11-09', state, 1));
    });
    mount();
    await ready();
    const thursday = screen.getByRole('heading', { name: /^周四/ }).closest('li')!;
    expect(within(thursday).getByLabelText('当天随想内容')).toBeInTheDocument();
    const monday = screen.getByRole('heading', { name: /^周一/ }).closest('li')!;
    expect(within(monday).queryByLabelText('当天随想内容')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('当天随想内容'), { target: { value: '今天终于理解了 Context' } });
    fireEvent.click(screen.getByRole('button', { name: '记下随想' }));
    await screen.findByText('网络暂时失败');
    expect(screen.getByLabelText('当天随想内容')).toHaveValue('今天终于理解了 Context');
    fireEvent.click(screen.getByRole('button', { name: '记下随想' }));
    await screen.findByText('已记到今天的随想');
    expect(writes[1]).toBe(writes[0]);
    expect(within(thursday).getByText('今天终于理解了 Context')).toBeInTheDocument();
    expect(within(thursday).getByText('09:30')).toBeInTheDocument();
    expect(screen.getByLabelText('当天随想内容')).toHaveValue('');
  });

  it('历史周不把今天随想写入过去；删除需要明确确认', async () => {
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
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '删除周一08:00的随想' }));
    expect(screen.getByText('过去的想法')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await screen.findByText('随想已删除');
    expect(screen.queryByText('过去的想法')).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: '周一写点记录' }));
    fireEvent.change(screen.getByLabelText('周一记录内容'), { target: { value: '我的周一草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '保存记录' }));
    await screen.findByText(/周记已在其他窗口更新/);
    expect(screen.getByLabelText('周一记录内容')).toHaveValue('我的周一草稿');
    fireEvent.click(screen.getByRole('button', { name: '保存记录' }));
    await screen.findByText('记录已保存');
    expect(screen.getByText('另一个窗口的周二记录')).toBeInTheDocument();
    expect(screen.getByText('我的周一草稿')).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('当天随想内容'), { target: { value: '私密草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '记下随想' }));
    await waitFor(() => expect(finish).toBeTypeOf('function'));
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
});
