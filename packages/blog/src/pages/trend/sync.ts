import { defaultState, parseState, STORAGE_KEY, type TrendState } from './model';

export type SyncUser = { id: string; login: string; name: string };
export type Snapshot = { state: TrendState | null; revision: number; updatedAt: string | null };
export type SyncResponse = { user: SyncUser; dashboard: Snapshot };
export type Mutation = { baseRevision: number; mutationId: string; state: TrendState };
export type SyncView = { user: SyncUser | null; status: string; conflict: Snapshot | null; connecting: boolean };
export type Transport = {
  load: (signal: AbortSignal) => Promise<SyncResponse>;
  save: (mutation: Mutation, signal: AbortSignal) => Promise<SyncResponse>;
};
export class SyncError extends Error {
  constructor(
    public status: number,
    public snapshot?: SyncResponse,
  ) {
    super(status === 401 ? '授权已失效，请重新连接' : '云端连接失败，草稿保留在本地');
  }
}

// PostgreSQL jsonb reorders object keys. Compare data, ignoring the local selection.
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};
export const sameData = (a: TrendState | null, b: TrendState | null) =>
  canonical(a?.categories ?? null) === canonical(b?.categories ?? null);
export const draftKey = (id: string) => `d-blog-trend-sync-v1:${id}`;
type Draft = { state: TrendState; base: Snapshot | null; pending: Mutation | null };

export const parseResponse = (data: unknown): SyncResponse => {
  const value = data as SyncResponse;
  if (
    !value?.user ||
    typeof value.user.id !== 'string' ||
    typeof value.user.login !== 'string' ||
    typeof value.user.name !== 'string' ||
    !value.dashboard ||
    !Number.isSafeInteger(value.dashboard.revision) ||
    value.dashboard.revision < 0 ||
    (value.dashboard.updatedAt !== null && typeof value.dashboard.updatedAt !== 'string')
  )
    throw new Error('云端响应格式无效');
  const dashboard = value.dashboard;
  const state = dashboard.state === null ? null : parseState(JSON.stringify(dashboard.state));
  if ((dashboard.revision === 0) !== (state === null)) throw new Error('云端版本格式无效');
  return { user: value.user, dashboard: { ...dashboard, state } };
};

/** One request at a time; persisted base/pending mutation makes offline retries safe. */
export class TrendSynchronizer {
  private user: SyncUser | null = null;
  private base: Snapshot | null = null;
  private pending: Mutation | null = null;
  private conflict: Snapshot | null = null;
  private transport: Transport | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private local: TrendState;
  private status = '连接后自动同步到云端';
  private storageError = false;
  private connecting = false;

  constructor(
    initial: TrendState,
    private apply: (state: TrendState, user: SyncUser | null) => void,
    private publish: (view: SyncView) => void,
    private storage: Pick<Storage, 'getItem' | 'setItem'>,
  ) {
    this.local = initial;
  }

