import { CloudError, cloudRequest } from '@/cloud/api';
import {
  emptyResume,
  sameResume,
  validResumeState,
  validateResume,
  type ResumeResponse,
  type ResumeState,
} from './model';

type Status = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';
export interface ResumeView {
  state: ResumeState;
  status: Status;
  error: string;
  recoveryError: string;
  updatedAt: string | null;
}
interface Mutation {
  expectedUserId: string;
  baseRevision: number;
  mutationId: string;
  state: ResumeState;
}
export const resumeDraftKey = (user: string) => `dblog-resume-v1:${user}`;

export class ResumeSession {
  view: ResumeView;
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
    remote: ResumeResponse['resume'],
    private notify: (view: ResumeView) => void,
    private unauthorized: () => void,
    restore = true,
  ) {
    this.revision = remote.revision;
    this.view = {
      state: remote.state ?? emptyResume(),
      status: 'saved',
      error: '',
      recoveryError: '',
      updatedAt: remote.updatedAt,
    };
    if (!restore) return;
    try {
      const raw = localStorage.getItem(resumeDraftKey(user));
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (
        !validResumeState(draft.state) ||
        !Number.isSafeInteger(draft.revision) ||
        draft.revision < 0 ||
        (draft.pending &&
          (!validResumeState(draft.pending.state) ||
            draft.pending.expectedUserId !== user ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              draft.pending.mutationId,
            ) ||
            draft.pending.baseRevision !== draft.revision))
      )
        throw new Error('invalid draft');
      this.view.state = draft.state;
      this.revision = draft.revision;
      this.pending = draft.pending ?? null;
      this.dirty = true;
      this.view.status = this.revision !== remote.revision && !this.pending ? 'conflict' : 'pending';
      if (this.view.status === 'conflict')
        this.view.error = '云端已有新版本。本机草稿已保留，请下载备份后读取云端版本。';
    } catch {
      this.view.recoveryError = '本机恢复草稿无法读取，请核对云端内容后继续。';
    }
  }
  start() {
    if (this.dirty && this.view.status !== 'conflict') this.schedule();
  }
  private emit() {
    if (this.live) this.notify({ ...this.view });
  }
  private persist() {
    try {
      if (this.hasChanges())
        localStorage.setItem(
          resumeDraftKey(this.user),
          JSON.stringify({
            state: this.view.state,
            revision: this.revision,
            pending: this.pending,
          }),
        );
      else localStorage.removeItem(resumeDraftKey(this.user));
      this.view.recoveryError = '';
    } catch {
      this.view.recoveryError = '浏览器无法保留恢复草稿，请等待云端保存完成或下载备份后再离开。';
    }
  }
  update(value: string | ResumeState) {
    const state = typeof value === 'string' ? { ...this.view.state, markdown: value } : value;
    if (!this.live || sameResume(state, this.view.state)) return;
    if (!validResumeState(state)) {
      this.view.error = '简历或评论格式不正确：正文最多 10 万字、评论最多 100 条，每条 2000 字。';
      this.emit();
      return;
    }
    this.view.state = state;
    this.dirty = true;
    this.attempts = 0;
    if (!this.firstDirty) this.firstDirty = Date.now();
    if (this.view.status !== 'conflict') {
      this.view.status = this.request ? 'saving' : 'pending';
      this.view.error = '';
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
      delay ?? Math.max(0, Math.min(800, 4000 - (Date.now() - (this.firstDirty || Date.now())))),
    );
  }
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (!this.live || this.view.status === 'conflict') return false;
    if (this.request) {
      const ok = await this.request;
      return ok && this.hasChanges() ? this.flush() : ok;
    }
    if (!this.hasChanges()) return true;
    this.pending ??= {
      expectedUserId: this.user,
      baseRevision: this.revision,
      mutationId: crypto.randomUUID(),
      state: this.view.state,
    };
    const mutation = this.pending;
    this.view.status = 'saving';
    this.view.error = '';
    this.persist();
    this.emit();
    const controller = new AbortController();
    this.controller = controller;
    const operation = async () => {
      try {
        const response = validateResume(
          await cloudRequest<ResumeResponse>('/resume', {
            method: 'PUT',
            body: JSON.stringify(mutation),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
          }),
        );
        if (!this.live) return false;
        if (response.user.id !== this.user) throw new CloudError(401, '', '账号已切换');
        if (response.resume.revision !== mutation.baseRevision + 1) throw new CloudError(409, '', '云端已有新版本');
        this.revision = response.resume.revision;
        this.pending = null;
        this.dirty = !sameResume(this.view.state, mutation.state);
        this.firstDirty = this.dirty ? Date.now() : 0;
        this.attempts = 0;
        this.view.updatedAt = response.resume.updatedAt;
        this.view.status = this.dirty ? 'pending' : 'saved';
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
        this.view.status = conflict ? 'conflict' : 'error';
        this.view.error = conflict
          ? '云端已有新版本。本机草稿已保留，请下载备份后读取云端版本。'
          : `尚未保存到云端：${error instanceof Error ? error.message : '连接失败'}。可以重试或下载备份。`;
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
        localStorage.removeItem(resumeDraftKey(this.user));
      } catch {
        /* In-memory private state is discarded regardless. */
      }
    }
  }
}
