import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudError, cloudRequest } from '@/cloud/api';
import { JournalSession, validateWeek, type JournalView, type WeekResponse } from './sync';
import type { WeeklyState } from './weekly-model';

export function useWeeklyJournal(selection: string) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');
  const [data, setData] = useState<WeekResponse | null>(null);
  const [view, setView] = useState<JournalView | null>(null);
  const [error, setError] = useState('');
  const [session, setSession] = useState(0);
  const active = useRef<JournalSession | null>(null);
  const generation = useRef(0);
  const read = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const invalidate = useCallback(() => {
    ++generation.current;
    read.current?.abort();
    active.current?.dispose();
    active.current = null;
  }, []);
  const load = useCallback(
    async (discard = false) => {
      const epoch = ++generation.current;
      read.current?.abort();
      const controller = new AbortController();
      read.current = controller;
      const previous = active.current;
      const before = previous?.view.state;
      setError('');
      try {
        const response = validateWeek(
          await cloudRequest<WeekResponse>(`/weekly-journal${selection ? `?week=${selection}` : ''}`, {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
          }),
        );
        if (!mounted.current || controller.signal.aborted || epoch !== generation.current) return;
        if (selection && response.weekStart !== selection) throw new Error('返回的周次不一致，请重试');
        if (previous && active.current === previous && previous.view.state !== before) {
          setError('读取期间周记已更改，已保留你的输入，请保存后再刷新。');
          return;
        }
        previous?.dispose(discard);
        const next = new JournalSession(
          response,
          setView,
          () => {
            ++generation.current;
            active.current = null;
            setData(null);
            setView(null);
            setPhase('unauthorized');
          },
          !discard,
        );
        active.current = next;
        setData(response);
        setView({ ...next.view });
        setSession((value) => value + 1);
        setPhase('ready');
        next.start();
      } catch (cause) {
        if (!mounted.current || controller.signal.aborted || epoch !== generation.current) return;
        if (cause instanceof CloudError && cause.status === 401) {
          active.current?.dispose(true, true);
          active.current = null;
          setView(null);
          setData(null);
          setPhase('unauthorized');
        } else {
          setError(cause instanceof Error ? cause.message : '周记加载失败，请重试');
          if (!active.current) setPhase('error');
        }
      }
    },
    [selection],
  );

  useEffect(() => {
    mounted.current = true;
    active.current?.dispose();
    active.current = null;
    setData(null);
    setView(null);
    setPhase('loading');
    void load();
    const changed = () => {
      ++generation.current;
      read.current?.abort();
      active.current?.dispose(true, true);
      active.current = null;
      setData(null);
      setView(null);
      setPhase('loading');
      void load();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (active.current?.hasChanges()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const online = () => void active.current?.flush();
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void active.current?.flush();
      }
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') void active.current?.flush();
    };
    window.addEventListener('dblog-account-change', changed);
    window.addEventListener('beforeunload', unload);
    window.addEventListener('online', online);
    window.addEventListener('keydown', saveShortcut);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      mounted.current = false;
      invalidate();
      window.removeEventListener('dblog-account-change', changed);
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('online', online);
      window.removeEventListener('keydown', saveShortcut);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [load, invalidate]);

  const update = (transform: (state: WeeklyState) => WeeklyState) => {
    const current = active.current;
    return current ? current.update(transform(current.view.state)) : false;
  };
  return {
    phase,
    data,
    view,
    error: error || view?.error || view?.recoveryError || '',
    busy: view?.status === 'saving',
    session,
    update,
    sync: () => active.current?.flush(true) ?? Promise.resolve(false),
    retry: () => void load(),
    reload: load,
  };
}
