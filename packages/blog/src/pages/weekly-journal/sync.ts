import { CloudError, cloudRequest, type CloudUser } from '@/cloud/api';
import {
  emptyWeek,
  mondayOf,
  parseWeeklyState,
  validJournalDate,
  type WeeklyArchive,
  type WeeklyState,
} from './weekly-model';

export interface WeekResponse {
  user: CloudUser;
  weekStart: string;
  today: string;
  archive: WeeklyArchive;
}
export type JournalStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';
export interface JournalView {
  state: WeeklyState;
  status: JournalStatus;
  error: string;
  recoveryError: string;
  updatedAt: string | null;
}
interface Mutation {
  expectedUserId: string;
  baseRevision: number;
  mutationId: string;
  state: WeeklyState;
}
export const journalDraftKey = (user: string, week: string) => `dblog-journal-v1:${user}:${week}`;
const same = (a: WeeklyState, b: WeeklyState) => JSON.stringify(a) === JSON.stringify(b);

export function validateWeek(data: WeekResponse): WeekResponse {
  if (
    !data?.user?.id ||
    !validJournalDate(data.weekStart) ||
    mondayOf(data.weekStart) !== data.weekStart ||
    !validJournalDate(data.today) ||
    !data.archive ||
    !Number.isSafeInteger(data.archive.revision) ||
    data.archive.revision < 0 ||
    (data.archive.state !== null && !parseWeeklyState(data.archive.state, data.weekStart))
  )
    throw new Error('周记数据格式异常，请重新加载');
  return data;
}

/** One account and week per session; receipts survive retries and page reloads. */
export class JournalSession {
  view: JournalView;
  private revision: number;
  private base: WeeklyState;
  private pending: Mutation | null = null;
  private live = true;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private firstDirty = 0;
  private attempts = 0;
  private request: Promise<boolean> | null = null;
  private controller: AbortController | null = null;

