import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnkiActivityLog } from './AnkiActivityLog';
import type { AnkiActivity } from './anki-api';

const entry = (id: string, rating: AnkiActivity['rating'] = 'correct'): AnkiActivity => ({
  id,
  kind: rating === '' ? 'create' : 'review',
  occurredAt: '2026-11-10T08:00:00Z',
  deckName: 'Go',
  categoryName: '编程',
  question: '切片共享\n底层数组？',
  rating,
  customDays: rating === 'custom' ? 7 : null,
  historical: false,
});
const page = (date: string, entries: AnkiActivity[], nextCursor = '') =>
  new Response(JSON.stringify({ date, today: '2026-11-10', timeZone: 'Asia/Shanghai', entries, nextCursor }));
let request: ReturnType<typeof vi.fn<typeof fetch>>;
let clipboard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const date = new URL(String(input), 'https://blog.example.com').searchParams.get('date')!;
    return page(date, [entry('1', ''), entry('2'), entry('3'), entry('4', 'hard'), entry('5', 'wrong')]);
  });
  clipboard = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', request);
  vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } });
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const firstDay = () => within(screen.getByRole('region', { name: '所选日操作记录' }));
const previousDay = () => within(screen.getByRole('region', { name: '前一天操作记录' }));
const mount = () =>
  render(
    <StrictMode>
      <AnkiActivityLog today="2026-11-10" />
    </StrictMode>,
  );

