import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoveTasks from './LoveTasks';
import { CloudError, cloudRequest, type CloudUser } from './api';
import { emptyLoveTasks, type LoveGroup, type LoveTaskSnapshot } from './love-task-model';

vi.mock('./api', async (original) => ({ ...(await original<typeof import('./api')>()), cloudRequest: vi.fn() }));
let account: CloudUser | null;
let snapshot: LoveTaskSnapshot;
const request = vi.mocked(cloudRequest);
const savedGroup = (index: number, text: string, taskText: string, completed = false): LoveGroup => ({
  id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
  text,
  note: '',
  createdOn: '2026-11-07',
  tasks: [
    {
      id: `00000000-0000-4000-8000-${(index + 1000).toString(16).padStart(12, '0')}`,
      text: taskText,
      note: '',
      createdOn: '2026-11-07',
      completedOn: completed ? '2026-11-08' : null,
    },
  ],
});
const mount = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <LoveTasks />
      </MemoryRouter>
    </HelmetProvider>,
  );
const openEditor = async () => {
  await userEvent.click(await screen.findByRole('button', { name: '添加' }));
  return screen.getByRole('dialog', { name: '添加大事项' });
};
const fill = async (text = '一起在深圳生活') => {
  await userEvent.type(screen.getByRole('textbox', { name: '大事项' }), text);
  await userEvent.type(screen.getByRole('textbox', { name: '小任务 1' }), '做一顿饭');
  await userEvent.click(screen.getByRole('button', { name: '再加一项' }));
  await userEvent.type(screen.getByRole('textbox', { name: '小任务 2' }), '走一次公园');
};
const create = async () => {
  await openEditor();
  await fill();
  await userEvent.click(screen.getByRole('button', { name: '保存事项' }));
  await screen.findByRole('checkbox', { name: '标记完成：做一顿饭' });
};
beforeEach(() => {
  account = { id: 'alice', login: 'alice', name: 'Alice', githubBound: false };
  snapshot = { state: emptyLoveTasks(), revision: 0, updatedAt: null };
  request.mockReset();
  request.mockImplementation(async (path, init) => {
    if (path === '/me') return { user: account };
    if (init?.method === 'PUT')
      snapshot = {
        state: JSON.parse(String(init.body)).state,
        revision: snapshot.revision + 1,
        updatedAt: '2026-11-07T00:00:00Z',
      };
    return { user: account, tasks: snapshot };
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('Love 必做分组清单', () => {
  it('keeps private state and API requests out of SSR', () => {
    const html = renderToString(
      <HelmetProvider>
        <MemoryRouter>
          <LoveTasks />
        </MemoryRouter>
      </HelmetProvider>,
    );
    expect(html).toContain('正在检查账号与必做清单');
    expect(html).not.toContain('添加大事项');
    expect(request).not.toHaveBeenCalled();
  });
  it('visitors see login only and never fetch private tasks', async () => {
    account = null;
    const open = vi.fn();
    window.addEventListener('dblog-account-open', open);
    try {
      mount();
      await userEvent.click(await screen.findByRole('button', { name: '登录后记录' }));
      expect(open).toHaveBeenCalledOnce();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '添加' })).not.toBeInTheDocument();
      expect(request.mock.calls.map(([path]) => path)).toEqual(['/me']);
    } finally {
      window.removeEventListener('dblog-account-open', open);
    }
  });
  it('shows saved completed and unfinished content immediately, without an initial form', async () => {
    snapshot.state = {
      version: 2,
      groups: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          text: '一起在深圳生活',
          note: '我们的约定',
          createdOn: '2026-11-07',
          tasks: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              text: '做一顿饭',
              note: '',
              createdOn: '2026-11-07',
              completedOn: '2026-11-08',
            },
            {
              id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              text: '走一次公园',
              note: '',
              createdOn: '2026-11-07',
              completedOn: null,
            },
          ],
        },
      ],
    };
    mount();
    expect(await screen.findByRole('checkbox', { name: '撤销完成：做一顿饭' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '标记完成：走一次公园' })).not.toBeChecked();
    expect(screen.getByRole('heading', { level: 2, name: '一起在深圳生活' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /全部/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('我们一起要做的事')).not.toBeInTheDocument();
    expect(screen.queryByText(/个大事项 ·/)).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '云端同步：已同步到云端' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '云端同步详情' })).not.toBeInTheDocument();
  });
  it('opens a focused modal, traps Tab and restores focus after Escape or cancel', async () => {
    mount();
    const modal = await openEditor();
    const title = within(modal).getByRole('textbox', { name: '大事项' });
    await waitFor(() => expect(title).toHaveFocus());
    screen.getByRole('button', { name: '保存事项' }).focus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: '关闭弹窗' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '添加' })).toHaveFocus());
    await openEditor();
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(request.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
  });
  it('adds, independently completes, edits and deletes a group for a user without GitHub', async () => {
    mount();
    await create();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: '标记完成：做一顿饭' }));
    expect(await screen.findByRole('checkbox', { name: '撤销完成：做一顿饭' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '标记完成：走一次公园' })).not.toBeChecked();
    expect(screen.getByText('1 / 2 已完成')).toBeInTheDocument();
    const originalChild = snapshot.state!.groups[0].tasks[0];
    await userEvent.click(screen.getByRole('button', { name: '编辑：一起在深圳生活' }));
    const title = screen.getByRole('textbox', { name: '大事项' });
    await userEvent.clear(title);
    await userEvent.type(title, '一起在深圳的日子');
    await userEvent.click(screen.getByRole('button', { name: '保存修改' }));
    await screen.findByRole('heading', { name: '一起在深圳的日子' });
    expect(snapshot.state!.groups[0].tasks[0]).toEqual(originalChild);
    await userEvent.click(screen.getByRole('checkbox', { name: '撤销完成：做一顿饭' }));
    await screen.findByRole('checkbox', { name: '标记完成：做一顿饭' });
    await userEvent.click(screen.getByRole('button', { name: '删除：一起在深圳的日子' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: '保留' }));
    await userEvent.click(screen.getByRole('button', { name: '删除：一起在深圳的日子' }));
    await userEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(screen.queryByRole('checkbox')).not.toBeInTheDocument());
    expect(snapshot.state?.groups).toEqual([]);
  });
  it('adds a child to an existing group, preserves old children, and filters by child completion', async () => {
    mount();
    await create();
    const original = snapshot.state!.groups[0].tasks;
    await userEvent.click(screen.getByRole('button', { name: '添加小任务：一起在深圳生活' }));
    await userEvent.type(screen.getByRole('textbox', { name: '小任务 3' }), '看一次海');
    await userEvent.click(screen.getByRole('button', { name: '保存修改' }));
    await screen.findByRole('checkbox', { name: '标记完成：看一次海' });
    expect(snapshot.state!.groups[0].tasks.slice(0, 2)).toEqual(original);
    await userEvent.click(screen.getByRole('checkbox', { name: '标记完成：做一顿饭' }));
    await screen.findByRole('checkbox', { name: '撤销完成：做一顿饭' });
    await userEvent.click(screen.getByRole('button', { name: /已完成/ }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /待完成/ }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });
  it('loads legacy saved content and upgrades to v2 on the next confirmed save', async () => {
    request.mockImplementation(async (path, init) => {
      if (path === '/me') return { user: account };
      if (init?.method === 'PUT') {
        snapshot.state = JSON.parse(String(init.body)).state;
        return { user: account, tasks: snapshot };
      }
      return {
        user: account,
        tasks: {
          ...snapshot,
          state: {
            version: 1,
            tasks: [
              {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                text: '一起看海',
                note: '带上相机',
                createdOn: '2026-11-07',
                completedOn: '2026-11-08',
              },
            ],
          },
        },
      };
    });
    mount();
    await screen.findByRole('checkbox', { name: '撤销完成：一起看海' });
    expect(screen.getByRole('heading', { name: '已记录的愿望' })).toBeInTheDocument();
    expect(screen.getByText('带上相机')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: '撤销完成：一起看海' }));
    await screen.findByRole('checkbox', { name: '标记完成：一起看海' });
    expect(snapshot.state?.version).toBe(2);
  });
  it('retains the modal inputs on failed writes and retries the exact mutation', async () => {
    mount();
    await openEditor();
    await fill();
    request.mockRejectedValueOnce(new Error('offline'));
    await userEvent.click(screen.getByRole('button', { name: '保存事项' }));
    await screen.findByRole('button', { name: '重试保存' });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '大事项' })).toHaveValue('一起在深圳生活');
    expect(screen.getByRole('button', { name: '保存事项' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '重试保存' }));
    await screen.findByRole('checkbox', { name: '标记完成：做一顿饭' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const writes = request.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(writes[0][1]?.body).toBe(writes[1][1]?.body);
  });
  it('handles loading failures and discards a stale editor when reloading after conflict', async () => {
    request.mockRejectedValueOnce(new Error('unavailable'));
    mount();
    await userEvent.click(await screen.findByRole('button', { name: '重新检查' }));
    await openEditor();
    await fill();
    request.mockRejectedValueOnce(new CloudError(409, '', 'conflict'));
    await userEvent.click(screen.getByRole('button', { name: '保存事项' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('其他设备');
    expect(screen.queryByRole('button', { name: '重试保存' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '读取云端版本' }));
    await screen.findByRole('button', { name: '添加' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('clears private state on logout and ignores an old in-flight save', async () => {
    mount();
    await create();
    let resolve!: (data: unknown) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await userEvent.click(screen.getByRole('checkbox', { name: '标记完成：做一顿饭' }));
    account = null;
    act(() => window.dispatchEvent(new CustomEvent('dblog-account-change', { detail: { user: null } })));
    await screen.findByRole('button', { name: '登录后记录' });
    await act(async () => {
      resolve({ user: { id: 'alice' }, tasks: snapshot });
    });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(localStorage.getItem('d-blog-love-tasks')).toBeNull();
  });
  it('does not expose the previous account when accounts change during a load', async () => {
    let resolve!: (data: unknown) => void;
    request.mockImplementationOnce(async () => ({ user: account }));
    request.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mount();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    account = { id: 'bob', login: 'bob', name: 'Bob' };
    act(() => window.dispatchEvent(new CustomEvent('dblog-account-change', { detail: { user: account } })));
    await screen.findByRole('button', { name: '添加' });
    await act(async () => {
      resolve({
        user: { id: 'alice' },
        tasks: { ...snapshot, state: { version: 1, tasks: [{ text: 'Alice 私人清单' }] } },
      });
    });
    expect(screen.queryByText('Alice 私人清单')).not.toBeInTheDocument();
  });
  it('opens sync details with focus, refreshes without closing it and supports Escape and outside click', async () => {
    mount();
    const orb = await screen.findByRole('button', { name: '云端同步：已同步到云端' });
    await userEvent.click(orb);
    const panel = screen.getByRole('region', { name: '云端同步详情' });
    expect(panel).toHaveFocus();
    expect(within(panel).getByText('Alice')).toBeInTheDocument();
    const before = request.mock.calls.length;
    await userEvent.click(within(panel).getByRole('button', { name: '立即同步' }));
    await waitFor(() => expect(orb).toHaveAccessibleName('云端同步：已同步到云端'));
    expect(request.mock.calls.slice(before).map(([path]) => path)).toEqual(['/love/tasks']);
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByText(/最近确认/)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: '云端同步详情' })).not.toBeInTheDocument();
    expect(orb).toHaveFocus();
    await userEvent.click(orb);
    await userEvent.click(screen.getByRole('button', { name: '添加' }));
    expect(screen.queryByRole('region', { name: '云端同步详情' })).not.toBeInTheDocument();
  });
  it('keeps saved content on a refresh failure and recovers through the orb', async () => {
    mount();
    await create();
    await userEvent.click(screen.getByRole('button', { name: '云端同步：已同步到云端' }));
    request.mockRejectedValueOnce(new Error('offline'));
    await userEvent.click(screen.getByRole('button', { name: '立即同步' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('云端刷新失败');
    expect(screen.getByRole('checkbox', { name: '标记完成：做一顿饭' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '云端同步：同步需要重试' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重试同步' }));
    await screen.findByRole('button', { name: '云端同步：已同步到云端' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('retries a pending mutation from sync details after closing the editor', async () => {
    mount();
    await openEditor();
    await fill();
    request.mockRejectedValueOnce(new Error('offline'));
    await userEvent.click(screen.getByRole('button', { name: '保存事项' }));
    await screen.findByRole('button', { name: '重试保存' });
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    await userEvent.click(screen.getByRole('button', { name: '云端同步：同步需要重试' }));
    await userEvent.click(screen.getByRole('button', { name: '重试保存' }));
    await screen.findByRole('checkbox', { name: '标记完成：做一顿饭' });
    const writes = request.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(writes[0][1]?.body).toBe(writes[1][1]?.body);
    expect(screen.getByRole('button', { name: '云端同步：已同步到云端' })).toBeInTheDocument();
  });
  it('rejects late refresh results after an account change and clears the former sync details', async () => {
    mount();
    await create();
    await userEvent.click(screen.getByRole('button', { name: '云端同步：已同步到云端' }));
    let resolve!: (value: unknown) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await userEvent.click(screen.getByRole('button', { name: '立即同步' }));
    const oldSnapshot = snapshot;
    account = { id: 'bob', login: 'bob', name: 'Bob' };
    snapshot = { state: emptyLoveTasks(), revision: 0, updatedAt: null };
    act(() => window.dispatchEvent(new CustomEvent('dblog-account-change', { detail: { user: account } })));
    await screen.findByRole('button', { name: '添加' });
    await act(async () => {
      resolve({ user: { id: 'alice' }, tasks: oldSnapshot });
    });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '云端同步详情' })).not.toBeInTheDocument();
  });
  it('offers conflict reload in the orb without replaying the old mutation', async () => {
    mount();
    await create();
    request.mockRejectedValueOnce(new CloudError(409, '', 'conflict'));
    await userEvent.click(screen.getByRole('checkbox', { name: '标记完成：做一顿饭' }));
    await userEvent.click(await screen.findByRole('button', { name: '云端同步：存在版本冲突' }));
    expect(screen.getByRole('alert')).toHaveTextContent('其他设备');
    expect(screen.queryByRole('button', { name: '重试保存' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '立即同步' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '读取云端版本' }));
    await screen.findByRole('button', { name: '云端同步：已同步到云端' });
    expect(screen.queryByRole('region', { name: '云端同步详情' })).not.toBeInTheDocument();
    expect(request.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(2);
  });
  it('shows one selected group and switches locally with filter counts scoped to that group', async () => {
    const living = savedGroup(1, '一起在深圳生活', '做一顿饭', true);
    const travel = savedGroup(2, '一起去旅行', '看一次日出');
    snapshot.state = { version: 2, groups: [living, travel] };
    mount();
    const select = await screen.findByRole('combobox', { name: '选择大事项' });
    expect(select).toHaveValue(living.id);
    expect(screen.queryByRole('heading', { name: travel.text })).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /已完成/ }));
    await userEvent.selectOptions(select, travel.id);
    expect(screen.getByRole('heading', { name: travel.text })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: living.text })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '标记完成：看一次日出' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /全部/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /已完成/ }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: travel.text })).toBeInTheDocument();
    expect(select).toHaveValue(travel.id);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('preserves hidden groups while completing the selected group and falls back after deleting it', async () => {
    const living = savedGroup(1, '一起在深圳生活', '做一顿饭');
    const travel = savedGroup(2, '一起去旅行', '看一次日出');
    snapshot.state = { version: 2, groups: [living, travel] };
    mount();
    const select = await screen.findByRole('combobox', { name: '选择大事项' });
    await userEvent.selectOptions(select, travel.id);
    await userEvent.click(screen.getByRole('checkbox', { name: '标记完成：看一次日出' }));
    await screen.findByRole('checkbox', { name: '撤销完成：看一次日出' });
    expect(snapshot.state!.groups[0]).toEqual(living);
    await userEvent.click(screen.getByRole('button', { name: `删除：${travel.text}` }));
    await userEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await screen.findByRole('heading', { name: living.text });
    expect(select).toHaveValue(living.id);
    expect(screen.getByRole('checkbox', { name: '标记完成：做一顿饭' })).toBeInTheDocument();
    expect(snapshot.state!.groups).toEqual([living]);
  });
  it('selects a newly saved group and retains that selection when cloud refresh inserts another group', async () => {
    const living = savedGroup(1, '一起在深圳生活', '做一顿饭');
    snapshot.state = { version: 2, groups: [living] };
    mount();
    await openEditor();
    await fill('一起去旅行');
    await userEvent.click(screen.getByRole('button', { name: '保存事项' }));
    await screen.findByRole('heading', { name: '一起去旅行' });
    const select = screen.getByRole('combobox', { name: '选择大事项' });
    const created = snapshot.state!.groups[0];
    expect(select).toHaveValue(created.id);
    expect(screen.queryByRole('heading', { name: living.text })).not.toBeInTheDocument();
    const another = savedGroup(3, '一起过生日', '买一束花');
    snapshot = { ...snapshot, state: { version: 2, groups: [another, ...snapshot.state!.groups] } };
    await userEvent.click(screen.getByRole('button', { name: '云端同步：已同步到云端' }));
    await userEvent.click(screen.getByRole('button', { name: '立即同步' }));
    await screen.findByRole('button', { name: '云端同步：已同步到云端' });
    expect(select).toHaveValue(created.id);
    expect(screen.queryByRole('heading', { name: another.text })).not.toBeInTheDocument();
  });
  it('selects the new group after retrying a failed save from a closed editor', async () => {
    snapshot.state = { version: 2, groups: [savedGroup(1, '一起在深圳生活', '做一顿饭')] };
    mount();
    await openEditor();
    await fill('一起去旅行');
    request.mockRejectedValueOnce(new Error('offline'));
    await userEvent.click(screen.getByRole('button', { name: '保存事项' }));
    await screen.findByRole('button', { name: '重试保存' });
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    await userEvent.click(screen.getByRole('button', { name: '云端同步：同步需要重试' }));
    await userEvent.click(screen.getByRole('button', { name: '重试保存' }));
    await screen.findByRole('heading', { name: '一起去旅行' });
    expect(screen.getByRole('combobox', { name: '选择大事项' })).toHaveValue(snapshot.state!.groups[0].id);
  });
});
