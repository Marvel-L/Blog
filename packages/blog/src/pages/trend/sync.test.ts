import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState, STORAGE_KEY, type TrendState } from './model';
import {
  draftKey,
  sameData,
  SyncError,
  TrendSynchronizer,
  type Mutation,
  type Snapshot,
  type SyncResponse,
  type SyncView,
  type Transport,
} from './sync';

const user = { id: 'alice', login: 'alice', name: 'Alice' };
const state = (name: string) => {
  const value = defaultState();
  value.categories[0].name = name;
  return value;
};
const snapshot = (value: TrendState | null, revision = 1): Snapshot => ({ state: value, revision, updatedAt: null });
const response = (dashboard: Snapshot): SyncResponse => ({ user, dashboard });
const deferred = <T>() => {
  let resolve!: (data: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
function fixture(initial = defaultState(), remote = snapshot(null, 0)) {
  let view: SyncView | undefined;
  let local = initial;
  let scope: string | null = null;
  const load = vi.fn(async () => response(remote));
  const save = vi.fn(async (mutation: Mutation) => response(snapshot(mutation.state, mutation.baseRevision + 1)));
  const transport: Transport = { load, save };
  const apply = vi.fn((value: TrendState, identity: typeof user | null) => {
    local = value;
    scope = identity?.id ?? null;
  });
  const engine = new TrendSynchronizer(
    initial,
    apply,
    (next) => {
      view = next;
    },
    localStorage,
  );
  return { engine, transport, load, save, apply, view: () => view!, local: () => local, scope: () => scope };
}

describe('Trend 自动同步', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('首次连接空云端自动上传，后续修改防抖保存且切换类别不上传', async () => {
    const f = fixture();
    await f.engine.connect(f.transport);
    await vi.advanceTimersByTimeAsync(700);
    expect(f.save).toHaveBeenCalledTimes(1);
    expect(f.save.mock.calls[0][0].baseRevision).toBe(0);
    expect(f.view().status).toBe('已同步到云端');
    f.engine.edit(state('咖啡'));
    f.engine.edit(state('零食新名称'));
    await vi.advanceTimersByTimeAsync(700);
    expect(f.save).toHaveBeenCalledTimes(2);
    expect(f.save.mock.calls[1][0].state.categories[0].name).toBe('零食新名称');
    expect(JSON.parse(localStorage.getItem(draftKey(user.id))!).base.revision).toBe(2);
    f.engine.edit({ ...state('零食新名称'), selectedId: 'snacks' });
    await vi.advanceTimersByTimeAsync(700);
    expect(f.save).toHaveBeenCalledTimes(2);
    f.engine.stop();
  });

  it('示例自动采用云端，已有本地修改先显示冲突，可显式上传本地版本', async () => {
    const clean = fixture(defaultState(), snapshot(state('云端零食'), 4));
    await clean.engine.connect(clean.transport);
    expect(clean.local().categories[0].name).toBe('云端零食');
    expect(clean.view().conflict).toBeNull();
    clean.engine.stop();
    localStorage.clear();
    const dirty = fixture(state('本地零食'), snapshot(state('云端零食'), 4));
    await dirty.engine.connect(dirty.transport);
    await vi.advanceTimersByTimeAsync(700);
    expect(dirty.view().conflict?.revision).toBe(4);
    expect(dirty.save).not.toHaveBeenCalled();
    dirty.engine.resolve(false);
    await vi.advanceTimersByTimeAsync(700);
    expect(dirty.save.mock.calls[0][0].baseRevision).toBe(4);
    expect(dirty.save.mock.calls[0][0].state.categories[0].name).toBe('本地零食');
    dirty.engine.stop();
  });

  it('离线/响应丢失保留同一 mutation，重连识别已提交版本后再上传新编辑', async () => {
    const f = fixture(defaultState(), snapshot(defaultState(), 1));
    await f.engine.connect(f.transport);
    f.save.mockRejectedValueOnce(new Error('offline'));
    f.engine.edit(state('修改一'));
    await vi.advanceTimersByTimeAsync(700);
    const first = f.save.mock.calls[0][0];
    f.engine.edit(state('修改二'));
    await f.engine.tick();
    expect(f.save.mock.calls[1][0]).toEqual(first);
    await vi.advanceTimersByTimeAsync(700);
    expect(f.save.mock.calls[2][0].state.categories[0].name).toBe('修改二');
    expect(f.save.mock.calls[2][0].baseRevision).toBe(2);
    f.engine.stop();
    const stored = JSON.parse(localStorage.getItem(draftKey(user.id))!);
    stored.state = state('离线修改');
    localStorage.setItem(draftKey(user.id), JSON.stringify(stored));
    const reloaded = fixture(defaultState(), snapshot(state('另一设备更新'), 5));
    await reloaded.engine.connect(reloaded.transport);
    expect(reloaded.local().categories[0].name).toBe('离线修改');
    expect(reloaded.view().conflict?.revision).toBe(5);
    expect(reloaded.save).not.toHaveBeenCalled();
    reloaded.engine.resolve(true);
    expect(reloaded.local().categories[0].name).toBe('另一设备更新');
    reloaded.engine.stop();
  });

  it('保存中继续编辑只发送一个请求，冲突保留当前草稿', async () => {
    const f = fixture(defaultState(), snapshot(defaultState(), 1));
    await f.engine.connect(f.transport);
    const pending = deferred<SyncResponse>();
    f.save.mockImplementationOnce(() => pending.promise);
    f.engine.edit(state('编辑一'));
    const running = f.engine.tick();
    f.engine.edit(state('编辑二'));
    await f.engine.tick();
    expect(f.save).toHaveBeenCalledTimes(1);
    pending.reject(new SyncError(409, response(snapshot(state('远端修改'), 2))));
    await running;
    expect(f.view().conflict?.state?.categories[0].name).toBe('远端修改');
    expect(JSON.parse(localStorage.getItem(draftKey(user.id))!).state.categories[0].name).toBe('编辑二');
    expect(f.save).toHaveBeenCalledTimes(1);
    f.engine.stop();
  });

  it('上传已提交但响应丢失，刷新后识别已提交内容并继续上传新草稿', async () => {
    const f = fixture(defaultState(), snapshot(defaultState(), 1));
    await f.engine.connect(f.transport);
    f.save.mockRejectedValueOnce(new Error('response lost'));
    f.engine.edit(state('已提交修改'));
    await f.engine.tick();
    f.engine.edit(state('提交后的新修改'));
    f.engine.stop();
    const reloaded = fixture(defaultState(), snapshot(state('已提交修改'), 2));
    await reloaded.engine.connect(reloaded.transport);
    expect(reloaded.view().conflict).toBeNull();
    await vi.advanceTimersByTimeAsync(700);
    expect(reloaded.save.mock.calls[0][0].baseRevision).toBe(2);
    expect(reloaded.save.mock.calls[0][0].state.categories[0].name).toBe('提交后的新修改');
    reloaded.engine.stop();
  });

  it.each([400, 413])('被服务端拒绝的配置（%s）不锁死后续有效编辑', async (status) => {
    const f = fixture(defaultState(), snapshot(defaultState(), 1));
    await f.engine.connect(f.transport);
    f.save.mockRejectedValueOnce(new SyncError(status));
    f.engine.edit(state('被拒绝的修改'));
    await f.engine.tick();
    expect(f.view().status).toContain('配置不符合云端要求');
    expect(JSON.parse(localStorage.getItem(draftKey(user.id))!).pending).toBeNull();
    f.engine.edit(state('修正后的修改'));
    await vi.advanceTimersByTimeAsync(700);
    expect(f.save.mock.calls[1][0].state.categories[0].name).toBe('修正后的修改');
    expect(f.save.mock.calls[1][0].mutationId).not.toBe(f.save.mock.calls[0][0].mutationId);
    expect(f.view().status).toBe('已同步到云端');
    f.engine.stop();
  });

  it('账号草稿损坏时中止连接并保留原始存储，不自动覆盖', async () => {
    localStorage.setItem(draftKey(user.id), 'broken draft');
    const f = fixture();
    await f.engine.connect(f.transport);
    await vi.advanceTimersByTimeAsync(700);
    expect(f.view().user).toBeNull();
    expect(f.view().status).toContain('无法读取账号草稿');
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.save).not.toHaveBeenCalled();
    expect(localStorage.getItem(draftKey(user.id))).toBe('broken draft');
    f.engine.stop();
  });

  it('已有同步基线而云端数据消失时提示冲突，不自动覆盖草稿', async () => {
    const f = fixture(defaultState(), snapshot(defaultState(), 1));
    await f.engine.connect(f.transport);
    f.engine.edit(state('本地未提交'));
    f.save.mockRejectedValueOnce(new SyncError(409, response(snapshot(null, 0))));
    await f.engine.tick();
    expect(f.view().conflict?.revision).toBe(0);
    expect(JSON.parse(localStorage.getItem(draftKey(user.id))!).state.categories[0].name).toBe('本地未提交');
    f.engine.stop();
  });

  it('干净客户端拉取远端且保留本地选中项，jsonb 的键顺序不产生假冲突', async () => {
    const two = defaultState();
    two.categories.push({ ...two.categories[0], id: 'second', name: '第二类' });
    two.selectedId = 'second';
    const reordered = JSON.parse(
      JSON.stringify(two, [
        'selectedId',
        'categories',
        'version',
        ...Object.keys(two.categories[0]),
        ...Object.keys(two.categories[0].threshold),
        ...Object.keys(two.categories[0].items[0]),
      ]),
    ) as TrendState;
    expect(sameData(two, reordered)).toBe(true);
    const f = fixture(two, snapshot(two, 1));
    await f.engine.connect(f.transport);
    const next = structuredClone(two);
    next.selectedId = 'snacks';
    next.categories[0].name = '另一设备更新';
    f.load.mockResolvedValueOnce(response(snapshot(next, 2)));
    await f.engine.tick();
    expect(f.local().categories[0].name).toBe('另一设备更新');
    expect(f.local().selectedId).toBe('second');
    expect(f.save).not.toHaveBeenCalled();
    f.engine.stop();
  });

  it('退出恢复匿名配置，账号隔离保存且迟到的响应不能重新登录', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state('匿名配置')));
    const f = fixture(defaultState(), snapshot(state('账号私人配置'), 3));
    await f.engine.connect(f.transport);
    expect(f.scope()).toBe('alice');
    const pending = deferred<SyncResponse>();
    f.load.mockImplementationOnce(() => pending.promise);
    const running = f.engine.tick();
    f.engine.disconnect();
    pending.resolve(response(snapshot(state('迟到的私人配置'), 4)));
    await running;
    expect(f.scope()).toBeNull();
    expect(f.local().categories[0].name).toBe('匿名配置');
    expect(f.view().user).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).categories[0].name).toBe('匿名配置');
    expect(JSON.parse(localStorage.getItem(draftKey(user.id))!).state.categories[0].name).toBe('账号私人配置');
    f.engine.stop();
  });

  it('账号变化或授权失效即断开，不把账号配置写给新账号', async () => {
    const f = fixture(defaultState(), snapshot(defaultState(), 1));
    await f.engine.connect(f.transport);
    f.load.mockResolvedValueOnce({
      user: { id: 'bob', login: 'bob', name: 'Bob' },
      dashboard: snapshot(state('Bob配置'), 1),
    });
    await f.engine.tick();
    expect(f.view().user).toBeNull();
    expect(localStorage.getItem(draftKey('bob'))).toBeNull();
    await f.engine.connect(f.transport);
    f.load.mockRejectedValueOnce(new SyncError(401));
    await f.engine.tick();
    expect(f.view().status).toContain('授权已失效');
    f.engine.stop();
  });

  it('本地保存失败明确提示，卸载取消中的连接不发布状态', async () => {
    const f = fixture();
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await f.engine.connect(f.transport);
    expect(f.view().status).toContain('本地保存失败');
    f.engine.stop();
    const pending = deferred<SyncResponse>();
    const g = fixture();
    g.load.mockImplementationOnce(() => pending.promise);
    const running = g.engine.connect(g.transport);
    g.engine.stop();
    pending.resolve(response(snapshot(state('远端'), 2)));
    await running;
    expect(g.apply).not.toHaveBeenCalled();
  });
});