describe('Anki 每日操作记录', () => {
  it('默认当天和昨天，只有一个日期选择器，上海时间与重复自评按行保留并复制', async () => {
    mount();
    expect(screen.getByLabelText('操作日期')).toHaveValue('2026-11-10');
    expect(screen.getByLabelText('操作日期')).toHaveAttribute('max', '2026-11-10');
    expect(screen.getAllByLabelText('操作日期')).toHaveLength(1);
    expect(firstDay().getByRole('heading', { name: '2026-11-10 所选日' })).toBeInTheDocument();
    expect(previousDay().getByRole('heading', { name: '2026-11-09 前一天' })).toBeInTheDocument();
    await firstDay().findByText('5 条操作');
    expect(firstDay().getAllByRole('listitem')).toHaveLength(5);
    expect(firstDay().getAllByText('Go | 切片共享 底层数组？ | ✅')).toHaveLength(2);
    expect(firstDay().getByText('Go | 切片共享 底层数组？ | 😩')).toBeInTheDocument();
    expect(firstDay().getByText('Go | 切片共享 底层数组？ | ❌')).toBeInTheDocument();
    expect(firstDay().getByText('Go | 切片共享 底层数组？ | 新增')).toBeInTheDocument();
    expect(firstDay().getAllByText('16:00:00')).toHaveLength(5);
    fireEvent.click(firstDay().getByRole('button', { name: '复制当天' }));
    await firstDay().findByText('已复制当天全部操作');
    const text = clipboard.mock.calls[0][0] as string;
    expect(text).toBe(
      [
        '2026-11-10 Anki 操作记录',
        'Go | 切片共享 底层数组？ | 新增',
        'Go | 切片共享 底层数组？ | ✅',
        'Go | 切片共享 底层数组？ | ✅',
        'Go | 切片共享 底层数组？ | 😩',
        'Go | 切片共享 底层数组？ | ❌',
      ].join('\n'),
    );
    expect(text).not.toMatch(/Card-Repo|Category|Question|编程/);
    expect(request.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });

  it('选择更早日期时前一天自动联动，快切日期取消旧请求，晚返回不能覆盖新日期', async () => {
    const resolveOld: Array<(response: Response) => void> = [];
    request.mockImplementation(async (input) => {
      const date = new URL(String(input), 'https://example.com').searchParams.get('date')!;
      if (date === '2026-01-01')
        return new Promise<Response>((resolve) => {
          resolveOld.push(resolve);
        });
      return page(date, [entry(date === '2026-01-02' ? 'new' : 'old')]);
    });
    mount();
    await firstDay().findByText('1 条操作');
    fireEvent.change(screen.getByLabelText('操作日期'), { target: { value: '2026-01-01' } });
    expect(previousDay().getByRole('heading', { name: '2025-12-31 前一天' })).toBeInTheDocument();
    const oldSignal = request.mock.calls.find(([url]) => String(url).includes('date=2026-01-01'))?.[1]?.signal;
    fireEvent.change(screen.getByLabelText('操作日期'), { target: { value: '2026-01-02' } });
    await firstDay().findByText('1 条操作');
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => resolveOld.forEach((resolve) => resolve(page('2026-01-01', [entry('late', 'wrong')]))));
    expect(firstDay().queryByText(/❌/)).not.toBeInTheDocument();
    expect(previousDay().getByRole('heading', { name: '2026-01-01 前一天' })).toBeInTheDocument();
    fireEvent.click(firstDay().getByRole('button', { name: '复制当天' }));
    await waitFor(() => expect(clipboard).toHaveBeenCalled());
    expect(clipboard.mock.calls[0][0]).toContain('2026-01-02 Anki 操作记录');
    fireEvent.click(previousDay().getByRole('button', { name: '复制当天' }));
    await waitFor(() => expect(clipboard).toHaveBeenCalledTimes(2));
    expect(clipboard.mock.calls[1][0]).toContain('2026-01-01 Anki 操作记录');
  });

  it('单日跨页全部加载后才可复制，分页失败如实报错而不复制部分日志', async () => {
    let fail = true;
    request.mockImplementation(async (input) => {
      const query = new URL(String(input), 'https://example.com').searchParams;
      if (query.get('date') === '2026-11-09') return page('2026-11-09', []);
      if (!query.has('cursor')) return page('2026-11-10', [entry('1')], '1');
      if (fail) return new Response('failure', { status: 503 });
      return page('2026-11-10', [entry('2'), entry('3', 'custom')]);
    });
    mount();
    await firstDay().findByRole('alert');
    expect(firstDay().getByRole('button', { name: '复制当天' })).toBeDisabled();
    expect(firstDay().queryByRole('list')).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(firstDay().getByRole('button', { name: '重新加载' }));
    await firstDay().findByText('3 条操作');
    expect(firstDay().getByText(/自定义间隔\(7天\)/)).toBeInTheDocument();
    fireEvent.click(firstDay().getByRole('button', { name: '复制当天' }));
    await waitFor(() => expect(clipboard).toHaveBeenCalled());
    expect((clipboard.mock.calls[0][0] as string).split('\n')).toHaveLength(4);
  });

  it('空日禁用复制，错误与旧快照清晰反馈，用户内容安全渲染', async () => {
    request.mockImplementation(async (input) => {
      const date = new URL(String(input), 'https://example.com').searchParams.get('date')!;
      return page(
        date,
        date.endsWith('10') ? [{ ...entry('1'), question: '<img src=x onerror=alert(1)>', historical: true }] : [],
      );
    });
    const { container } = mount();
    await firstDay().findByText('1 条操作');
    expect(firstDay().getByText(/历史补入记录的内容/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('region', { name: '前一天操作记录' })).toHaveTextContent('这一天没有操作记录。');
    clipboard.mockRejectedValue(new Error('denied'));
    fireEvent.click(firstDay().getByRole('button', { name: '复制当天' }));
    await firstDay().findByText('复制失败，请重试或手动选择记录复制');
  });

  it('切日或卸载后忽略复制结果，刷新重取日志，未来日期不能选中', async () => {
    let resolveCopy: (value: undefined) => void = () => {};
    clipboard.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCopy = resolve;
        }),
    );
    const { rerender, unmount } = mount();
    await firstDay().findByText('5 条操作');
    fireEvent.click(firstDay().getByRole('button', { name: '复制当天' }));
    fireEvent.change(screen.getByLabelText('操作日期'), { target: { value: '2026-01-02' } });
    await firstDay().findByText('5 条操作');
    await act(async () => resolveCopy(undefined));
    expect(firstDay().queryByText('已复制当天全部操作')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('操作日期'), { target: { value: '2026-11-11' } });
    expect(screen.getByLabelText('操作日期')).toHaveValue('2026-01-02');
    request.mockClear();
    rerender(
      <StrictMode>
        <AnkiActivityLog today="2026-11-10" refreshToken={1} />
      </StrictMode>,
    );
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await firstDay().findByText('5 条操作');
    fireEvent.click(firstDay().getByRole('button', { name: '复制当天' }));
    unmount();
    await act(async () => resolveCopy(undefined));
    expect(screen.queryByText('已复制当天全部操作')).not.toBeInTheDocument();
  });

  it('服务端渲染只依赖提供的日期，首帧不访问云端或本机时钟', () => {
    const html = renderToString(<AnkiActivityLog today="2026-11-10" />);
    expect(html).toContain('value="2026-11-10"');
    expect(html).toContain('2026-11-09');
    expect(html.match(/type="date"/g)).toHaveLength(1);
    expect(request).not.toHaveBeenCalled();
  });

  it('无效响应和循环分页停在错误态，同日期选择保留已加载记录', async () => {
    mount();
    await firstDay().findByText('5 条操作');
    const before = request.mock.calls.length;
    fireEvent.change(screen.getByLabelText('操作日期'), { target: { value: '2026-11-10' } });
    expect(firstDay().getAllByRole('listitem')).toHaveLength(5);
    expect(request.mock.calls).toHaveLength(before);
    request.mockImplementation(async (input) => {
      const query = new URL(String(input), 'https://example.com').searchParams;
      return query.get('date') === '2026-01-02'
        ? page('2026-01-02', [entry('1')], '1')
        : page('wrong-date', [entry('1')]);
    });
    fireEvent.change(screen.getByLabelText('操作日期'), { target: { value: '2026-01-02' } });
    await firstDay().findByText('操作记录分页异常，请重试');
    fireEvent.change(screen.getByLabelText('操作日期'), { target: { value: '2026-01-03' } });
    await firstDay().findByText('操作记录响应无效，请重试');
    expect(firstDay().getByRole('button', { name: '复制当天' })).toBeDisabled();
  });
});
