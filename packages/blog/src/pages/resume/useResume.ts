import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudError, cloudRequest, type CloudUser } from '@/cloud/api';
import {
  sameLibrary,
  toLibrary,
  validLibrary,
  validateResume,
  type DraftLibrary,
  type ResumeResponse,
  type StoredResume,
} from './model';
import { ResumeSession, type ResumeView } from './sync';

export function useResume() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');
  const [user, setUser] = useState<CloudUser | null>(null);
  const [view, setView] = useState<ResumeView<DraftLibrary> | null>(null);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState(0);
  const session = useRef<ResumeSession<DraftLibrary> | null>(null);
  const epoch = useRef(0);
  const read = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const load = useCallback(async (discardDraft = false) => {
    const previous = session.current;
    const previousState = previous?.view.state;
    const generation = ++epoch.current;
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    setError('');
    try {
      const response = validateResume(
        await cloudRequest<ResumeResponse<StoredResume>>('/resume', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        }),
      );
      if (!mounted.current || generation !== epoch.current) return;
      if (previous && session.current === previous && previous.view.state !== previousState) {
        setError('读取期间简历已更改，已保留你的输入，请保存后再刷新。');
        return;
      }
      session.current?.dispose(discardDraft);
      const next = new ResumeSession<DraftLibrary>(
        response.user.id,
        response.resume,
        setView,
        () => {
          ++epoch.current;
          session.current = null;
          setView(null);
          setUser(null);
          setPhase('unauthorized');
        },
        !discardDraft,
        { normalize: toLibrary, valid: validLibrary, same: sameLibrary },
      );
      session.current = next;
      setUser(response.user);
      setView({ ...next.view });
      setSessionId((id) => id + 1);
      setPhase('ready');
      next.start();
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted || generation !== epoch.current) return;
      if (cause instanceof CloudError && cause.status === 401) {
        session.current?.dispose(true);
        session.current = null;
        setView(null);
        setUser(null);
        setPhase('unauthorized');
      } else {
        setError(cause instanceof Error ? cause.message : '简历加载失败，请重试');
        if (!session.current) setPhase('error');
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const change = () => {
      ++epoch.current;
      read.current?.abort();
      session.current?.dispose(true);
      session.current = null;
      setView(null);
      setUser(null);
      setPhase('loading');
      void load();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (session.current?.hasChanges()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const online = () => {
      void session.current?.flush();
    };
    window.addEventListener('dblog-account-change', change);
    window.addEventListener('beforeunload', unload);
    window.addEventListener('online', online);
    void load();
    return () => {
      mounted.current = false;
      epoch.current += 1;
      read.current?.abort();
      session.current?.dispose();
      window.removeEventListener('dblog-account-change', change);
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('online', online);
    };
  }, [load]);
  return {
    phase,
    user,
    view,
    error,
    sessionId,
    update: (value: DraftLibrary) => session.current?.update(value),
    sync: () => session.current?.flush(),
    reload: (discardDraft = false) => load(discardDraft),
  };
}
