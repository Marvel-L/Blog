import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudError, cloudRequest, type CloudUser } from './api';
import { emptyLoveTasks, parseLoveTaskSnapshot, type LoveTaskSnapshot, type LoveTaskState } from './love-task-model';

interface Response {
  user: CloudUser;
  tasks: LoveTaskSnapshot;
}
interface Mutation {
  baseRevision: number;
  mutationId: string;
  state: LoveTaskState;
}

/** Private data exists only in memory; account changes invalidate reads and writes. */
export function useLoveTasks() {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [snapshot, setSnapshot] = useState<LoveTaskSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Mutation | null>(null);
  const [conflict, setConflict] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    locked.current = false;
    setUser(null);
    setSnapshot(null);
    setPending(null);
    setLoading(true);
    setBusy(false);
    setConflict(false);
    setSyncedAt(null);
    setError('');
    try {
      const account = await cloudRequest<{ user: CloudUser | null }>('/me', { signal: controller.signal });
      if (current !== generation.current) return;
      setUser(account.user);
      if (account.user) {
        const data = await cloudRequest<Response>('/love/tasks', { signal: controller.signal });
        if (current !== generation.current) return;
        if (data.user.id !== account.user.id) throw new Error('账号已变化，请重新加载');
        setSnapshot(parseLoveTaskSnapshot(data.tasks));
        setSyncedAt(Date.now());
      }
    } catch (cause) {
      if (controller.signal.aborted || current !== generation.current) return;
      if (cause instanceof CloudError && cause.status === 401) setUser(null);
      setError(cause instanceof Error ? cause.message : '必做清单加载失败');
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => {
      void load();
    };
    window.addEventListener('dblog-account-change', refresh);
    return () => {
      generation.current += 1;
      request.current?.abort();
      window.removeEventListener('dblog-account-change', refresh);
    };
  }, [load]);

  const send = async (mutation: Mutation): Promise<boolean> => {
    if (locked.current || !user || !snapshot) return false;
    locked.current = true;
    const current = generation.current;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setPending(mutation);
    setError('');
    try {
      const data = await cloudRequest<Response>('/love/tasks', {
        method: 'PUT',
        body: JSON.stringify(mutation),
        signal: controller.signal,
      });
      if (current !== generation.current) return false;
      if (data.user.id !== user.id) throw new Error('账号已变化，请重新加载');
      setSnapshot(parseLoveTaskSnapshot(data.tasks));
      setSyncedAt(Date.now());
      setPending(null);
      setConflict(false);
      return true;
    } catch (cause) {
      if (controller.signal.aborted || current !== generation.current) return false;
      if (cause instanceof CloudError && cause.status === 401) {
        window.dispatchEvent(new CustomEvent('dblog-account-change', { detail: { user: null } }));
        return false;
      }
      const hasConflict = cause instanceof CloudError && cause.status === 409;
      setConflict(hasConflict);
      setError(
        hasConflict
          ? '其他设备已更新清单，本次操作未保存。请读取云端版本后重新操作。'
          : '本次操作尚未确认保存，请重试。重试不会重复添加任务。',
      );
      return false;
    } finally {
      if (current === generation.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  };
  const mutate = async (update: (state: LoveTaskState) => LoveTaskState): Promise<boolean> => {
    if (locked.current || pending || !user || !snapshot) return false;
    try {
      const state = update(snapshot.state ?? emptyLoveTasks());
      parseLoveTaskSnapshot({ ...snapshot, state });
      return await send({ baseRevision: snapshot.revision, mutationId: crypto.randomUUID(), state });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法更新必做清单');
      return false;
    }
  };
  const refresh = async (): Promise<boolean> => {
    if (locked.current || pending || !user || !snapshot) return false;
    locked.current = true;
    const current = generation.current;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const data = await cloudRequest<Response>('/love/tasks', { signal: controller.signal });
      if (current !== generation.current) return false;
      if (data.user.id !== user.id) throw new Error('账号已变化，请重新加载');
      setSnapshot(parseLoveTaskSnapshot(data.tasks));
      setSyncedAt(Date.now());
      return true;
    } catch (cause) {
      if (controller.signal.aborted || current !== generation.current) return false;
      if (cause instanceof CloudError && cause.status === 401) {
        window.dispatchEvent(new CustomEvent('dblog-account-change', { detail: { user: null } }));
        return false;
      }
      setError('云端刷新失败，请重试。当前清单仍然保留。');
      return false;
    } finally {
      if (current === generation.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  };
  return {
    user,
    snapshot,
    loading,
    busy,
    error,
    conflict,
    syncedAt,
    pending: Boolean(pending),
    reload: load,
    mutate,
    retry: () => (pending && !conflict ? send(pending) : Promise.resolve(false)),
    sync: () => (pending && !conflict ? send(pending) : refresh()),
  };
}
