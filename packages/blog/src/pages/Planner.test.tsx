import { act, render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Planner } from './Planner';
import { PLANNER_STORAGE_KEY, type MonthlyPlannerState } from './planner/model';
import type { PlannerSyncUser } from './planner/sync';

vi.mock('@/components/Seo', () => ({ Seo: () => null }));
vi.mock('./planner/PlannerSync', async () => {
  const { useDailyPlanner } = await import('./planner/useDailyPlanner');
  const { DailyPanel } = await import('./planner/DailyPanel');
  return {
    default: function MockPlannerSync({
      onApply,
      user,
      today,
      notify,
    }: {
      onApply: (state: MonthlyPlannerState, user: PlannerSyncUser | null) => void;
      user: PlannerSyncUser | null;
      today: string;
      notify: (message: string, undo?: () => void) => void;
    }) {
      const daily = useDailyPlanner(user);
      return (
        <>
          <section aria-label="测试同步">
            <button
              onClick={() =>
                onApply(
                  { version: 1, months: { '2026-01': [{ id: 'private', text: '账号私有目标', completed: false }] } },
                  { id: 'alice', login: 'alice', name: 'Alice' },
                )
              }
            >
              测试连接
            </button>
            <button onClick={() => onApply(JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY)!), null)}>
              测试退出
            </button>
          </section>
          <DailyPanel key={user?.id ?? 'guest'} daily={daily} today={today} notify={notify} onConnect={() => {}} />
        </>
      );
    },
  };
});
const markdown = '# Monthly Planner\n\n## 2026-01\n\n- [ ] 保留原待办 <!-- id:existing -->\n';
const dailyTask = {
  id: 'carry',
  text: '昨天没做完的事',
  date: '2026-01-06',
  note: '等确认',
  priority: 'high',
  scheduledFor: null,
  completedOn: null,
};
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-07T12:00:00'));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      if (String(url).endsWith('/daily')) {
        const mutation = init?.body ? JSON.parse(init.body) : null;
        return Response.json({
          user: { id: 'alice', login: 'alice', name: 'Alice' },
          planner: {
            state: mutation?.state ?? { version: 1, tasks: [dailyTask] },
            revision: mutation ? mutation.baseRevision + 1 : 1,
            updatedAt: null,
          },
        });
      }
      return new Response(markdown);
    }),
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const mount = async () => {
  const view = render(<Planner />);
  await screen.findByText('保留原待办');
  await screen.findByRole('button', { name: '测试连接' });
  return view;
};
describe('Planner 工作台', () => {
  it('明确编辑本机目标后才写入项目 Markdown', async () => {
    await mount();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    fireEvent.change(screen.getByRole('textbox', { name: '新增月度待办' }), { target: { value: '本机目标' } });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const writes = vi
      .mocked(fetch)
      .mock.calls.filter(([url, init]) => String(url).includes('monthly-planner.md') && init?.method === 'PUT');
    expect(writes).toHaveLength(1);
    expect(writes[0][1]?.body).toContain('- [ ] 本机目标');
  });
  it('载入和退出账号只恢复本机视图，不把未编辑的项目模板回写', async () => {
    await mount();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '测试退出' }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url, init]) => String(url).includes('monthly-planner.md') && init?.method === 'PUT'),
    ).toBe(false);
    expect(screen.getByText('保留原待办')).toBeInTheDocument();
  });
  it('静态页面刷新保留匿名计划，不被项目空模板覆盖', async () => {
    vi.stubEnv('DEV', false);
    localStorage.setItem(
      PLANNER_STORAGE_KEY,
      JSON.stringify({ version: 1, months: { '2026-01': [{ id: 'local', text: '自己的计划', completed: false }] } }),
    );
    render(<Planner />);
    await screen.findByText('自己的计划');
    expect(screen.queryByText('保留原待办')).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.method !== 'PUT')).toBe(true);
  });
  it('真实目标 CRUD、优先级、搜索与撤销，进度只统计月度目标', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: '完成 保留原待办' }));
    expect(screen.getByRole('progressbar', { name: '本月完成率' })).toHaveAttribute('aria-valuenow', '100');
    fireEvent.click(screen.getByRole('button', { name: '新增目标' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('任务名称'), { target: { value: '学习新知识' } });
    fireEvent.change(within(dialog).getByLabelText('分类'), { target: { value: 'learning' } });
    fireEvent.change(within(dialog).getByLabelText('优先级'), { target: { value: 'high' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存任务' }));
    expect(screen.getByRole('progressbar', { name: '本月完成率' })).toHaveAttribute('aria-valuenow', '50');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '学习' } });
    expect(screen.queryByText('保留原待办')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '编辑 学习新知识' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '删除' }));
    expect(screen.queryByText('学习新知识')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.getByText('学习新知识')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY)!).months['2026-01'][1]).toMatchObject({
      category: 'learning',
      priority: 'high',
    });
  });
  it('连接后不把私有目标写入公共 Markdown/缓存，每日遗留支持排期与完成，退出清空', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    await screen.findByText('昨天没做完的事');
    expect(JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY)!).months['2026-01'][0].text).toBe('保留原待办');
    const panel = screen.getByRole('region', { name: '每日遗留' });
    fireEvent.click(within(panel).getByRole('button', { name: '明天' }));
    expect(screen.getByText('安排于 01-08')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: '完成' }));
    expect(screen.queryByText('昨天没做完的事')).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: /已完成/ }));
    expect(screen.getByText('昨天没做完的事')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(([url, init]) => String(url).endsWith('/daily') && init?.method === 'PUT'),
      ).toBe(true),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url, init]) => String(url).includes('monthly-planner.md') && init?.method === 'PUT'),
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '测试退出' }));
    expect(screen.queryByText('昨天没做完的事')).not.toBeInTheDocument();
    expect(screen.getByText('保留原待办')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: '每日遗留' })).getByRole('button', { name: '记录一条遗留' }),
    ).toBeDisabled();
  });
  it('加载失败时读取本机缓存并如实提示', async () => {
    localStorage.setItem(
      PLANNER_STORAGE_KEY,
      JSON.stringify({ version: 1, months: { '2026-01': [{ id: 'cached', text: '缓存目标', completed: false }] } }),
    );
    vi.mocked(fetch).mockRejectedValue(new Error('网络断开'));
    render(<Planner />);
    await screen.findByText('缓存目标');
    expect(screen.getByText('项目 Markdown 读取失败，已使用浏览器缓存。')).toBeInTheDocument();
  });
  it('SSR 首帧确定且不发起账号、日期或文件读写', () => {
    const first = renderToString(<Planner />);
    vi.setSystemTime(new Date('2030-12-31T23:59:59'));
    expect(renderToString(<Planner />)).toBe(first);
    expect(first).toContain('把日子，慢慢理顺。');
    expect(fetch).not.toHaveBeenCalled();
  });
});
