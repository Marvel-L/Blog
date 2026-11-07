import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudError, cloudRequest, type CloudUser } from './api';
import { emptyReadingState, parseReadingSnapshot, type ReadingSnapshot, type ReadingState } from './articleReading';

interface ReadingResponse {
  user: CloudUser;
  reading: ReadingSnapshot;
}
interface Mutation {
  baseRevision: number;
  mutationId: string;
  state: ReadingState;
}

/** No private localStorage: account changes invalidate every in-flight read/write. */
export function useArticleReading() {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<ReadingSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Mutation | null>(null);
  const [conflict, setConflict] = useState(false);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const load = useCallback(async () => {
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    locked.current = false;
    setLoading(true);
    setUser(null);
    setSnapshot(null);
    setPending(null);
    setBusy(false);
    setConflict(false);
    setError('');
    try {
      const account = await cloudRequest<{ user: CloudUser | null }>('/me', { signal: controller.signal });
      if (current !== generation.current) return;
      setUser(account.user);
      if (account.user) {
        const response = await cloudRequest<ReadingResponse>('/articles/reading', { signal: controller.signal });
        if (current !== generation.current) return;
        if (response.user.id !== account.user.id) throw new Error('账号已变化，请重新加载');
        setSnapshot(parseReadingSnapshot(response.reading));
      }
    } catch (cause) {
      if (controller.signal.aborted || current !== generation.current) return;
      if (cause instanceof CloudError && cause.status === 401) setUser(null);
      setError(cause instanceof Error ? cause.message : '阅读记录加载失败');
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

  const send = async (mutation: Mutation) => {
    if (locked.current || !user || !snapshot) return;
    locked.current = true;
    const current = generation.current;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setPending(mutation);
    setError('');
    try {
      const response = await cloudRequest<ReadingResponse>('/articles/reading', {
        method: 'PUT',
        body: JSON.stringify(mutation),
        signal: controller.signal,
      });
      if (current !== generation.current) return;
      if (response.user.id !== user.id) throw new Error('账号已变化，请重新加载');
      setSnapshot(parseReadingSnapshot(response.reading));
      setPending(null);
      setConflict(false);
    } catch (cause) {
      if (controller.signal.aborted || current !== generation.current) return;
      if (cause instanceof CloudError && cause.status === 401) {
        window.dispatchEvent(new CustomEvent('dblog-account-change', { detail: { user: null } }));
        return;
      }
      const hasConflict = cause instanceof CloudError && cause.status === 409;
      setConflict(hasConflict);
      setError(
        hasConflict
          ? '其他设备已更新记录，本次操作未保存。请读取云端版本后重新操作。'
          : '本次操作尚未确认保存，请重试；重试不会重复增加次数。',
      );
    } finally {
      if (current === generation.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  };
  const mutate = (update: (state: ReadingState) => ReadingState) => {
    if (locked.current || pending || !user || !snapshot) return;
    try {
      const state = update(snapshot.state ?? emptyReadingState());
      if (state === snapshot.state) return;
      void send({ baseRevision: snapshot.revision, mutationId: crypto.randomUUID(), state });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法更新阅读记录');
    }
  };
  return {
    user,
    loading,
    snapshot,
    busy,
    error,
    pending: Boolean(pending),
    conflict,
    reload: load,
    mutate,
    retry: () => {
      if (pending && !conflict) void send(pending);
    },
  };
}
