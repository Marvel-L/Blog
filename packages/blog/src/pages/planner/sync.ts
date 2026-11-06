import {
  emptyPlannerState,
  parsePlannerState,
  PLANNER_STORAGE_KEY,
  samePlannerData,
  type MonthlyPlannerState,
} from './model';

export type PlannerSyncUser = { id: string; login: string; name: string };
export type PlannerSnapshot<S = MonthlyPlannerState> = {
  state: S | null;
  revision: number;
  updatedAt: string | null;
  githubStatus?: 'disabled' | 'pending' | 'synced' | 'failed';
  githubCommittedAt?: string | null;
};
export type PlannerSyncResponse<S = MonthlyPlannerState> = { user: PlannerSyncUser; planner: PlannerSnapshot<S> };
export type PlannerMutation<S = MonthlyPlannerState> = { baseRevision: number; mutationId: string; state: S };
export type PlannerTransport<S = MonthlyPlannerState> = {
  load: (signal: AbortSignal) => Promise<PlannerSyncResponse<S>>;
  save: (mutation: PlannerMutation<S>, signal: AbortSignal) => Promise<PlannerSyncResponse<S>>;
};
export type PlannerSyncView<S = MonthlyPlannerState> = {
  user: PlannerSyncUser | null;
  status: string;
  conflict: PlannerSnapshot<S> | null;
  connecting: boolean;
  githubStatus: PlannerSnapshot['githubStatus'];
  pending: boolean;
  syncing: boolean;
  error: string | null;
  errorStatus?: number;
  confirmedAt: string | null;
};
export class PlannerSyncError extends Error {
  constructor(
    public status: number,
    public snapshot?: PlannerSyncResponse<unknown>,
  ) {
    super(
      status === 403
        ? '请先在云端账号中绑定 GitHub，再使用云端计划'
        : status === 401
          ? '授权已失效，请重新连接'
          : '云端连接失败，本地计划未丢失',
    );
  }
}

export const parsePlannerResponse = <S = MonthlyPlannerState>(
  data: unknown,
  parse: (raw: string) => S = parsePlannerState as unknown as (raw: string) => S,
): PlannerSyncResponse<S> => {
  const value = data as PlannerSyncResponse<S>;
  if (
    !value?.user ||
    typeof value.user.id !== 'string' ||
    typeof value.user.login !== 'string' ||
    !value.planner ||
    !Number.isSafeInteger(value.planner.revision) ||
    value.planner.revision < 0 ||
    (value.planner.updatedAt !== null && typeof value.planner.updatedAt !== 'string')
  )
    throw new Error('云端响应格式无效');
  const state = value.planner.state === null ? null : parse(JSON.stringify(value.planner.state));
  if ((value.planner.revision === 0) !== (state === null)) throw new Error('云端版本格式无效');
  return { user: value.user, planner: { ...value.planner, state } };
};

export const plannerDraftKey = (id: string) => `d-blog-monthly-planner-sync-v1:${id}`;
type Draft<S> = { state: S; base: PlannerSnapshot<S> | null; pending: PlannerMutation<S> | null };
export type PlannerCodec<S> = {
  parse: (raw: string) => S;
  empty: () => S;
  same: (a: S | null, b: S | null) => boolean;
  draftKey: (id: string) => string;
  anonymousKey?: string;
  isEmpty?: (state: S) => boolean;
};
const monthlyCodec: PlannerCodec<MonthlyPlannerState> = {
  parse: parsePlannerState,
  empty: emptyPlannerState,
  same: samePlannerData,
  draftKey: plannerDraftKey,
  anonymousKey: PLANNER_STORAGE_KEY,
  isEmpty: (state) => Object.values(state.months).every((tasks) => tasks.length === 0),
};

export class PlannerSynchronizer<S = MonthlyPlannerState> {
  private user: PlannerSyncUser | null = null;
  private base: PlannerSnapshot<S> | null = null;
  private pending: PlannerMutation<S> | null = null;
  private conflict: PlannerSnapshot<S> | null = null;
  private transport: PlannerTransport<S> | null = null;
  private local: S;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | null = null;
  private generation = 0;
  private busy = false;
  private connecting = false;
  private status = '连接后自动同步到云端';
  private githubStatus: PlannerSnapshot['githubStatus'] = 'disabled';
  private error: string | null = null;
  private errorStatus: number | undefined;
  private confirmedAt: string | null = null;

