import { cloudRequest, CloudError, type CloudUser } from '@/cloud/api';
import { parseMindState, UUID, type MindMap, type MindState } from './model';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';
export interface SaveSnapshot {
  state: MindState;
  status: SaveStatus;
  error: string;
  recoveryError: string;
}
interface Mutation {
  baseRevision: number;
  mutationId: string;
  state: MindState;
}
export interface MapResponse {
  user: CloudUser;
  map: MindMap;
}
export const draftKey = (user: string, id: string) => `dblog-mind-v1:${user}:${id}`;

export function clearMindDrafts(user: string) {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) if (key?.startsWith(`dblog-mind-v1:${user}:`)) localStorage.removeItem(key);
  } catch {
    // Access to the old account is revoked independently of optional local storage.
  }
}

export function validateMap(data: MapResponse, user: string, id: string): MindMap {
  if (data.user?.id !== user) throw new CloudError(401, '', '账号已切换，请重新打开导图');
  if (
    data.map?.id !== id ||
    !parseMindState(data.map.state) ||
    !Number.isSafeInteger(data.map.revision) ||
    data.map.revision < 1 ||
    !Number.isFinite(Date.parse(data.map.updatedAt))
  )
    throw new Error('导图数据格式异常，请重新加载');
  return data.map;
}

/** One in-flight mutation, with a stable receipt across ambiguous network failures. */
export class MindSession {
  snapshot: SaveSnapshot;
  private revision: number;
  private pending: Mutation | null = null;
  private dirty = false;
  private live = true;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private firstDirty = 0;
  private attempts = 0;
  private request: Promise<boolean> | null = null;
  private controller: AbortController | null = null;

  constructor(
    private user: string,
    private id: string,
    remote: MindMap,
    private notify: (snapshot: SaveSnapshot) => void,
    private unauthorized: () => void,
  ) {
    this.revision = remote.revision;
    this.snapshot = { state: remote.state, status: 'saved', error: '', recoveryError: '' };
    try {
      const raw = localStorage.getItem(draftKey(user, id));
      if (raw) {
        const draft = JSON.parse(raw);
        if (
          !parseMindState(draft.state) ||
          !Number.isSafeInteger(draft.revision) ||
          draft.revision < 1 ||
          (draft.pending &&
            (!parseMindState(draft.pending.state) ||
              !UUID.test(draft.pending.mutationId) ||
              draft.pending.baseRevision !== draft.revision))
        )
          throw new Error('invalid draft');
        this.snapshot.state = draft.state;
        this.revision = draft.revision;
        this.pending = draft.pending ?? null;
        this.dirty = true;
        // A pending receipt must be replayed even when the response was lost.
        this.snapshot.status = this.revision !== remote.revision && !this.pending ? 'conflict' : 'pending';
        if (this.snapshot.status === 'conflict')
          this.snapshot.error = '云端已有新版本，本机草稿已保留。可另存副本或加载云端版本。';
      }
    } catch {
      this.snapshot.recoveryError = '本机草稿无法读取；请确认云端内容后再编辑。';
    }
  }

  start() {
    if (this.dirty && this.snapshot.status !== 'conflict') this.schedule();
  }
  private emit() {
    if (this.live) this.notify({ ...this.snapshot });
  }
  private persist() {
    try {
      if (this.dirty || this.pending)
        localStorage.setItem(
          draftKey(this.user, this.id),
          JSON.stringify({
            state: this.snapshot.state,
            revision: this.revision,
            pending: this.pending,
          }),
        );
      else localStorage.removeItem(draftKey(this.user, this.id));
      this.snapshot.recoveryError = '';
    } catch {
      this.snapshot.recoveryError = '浏览器无法保存恢复草稿，请等待云端保存完成后再离开。';
    }
  }
  update(state: MindState) {
    if (!this.live || state === this.snapshot.state) return;
    if (!parseMindState(state)) {
      this.snapshot.error = '内容超出限制（最多 1000 个节点、32 层、每节点 200 字）。';
      this.emit();
      return;
    }
    this.snapshot.state = state;
    this.dirty = true;
    if (!this.firstDirty) this.firstDirty = Date.now();
    if (this.snapshot.status !== 'conflict') {
      this.snapshot.status = this.request ? 'saving' : 'pending';
      this.snapshot.error = '';
      this.schedule();
    }
    this.persist();
    this.emit();
  }
  private schedule(delay?: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        void this.flush();
      },
      delay ?? Math.max(0, Math.min(600, 3000 - (Date.now() - (this.firstDirty || Date.now())))),
    );
  }
  async flush(keepalive = false): Promise<boolean> {
    clearTimeout(this.timer);
    if (!this.live || this.snapshot.status === 'conflict') return false;
    if (this.request) {
      const ok = await this.request;
      return ok && this.dirty ? this.flush(keepalive) : ok;
    }
    if (!this.dirty && !this.pending) return true;
    this.pending ??= { baseRevision: this.revision, mutationId: crypto.randomUUID(), state: this.snapshot.state };
    const mutation = this.pending;
    const body = JSON.stringify(mutation);
    // Browsers cap keepalive bodies at 64 KiB. Larger maps recover from the local draft.
    if (keepalive && new TextEncoder().encode(body).length > 60000) return false;
    this.snapshot.status = 'saving';
    this.snapshot.error = '';
    this.persist();
    this.emit();
    const controller = new AbortController();
    this.controller = controller;
    const operation = async () => {
      try {
        const response = await cloudRequest<MapResponse>(`/mind/maps/${this.id}`, {
          method: 'PUT',
          body,
          keepalive,
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (!this.live) return false;
        const remote = validateMap(response, this.user, this.id);
        if (remote.revision !== mutation.baseRevision + 1) throw new CloudError(409, '', '云端已有新版本');
        this.revision = remote.revision;
        this.pending = null;
        this.dirty = this.snapshot.state !== mutation.state;
        this.firstDirty = this.dirty ? Date.now() : 0;
        this.attempts = 0;
        this.snapshot.status = this.dirty ? 'pending' : 'saved';
        this.persist();
        this.emit();
        if (this.dirty) this.schedule();
        return true;
      } catch (error) {
        if (!this.live || controller.signal.aborted) return false;
        if (error instanceof CloudError && error.status === 401) {
          this.dispose(true);
          this.unauthorized();
          return false;
        }
        const conflict = error instanceof CloudError && error.status === 409;
        this.snapshot.status = conflict ? 'conflict' : 'error';
        this.snapshot.error = conflict
          ? '云端已有新版本，本机草稿已保留。可另存副本或加载云端版本。'
          : `尚未保存到云端：${error instanceof Error ? error.message : '网络连接失败'}。`;
        this.emit();
        if (!conflict && ++this.attempts <= 3) this.schedule(1500 * 2 ** (this.attempts - 1));
        return false;
      } finally {
        this.controller = null;
      }
    };
    this.request = operation();
    const result = await this.request;
    this.request = null;
    return result;
  }
  hasChanges() {
    return this.dirty || this.pending !== null;
  }
  dispose(discard = false) {
    this.live = false;
    clearTimeout(this.timer);
    this.controller?.abort();
    if (discard) {
      try {
        localStorage.removeItem(draftKey(this.user, this.id));
      } catch {
        /* private state is already unmounted */
      }
    }
  }
}