  constructor(
    private remote: WeekResponse,
    private notify: (view: JournalView) => void,
    private unauthorized: () => void,
    restore = true,
  ) {
    this.revision = remote.archive.revision;
    this.base = remote.archive.state ?? emptyWeek(remote.weekStart);
    this.view = {
      state: this.base,
      status: 'saved',
      error: '',
      recoveryError: '',
      updatedAt: remote.archive.updatedAt,
    };
    if (!restore) return;
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (
        !parseWeeklyState(draft.state, remote.weekStart) ||
        !parseWeeklyState(draft.base, remote.weekStart) ||
        !Number.isSafeInteger(draft.revision) ||
        draft.revision < 0 ||
        (draft.pending &&
          (!parseWeeklyState(draft.pending.state, remote.weekStart) ||
            draft.pending.expectedUserId !== remote.user.id ||
            draft.pending.baseRevision !== draft.revision ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              draft.pending.mutationId,
            )))
      )
        throw new Error('invalid draft');
      this.view.state = draft.state;
      this.base = draft.base;
      this.revision = draft.revision;
      this.pending = draft.pending ?? null;
      this.view.status =
        draft.conflict || (this.revision !== remote.archive.revision && !this.pending) ? 'conflict' : 'pending';
      if (this.view.status === 'conflict') this.rebase(remote);
    } catch {
      this.view.recoveryError = '本机草稿无法读取，请核对云端记录后继续。';
    }
  }
  private get key() {
    return journalDraftKey(this.remote.user.id, this.remote.weekStart);
  }
  start() {
    if (this.hasChanges() && this.view.status !== 'conflict') this.schedule();
  }
  private emit() {
    if (this.live) this.notify({ ...this.view });
  }
  private persist() {
    try {
      if (this.hasChanges())
        localStorage.setItem(
          this.key,
          JSON.stringify({
            state: this.view.state,
            base: this.base,
            revision: this.revision,
            pending: this.pending,
            conflict: this.view.status === 'conflict',
          }),
        );
      else localStorage.removeItem(this.key);
      this.view.recoveryError = '';
    } catch {
      this.view.recoveryError = '浏览器无法保留本机草稿，请保存到云端或下载备份后再离开。';
    }
  }
  update(state: WeeklyState): boolean {
    if (!this.live || !parseWeeklyState(state, this.remote.weekStart)) {
      this.view.error = '每日正文最多 2 万字、100 条留言，请检查内容长度或格式。';
      this.emit();
      return false;
    }
    if (same(state, this.view.state)) return true;
    this.view.state = state;
    this.attempts = 0;
    this.firstDirty ||= Date.now();
    if (this.view.status !== 'conflict') {
      this.view.status = this.request ? 'saving' : 'pending';
      this.view.error = '';
      this.schedule();
    }
    this.persist();
    this.emit();
    return true;
  }
  private schedule(delay?: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => void this.flush(),
      delay ?? Math.max(0, Math.min(800, 4000 - (Date.now() - (this.firstDirty || Date.now())))),
    );
  }
  private rebase(latest: WeekResponse) {
    const remoteState = latest.archive.state ?? emptyWeek(latest.weekStart);
    // Merge at the field level: new thoughts in another window remain intact while writing a day's body.
    this.view.state = {
      ...this.view.state,
      days: this.view.state.days.map((day, index) => {
        const previous = this.base.days[index];
        const fresh = remoteState.days[index];
        const bodyChanged =
          day.content !== previous.content ||
          JSON.stringify(day.comments ?? []) !== JSON.stringify(previous.comments ?? []);
        return {
          ...fresh,
          ...(bodyChanged && { content: day.content, comments: day.comments ?? [] }),
          thoughts: JSON.stringify(day.thoughts) !== JSON.stringify(previous.thoughts) ? day.thoughts : fresh.thoughts,
        };
      }),
    };
    this.base = remoteState;
    this.revision = latest.archive.revision;
    this.pending = null;
    this.view.updatedAt = latest.archive.updatedAt;
    this.view.status = 'conflict';
    this.view.error =
      '周记已在其他窗口更新，已保留本机草稿和其他日期的最新记录。请核对后重试保存，或下载备份后读取云端版本。';
    this.persist();
  }
  async flush(resolveConflict = false): Promise<boolean> {
    clearTimeout(this.timer);
    if (!this.live || (this.view.status === 'conflict' && !resolveConflict)) return false;
    if (this.request) {
      const ok = await this.request;
      return ok && this.hasChanges() ? this.flush(resolveConflict) : ok;
    }
    if (!this.hasChanges()) {
      this.view.status = 'saved';
      this.view.error = '';
      this.persist();
      this.emit();
      return true;
    }
    this.pending ??= {
      expectedUserId: this.remote.user.id,
      baseRevision: this.revision,
      mutationId: crypto.randomUUID(),
      state: this.view.state,
    };
    const mutation = this.pending;
    const controller = new AbortController();
    this.controller = controller;
    this.view.status = 'saving';
    this.view.error = '';
    this.persist();
    this.emit();
    const operation = async () => {
      try {
        const response = validateWeek(
          await cloudRequest<WeekResponse>(`/weekly-journal?week=${this.remote.weekStart}`, {
            method: 'PUT',
            body: JSON.stringify(mutation),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
          }),
        );
        if (!this.live) return false;
        if (response.user.id !== this.remote.user.id) throw new CloudError(401, '', '账号已切换');
        if (response.weekStart !== this.remote.weekStart) throw new Error('返回的周次不一致');
        if (response.archive.revision !== mutation.baseRevision + 1) throw new CloudError(409, '', '云端已有新版本');
        this.revision = response.archive.revision;
        this.base = mutation.state;
        this.pending = null;
        this.attempts = 0;
        this.firstDirty = this.hasChanges() ? Date.now() : 0;
        this.view.updatedAt = response.archive.updatedAt;
        this.view.status = this.hasChanges() ? 'pending' : 'saved';
        this.persist();
        this.emit();
        if (this.hasChanges()) this.schedule();
        return true;
      } catch (cause) {
        if (!this.live || controller.signal.aborted) return false;
        if (cause instanceof CloudError && cause.status === 401) {
          this.dispose(true, true);
          this.unauthorized();
          return false;
        }
        if (cause instanceof CloudError && cause.status === 409) {
          this.view.status = 'conflict';
          this.view.error = '云端已有新版本，本机草稿已保留。请下载备份后重新加载。';
          try {
            const latest = validateWeek(
              await cloudRequest<WeekResponse>(`/weekly-journal?week=${this.remote.weekStart}`, {
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
              }),
            );
            if (!this.live) return false;
            if (latest.user.id !== this.remote.user.id || latest.weekStart !== this.remote.weekStart) {
              this.dispose(true, true);
              this.unauthorized();
              return false;
            }
            this.rebase(latest);
          } catch {
            // Keep the original receipt until the latest revision can be read safely.
          }
          this.persist();
        } else {
          this.view.status = 'error';
          this.view.error = cause instanceof Error ? cause.message : '保存失败，本机草稿已保留，请重试。';
          if (++this.attempts <= 3) this.schedule(1500 * 2 ** (this.attempts - 1));
        }
        this.emit();
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
    return this.pending !== null || !same(this.view.state, this.base);
  }
  dispose(discard = false, allWeeks = false) {
    if (!this.live) return;
    this.persist();
    this.live = false;
    clearTimeout(this.timer);
    this.controller?.abort();
    if (discard) {
      try {
        localStorage.removeItem(this.key);
        if (allWeeks) {
          const prefix = `dblog-journal-v1:${this.remote.user.id}:`;
          for (let index = localStorage.length - 1; index >= 0; index--) {
            const key = localStorage.key(index);
            if (key?.startsWith(prefix)) localStorage.removeItem(key);
          }
        }
      } catch {
        /* Clear memory even if storage is unavailable. */
      }
    }
  }
}