  constructor(
    initial: S,
    private apply: (state: S, user: PlannerSyncUser | null) => void,
    private publish: (view: PlannerSyncView<S>) => void,
    private storage: Pick<Storage, 'getItem' | 'setItem'>,
    private codec: PlannerCodec<S> = monthlyCodec as unknown as PlannerCodec<S>,
  ) {
    this.local = initial;
  }

  private view() {
    this.publish({
      user: this.user,
      status: this.status,
      conflict: this.conflict,
      connecting: this.connecting,
      githubStatus: this.githubStatus,
      pending: !!this.user && (!!this.pending || !this.codec.same(this.local, this.base?.state ?? null)),
      syncing: this.busy,
      error: this.error,
      errorStatus: this.errorStatus,
      confirmedAt: this.confirmedAt,
    });
  }
  private persist() {
    if (!this.user) return;
    this.storage.setItem(
      this.codec.draftKey(this.user.id),
      JSON.stringify({ state: this.local, base: this.base, pending: this.pending }),
    );
  }
  edit(state: S) {
    if (this.codec.same(this.local, state)) return;
    this.local = state;
    if (!this.user) return;
    try {
      this.persist();
    } catch {
      this.status = '本地账号草稿保存失败，请导出 Markdown 备份';
      this.error = this.status;
      this.view();
      return;
    }
    if (!this.conflict && !this.codec.same(this.local, this.base?.state ?? null)) {
      this.status = '有修改待上传';
      this.schedule();
    }
    this.view();
  }
  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), 900);
  }
  async connect(transport: PlannerTransport<S>) {
    this.stop();
    this.transport = transport;
    const generation = this.generation;
    this.connecting = true;
    this.error = null;
    this.errorStatus = undefined;
    this.confirmedAt = null;
    this.status = '正在连接云端';
    this.view();
    const controller = new AbortController();
    this.controller = controller;
    this.busy = true;
    try {
      const response = await transport.load(controller.signal);
      if (generation !== this.generation) return;
      this.confirmedAt = new Date().toISOString();
      this.user = response.user;
      let saved: Draft<S> | null = null;
      const raw = this.storage.getItem(this.codec.draftKey(this.user.id));
      if (raw) {
        const draft = JSON.parse(raw) as Draft<S>;
        saved = {
          state: this.codec.parse(JSON.stringify(draft.state)),
          base: draft.base && parsePlannerResponse({ user: this.user, planner: draft.base }, this.codec.parse).planner,
          pending: draft.pending && { ...draft.pending, state: this.codec.parse(JSON.stringify(draft.pending.state)) },
        };
        if (
          saved.pending &&
          (!Number.isSafeInteger(saved.pending.baseRevision) ||
            saved.pending.baseRevision < 0 ||
            !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(saved.pending.mutationId))
        )
          throw new Error('账号草稿损坏，请先导出本机 Markdown');
      }
      if (saved) {
        this.local = saved.state;
        this.base = saved.base;
        this.pending = saved.pending;
      }
      this.apply(this.local, this.user);
      this.accept(
        response.planner,
        !saved && (this.codec.isEmpty?.(this.local) ?? this.codec.same(this.local, this.codec.empty())),
      );
    } catch (cause) {
      if (generation === this.generation) {
        this.status = cause instanceof Error ? cause.message : '云端连接失败';
        this.error = this.status;
        this.errorStatus = cause instanceof PlannerSyncError ? cause.status : undefined;
        this.user = null;
        this.transport = null;
      }
    } finally {
      if (generation === this.generation) {
        this.connecting = false;
        this.busy = false;
        this.view();
        if (this.user && !this.conflict) this.schedule();
      }
    }
  }
  private replace(remote: S) {
    this.local = remote;
    this.apply(remote, this.user);
  }
  private accept(remote: PlannerSnapshot<S>, pristine = false) {
    this.githubStatus = remote.githubStatus ?? 'disabled';
    if (
      this.pending &&
      remote.revision === this.pending.baseRevision + 1 &&
      this.codec.same(remote.state, this.pending.state)
    ) {
      this.base = remote;
      this.pending = null;
    }
    const dirty = this.base ? !this.codec.same(this.local, this.base.state) : !pristine;
    if (
      this.codec.same(this.local, remote.state) ||
      (remote.revision === 0 && !this.base) ||
      (!dirty && !this.pending)
    ) {
      if (remote.state && !this.codec.same(this.local, remote.state)) this.replace(remote.state);
      this.base = remote;
      this.conflict = null;
      this.status = remote.state && this.codec.same(this.local, remote.state) ? '已同步到云端' : '有修改待上传';
    } else if (this.base && remote.revision === this.base.revision) this.status = '有修改待上传';
    else {
      this.conflict = remote;
      this.status = '两端计划不同，请选择保留版本';
    }
    try {
      this.persist();
    } catch {
      this.status += '；本地账号草稿保存失败';
      this.error = this.status;
    }
    this.view();
  }
  async tick() {
    if (!this.transport || !this.user || this.busy || this.conflict) return;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.busy = true;
    this.error = null;
    let succeeded = false;
    try {
      if (!this.pending && !this.codec.same(this.local, this.base?.state ?? null)) {
        this.pending = { baseRevision: this.base?.revision ?? 0, mutationId: crypto.randomUUID(), state: this.local };
        this.persist();
      }
      const mutation = this.pending;
      this.status = mutation ? '正在上传修改' : '正在检查云端';
      this.view();
      const response = mutation
        ? await this.transport.save(mutation, controller.signal)
        : await this.transport.load(controller.signal);
      if (generation !== this.generation) return;
      if (response.user.id !== this.user.id) {
        this.disconnect();
        return;
      }
      succeeded = true;
      this.confirmedAt = new Date().toISOString();
      if (mutation) {
        this.base = response.planner;
        this.pending = null;
        this.conflict = null;
        this.githubStatus = response.planner.githubStatus;
        this.status = this.codec.same(this.local, this.base.state) ? '已同步到云端' : '有修改待上传';
        this.persist();
        this.view();
      } else this.accept(response.planner);
    } catch (cause) {
      if (generation !== this.generation) return;
      if (cause instanceof PlannerSyncError && cause.status === 409 && cause.snapshot) {
        if (cause.snapshot.user.id !== this.user.id) {
          this.disconnect();
          return;
        }
        this.pending = null;
        this.accept(cause.snapshot.planner as PlannerSnapshot<S>);
      } else if (cause instanceof PlannerSyncError && cause.status === 401) {
        this.disconnect();
        this.status = cause.message;
        this.view();
      } else {
        this.status = cause instanceof Error ? cause.message : '同步失败，本地计划未丢失';
        this.error = this.status;
        this.view();
      }
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        this.view();
        if (succeeded && !this.conflict && !this.codec.same(this.local, this.base?.state ?? null)) this.schedule();
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
    try {
      this.persist();
    } catch {
      this.status += '；本地账号草稿保存失败';
      this.error = this.status;
    }
    this.view();
    this.schedule();
  }
  disconnect() {
    try {
      this.persist();
    } catch {
      // Account draft already exists remotely; continue isolating the signed-out view.
    }
    this.stop();
    this.user = null;
    this.base = null;
    this.pending = null;
    this.conflict = null;
    this.transport = null;
    this.githubStatus = 'disabled';
    this.error = null;
    this.confirmedAt = null;
    try {
      const raw = this.codec.anonymousKey ? this.storage.getItem(this.codec.anonymousKey) : null;
      this.local = raw ? this.codec.parse(raw) : this.codec.empty();
      this.status = '已断开同步，恢复本机计划';
    } catch {
      this.local = this.codec.empty();
      this.status = '已断开同步；无法读取本机计划';
    }
    this.apply(this.local, null);
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
