import {
  emptyPlannerState,
  parsePlannerState,
  PLANNER_STORAGE_KEY,
  samePlannerData,
  type MonthlyPlannerState,
} from './model';

export type PlannerSyncUser = { id: string; login: string; name: string };
export type PlannerSnapshot = {
  state: MonthlyPlannerState | null;
  revision: number;
  updatedAt: string | null;
  githubStatus?: 'disabled' | 'pending' | 'synced' | 'failed';
  githubCommittedAt?: string | null;
};
export type PlannerSyncResponse = { user: PlannerSyncUser; planner: PlannerSnapshot };
export type PlannerMutation = { baseRevision: number; mutationId: string; state: MonthlyPlannerState };
export type PlannerTransport = {
  load: (signal: AbortSignal) => Promise<PlannerSyncResponse>;
  save: (mutation: PlannerMutation, signal: AbortSignal) => Promise<PlannerSyncResponse>;
};
export type PlannerSyncView = {
  user: PlannerSyncUser | null;
  status: string;
  conflict: PlannerSnapshot | null;
  connecting: boolean;
  githubStatus: PlannerSnapshot['githubStatus'];
};
export class PlannerSyncError extends Error {
  constructor(
    public status: number,
    public snapshot?: PlannerSyncResponse,
  ) {
    super(status === 401 ? '授权已失效，请重新连接' : '云端连接失败，本地计划未丢失');
  }
}

export const parsePlannerResponse = (data: unknown): PlannerSyncResponse => {
  const value = data as PlannerSyncResponse;
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
  const state = value.planner.state === null ? null : parsePlannerState(JSON.stringify(value.planner.state));
  if ((value.planner.revision === 0) !== (state === null)) throw new Error('云端版本格式无效');
  return { user: value.user, planner: { ...value.planner, state } };
};

export const plannerDraftKey = (id: string) => `d-blog-monthly-planner-sync-v1:${id}`;
type Draft = { state: MonthlyPlannerState; base: PlannerSnapshot | null; pending: PlannerMutation | null };

export class PlannerSynchronizer {
  private user: PlannerSyncUser | null = null;
  private base: PlannerSnapshot | null = null;
  private pending: PlannerMutation | null = null;
  private conflict: PlannerSnapshot | null = null;
  private transport: PlannerTransport | null = null;
  private local: MonthlyPlannerState;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | null = null;
  private generation = 0;
  private busy = false;
  private connecting = false;
  private status = '连接后自动同步到云端';
  private githubStatus: PlannerSnapshot['githubStatus'] = 'disabled';

  constructor(
    initial: MonthlyPlannerState,
    private apply: (state: MonthlyPlannerState, user: PlannerSyncUser | null) => void,
    private publish: (view: PlannerSyncView) => void,
    private storage: Pick<Storage, 'getItem' | 'setItem'>,
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
    });
  }
  private persist() {
    if (!this.user) return;
    this.storage.setItem(
      plannerDraftKey(this.user.id),
      JSON.stringify({ state: this.local, base: this.base, pending: this.pending }),
    );
  }
  edit(state: MonthlyPlannerState) {
    this.local = state;
    if (!this.user) return;
    try {
      this.persist();
    } catch {
      this.status = '本地账号草稿保存失败，请导出 Markdown 备份';
      this.view();
      return;
    }
    if (!this.conflict && !samePlannerData(this.local, this.base?.state ?? null)) {
      this.status = '有修改待上传';
      this.schedule();
    }
    this.view();
  }
  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), 900);
  }
  async connect(transport: PlannerTransport) {
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
      const raw = this.storage.getItem(plannerDraftKey(this.user.id));
      if (raw) {
        const draft = JSON.parse(raw) as Draft;
        saved = {
          state: parsePlannerState(JSON.stringify(draft.state)),
          base: draft.base,
          pending: draft.pending && { ...draft.pending, state: parsePlannerState(JSON.stringify(draft.pending.state)) },
        };
        if (
          saved.pending &&
          (!Number.isSafeInteger(saved.pending.baseRevision) ||
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
      this.accept(response.planner, !saved && samePlannerData(this.local, emptyPlannerState()));
    } catch (cause) {
      if (generation === this.generation) {
        this.status = cause instanceof Error ? cause.message : '云端连接失败';
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
  private replace(remote: MonthlyPlannerState) {
    this.local = remote;
    this.apply(remote, this.user);
  }
  private accept(remote: PlannerSnapshot, pristine = false) {
    this.githubStatus = remote.githubStatus ?? 'disabled';
    if (
      this.pending &&
      remote.revision === this.pending.baseRevision + 1 &&
      samePlannerData(remote.state, this.pending.state)
    ) {
      this.base = remote;
      this.pending = null;
    }
    const dirty = this.base ? !samePlannerData(this.local, this.base.state) : !pristine;
    if (
      samePlannerData(this.local, remote.state) ||
      (remote.revision === 0 && !this.base) ||
      (!dirty && !this.pending)
    ) {
      if (remote.state && !samePlannerData(this.local, remote.state)) this.replace(remote.state);
      this.base = remote;
      this.conflict = null;
      this.status = remote.state && samePlannerData(this.local, remote.state) ? '已同步到云端' : '有修改待上传';
    } else if (this.base && remote.revision === this.base.revision) this.status = '有修改待上传';
    else {
      this.conflict = remote;
      this.status = '两端计划不同，请选择保留版本';
    }
    try {
      this.persist();
    } catch {
      this.status += '；本地账号草稿保存失败';
    }
    this.view();
  }
  async tick() {
    if (!this.transport || !this.user || this.busy || this.conflict) return;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.busy = true;
    try {
      if (!this.pending && !samePlannerData(this.local, this.base?.state ?? null)) {
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
        return;
      }
      if (mutation) {
        this.base = response.planner;
        this.pending = null;
        this.conflict = null;
        this.githubStatus = response.planner.githubStatus;
        this.status = samePlannerData(this.local, this.base.state) ? '已同步到云端' : '有修改待上传';
        this.persist();
        this.view();
      } else this.accept(response.planner);
    } catch (cause) {
      if (generation !== this.generation) return;
      if (cause instanceof PlannerSyncError && cause.status === 409 && cause.snapshot) {
        this.pending = null;
        this.accept(cause.snapshot.planner);
      } else if (cause instanceof PlannerSyncError && cause.status === 401) {
        this.disconnect();
        this.status = cause.message;
        this.view();
      } else {
        this.status = cause instanceof Error ? cause.message : '同步失败，本地计划未丢失';
        this.view();
      }
    } finally {
      if (generation === this.generation) this.busy = false;
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
    try {
      const raw = this.storage.getItem(PLANNER_STORAGE_KEY);
      this.local = raw ? parsePlannerState(raw) : emptyPlannerState();
      this.status = '已断开同步，恢复本机计划';
    } catch {
      this.local = emptyPlannerState();
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