  private view() {
    this.publish({
      user: this.user,
      status: this.storageError ? `${this.status}；本地保存失败，请导出备份` : this.status,
      conflict: this.conflict,
      connecting: this.connecting,
    });
  }
  private persist() {
    if (!this.user) return;
    try {
      this.storage.setItem(
        draftKey(this.user.id),
        JSON.stringify({ state: this.local, base: this.base, pending: this.pending }),
      );
      this.storageError = false;
    } catch {
      this.storageError = true;
    }
  }
  edit(state: TrendState) {
    this.local = state;
    if (!this.user) return;
    this.persist();
    if (!this.conflict && !sameData(this.local, this.base?.state ?? null)) {
      this.status = '有修改待上传';
      this.schedule();
    }
    this.view();
  }
  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.tick();
    }, 700);
  }
  async connect(transport: Transport) {
    this.stop();
    this.transport = transport;
    const generation = this.generation;
    this.connecting = true;
    this.status = '正在连接云端';
    this.view();
    const controller = new AbortController();
    this.controller = controller;
    this.busy = true;
    try {
      const response = await transport.load(controller.signal);
      if (generation !== this.generation) return;
      this.user = response.user;
      let saved: Draft | null = null;
      try {
        const raw = this.storage.getItem(draftKey(this.user.id));
        if (raw) {
          const draft = JSON.parse(raw) as Draft;
          saved = {
            state: parseState(JSON.stringify(draft.state)),
            base: draft.base === null ? null : parseResponse({ user: this.user, dashboard: draft.base }).dashboard,
            pending:
              draft.pending === null
                ? null
                : {
                    state: parseState(JSON.stringify(draft.pending.state)),
                    baseRevision: draft.pending.baseRevision,
                    mutationId: draft.pending.mutationId,
                  },
          };
          if (
            saved.pending &&
            (!Number.isSafeInteger(saved.pending.baseRevision) ||
              saved.pending.baseRevision < 0 ||
              !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(saved.pending.mutationId))
          )
            throw new Error('invalid draft');
        }
      } catch {
        throw new Error('无法读取账号草稿，请先导出备份并检查浏览器存储');
      }
      if (saved) {
        this.local = saved.state;
        this.base = saved.base;
        this.pending = saved.pending;
      }
      this.apply(this.local, this.user);
      this.accept(response.dashboard, !saved && sameData(this.local, defaultState()));
    } catch (error) {
      if (generation === this.generation) {
        this.status = error instanceof Error ? error.message : '云端连接失败';
        this.transport = null;
        this.user = null;
      }
    } finally {
      if (generation === this.generation) {
        this.connecting = false;
        this.busy = false;
        this.view();
        if (this.user && this.transport && !this.conflict) this.schedule();
      }
    }
  }
  private replace(remote: TrendState) {
    const selectedId = remote.categories.some((c) => c.id === this.local.selectedId)
      ? this.local.selectedId
      : remote.selectedId;
    this.local = { ...remote, selectedId };
    this.apply(this.local, this.user);
  }
  private accept(remote: Snapshot, pristine = false) {
    // A committed write whose response was lost can be recognized after reloading.
    if (
      this.pending &&
      remote.revision === this.pending.baseRevision + 1 &&
      sameData(remote.state, this.pending.state)
    ) {
      this.base = remote;
      this.pending = null;
    }
    const dirty = this.base ? !sameData(this.local, this.base.state) : !pristine;
    if (sameData(this.local, remote.state) || (remote.revision === 0 && !this.base) || (!dirty && !this.pending)) {
      if (remote.state && !sameData(this.local, remote.state)) this.replace(remote.state);
      this.base = remote;
      this.conflict = null;
      this.status = remote.state && sameData(this.local, remote.state) ? '已同步到云端' : '有修改待上传';
    } else if (this.base && remote.revision === this.base.revision) {
      this.status = '有修改待上传';
    } else {
      this.conflict = remote;
      this.status = '两端数据不同，请选择保留的版本';
    }
    this.persist();
    this.view();
  }
  async tick() {
    if (!this.transport || !this.user || this.busy || this.conflict) return;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.busy = true;
    try {
      if (!this.pending && !sameData(this.local, this.base?.state ?? null)) {
        this.pending = { baseRevision: this.base?.revision ?? 0, mutationId: crypto.randomUUID(), state: this.local };
        this.persist();
      }
      const mutation = this.pending;
      this.status = mutation ? '正在上传修改' : '已同步到云端';
      this.view();
      const response = mutation
        ? await this.transport.save(mutation, controller.signal)
        : await this.transport.load(controller.signal);
      if (generation !== this.generation) return;
      if (response.user.id !== this.user.id) {
        this.disconnect();
        this.status = '账号已变化，请重新连接';
        this.view();
        return;
      }
      if (mutation) {
        this.base = response.dashboard;
        this.pending = null;
        this.conflict = null;
        this.status = sameData(this.local, this.base.state) ? '已同步到云端' : '有修改待上传';
        this.persist();
        this.view();
      } else this.accept(response.dashboard);
    } catch (error) {
      if (generation !== this.generation) return;
      if (error instanceof SyncError && error.status === 409 && error.snapshot) {
        this.pending = null;
        if (error.snapshot.user.id !== this.user.id) this.disconnect();
        else this.accept(error.snapshot.dashboard);
      } else if (error instanceof SyncError && error.status === 401) {
        this.disconnect();
        this.status = error.message;
      } else if (error instanceof SyncError && (error.status === 400 || error.status === 413)) {
        this.pending = null;
        this.status = '配置不符合云端要求，请检查数据或导出备份';
      } else this.status = error instanceof Error ? error.message : '同步失败，草稿保留在本地';
      this.persist();
      this.view();
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        // Immediate follow-up only after success, avoiding unbounded failure retries.
        if (this.status === '有修改待上传' && !this.conflict) this.schedule();
      }
    }
  }
  resolve(useCloud: boolean) {
    const remote = this.conflict;
    if (!remote) return;
    if (useCloud && remote.state) this.replace(remote.state);
    this.base = remote;
    this.pending = null;
    this.conflict = null;
    this.status = useCloud ? '已采用云端版本' : '有修改待上传';
    this.persist();
    this.view();
    this.schedule();
  }
  disconnect() {
    this.persist();
    this.stop();
    this.user = null;
    this.base = null;
    this.pending = null;
    this.conflict = null;
    this.transport = null;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      this.local = raw ? parseState(raw) : defaultState();
    } catch {
      this.local = defaultState();
      this.storageError = true;
    }
    this.apply(this.local, null);
    this.status = '已断开同步，账号草稿保留在本地';
    this.view();
  }
  stop() {
    this.generation += 1;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.busy = false;
    this.connecting = false;
  }
}
