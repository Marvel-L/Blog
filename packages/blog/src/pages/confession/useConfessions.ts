import { useCallback, useEffect, useRef, useState } from 'react';
import type { CloudUser } from '@/cloud/api';
import { emptyConfession, parseConfession, type ConfessionState } from './model';

type ArchiveResponse = { user: CloudUser; archive: { state: unknown; revision: number } };
// Compile-time branch removes the account transport entirely from Pages bundles.
const loadCloud = import.meta.env.VITE_DEPLOY_TARGET === 'cloud' ? () => import('@/cloud/api') : null;
/** Pages builds never fetch account APIs; private text is kept in memory, never browser storage. */
export function useConfessions() {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [state, setState] = useState(emptyConfession);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(0);
  const currentUser = useRef<CloudUser | null>(null);
  const generation = useRef(0);
  const readRequest = useRef<AbortController | null>(null);
  const writeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const revision = useRef(0);
  const pending = useRef<{ key: string; body: string } | null>(null);
  const clear = useCallback(() => {
    generation.current += 1;
    writeRequest.current?.abort();
    writeRequest.current = null;
    pending.current = null;
    revision.current = 0;
    currentUser.current = null;
    setUser(null);
    setState(emptyConfession());
    setReady(false);
    setBusy(false);
    setSession((value) => value + 1);
  }, []);
  const apply = useCallback((data: ArchiveResponse) => {
    const next = data.archive.state === null ? emptyConfession() : parseConfession(data.archive.state);
    if (!next || !Number.isSafeInteger(data.archive.revision) || data.archive.revision < 0)
      throw new Error('归档数据格式异常，请重试');
    if (data.user.id !== currentUser.current?.id) throw new Error('账号已变化，请重新加载');
    revision.current = data.archive.revision;
    setState(next);
    setReady(true);
  }, []);
  const refresh = useCallback(
    async (reset = false) => {
      if (!loadCloud || import.meta.env.VITE_DEPLOY_TARGET !== 'cloud') {
        setReady(true);
        return;
      }
      readRequest.current?.abort();
      if (reset) clear();
      const controller = new AbortController();
      readRequest.current = controller;
      const epoch = generation.current;
      try {
        const { cloudRequest } = await loadCloud();
        if (controller.signal.aborted || !mounted.current) return;
        const data = await cloudRequest<{ user: CloudUser | null }>('/me', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (controller.signal.aborted || !mounted.current || epoch !== generation.current) return;
        if (data.user?.id !== currentUser.current?.id) clear();
        currentUser.current = data.user;
        setUser(data.user);
        setError('');
        const activeEpoch = generation.current;
        if (!data.user) {
          setReady(true);
          return;
        }
        const archive = await cloudRequest<ArchiveResponse>('/confessions', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (!controller.signal.aborted && mounted.current && activeEpoch === generation.current) apply(archive);
      } catch (cause) {
        if (!controller.signal.aborted && mounted.current && readRequest.current === controller) {
          if (cause instanceof Error && 'status' in cause && cause.status === 401) clear();
          setReady(false);
          setError(cause instanceof Error ? cause.message : '私密归档加载失败，请重试');
        }
      }
    },
    [apply, clear],
  );
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const changed = () => {
      void refresh(true);
    };
    const focused = () => {
      if (!writeRequest.current) void refresh();
    };
    window.addEventListener('dblog-account-change', changed);
    window.addEventListener('focus', focused);
    return () => {
      mounted.current = false;
      generation.current += 1;
      readRequest.current?.abort();
      writeRequest.current?.abort();
      window.removeEventListener('dblog-account-change', changed);
      window.removeEventListener('focus', focused);
    };
  }, [refresh]);
  const save = useCallback(
    async (next: ConfessionState): Promise<boolean> => {
      if (!loadCloud || !currentUser.current || !ready || writeRequest.current) return false;
      if (!parseConfession(next)) {
        setError('内容无效：墓碑最多100个、记事最多2000条，每条最多10000字');
        return false;
      }
      readRequest.current?.abort();
      const controller = new AbortController();
      writeRequest.current = controller;
      const epoch = generation.current;
      const owner = currentUser.current.id;
      setBusy(true);
      setError('');
      try {
        const { cloudRequest, CloudError } = await loadCloud();
        if (controller.signal.aborted || !mounted.current || epoch !== generation.current) return false;
        const key = JSON.stringify(next);
        // A timeout's outcome is unknown: keep the original mutation and base for retries.
        if (pending.current?.key !== key)
          pending.current = {
            key,
            body: JSON.stringify({ baseRevision: revision.current, mutationId: crypto.randomUUID(), state: next }),
          };
        try {
          const data = await cloudRequest<ArchiveResponse>('/confessions', {
            method: 'PUT',
            body: pending.current.body,
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
          });
          if (
            controller.signal.aborted ||
            !mounted.current ||
            epoch !== generation.current ||
            owner !== currentUser.current?.id
          )
            return false;
          apply(data);
          pending.current = null;
          return true;
        } catch (cause) {
          if (controller.signal.aborted || !mounted.current || epoch !== generation.current) return false;
          if (cause instanceof CloudError && cause.status === 401) {
            clear();
            setError('请登录');
            return false;
          }
          if (cause instanceof CloudError && cause.status === 409) {
            const data = await cloudRequest<ArchiveResponse>('/confessions', {
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
            });
            if (!controller.signal.aborted && mounted.current && epoch === generation.current) {
              apply(data);
              pending.current = null;
            }
            throw new Error('另一设备更新了归档，已刷新记录；输入保留，请再次保存');
          }
          throw cause;
        }
      } catch (cause) {
        if (!controller.signal.aborted && mounted.current && epoch === generation.current)
          setError(cause instanceof Error ? cause.message : '保存失败，输入仍保留，请重试');
        return false;
      } finally {
        if (writeRequest.current === controller) writeRequest.current = null;
        if (mounted.current && epoch === generation.current) setBusy(false);
      }
    },
    [apply, clear, ready],
  );
  return { user, state, ready, busy, error, session, save, refresh };
}
