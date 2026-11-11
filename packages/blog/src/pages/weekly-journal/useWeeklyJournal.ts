import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudError, cloudRequest, type CloudUser } from '@/cloud/api';
import {
  emptyWeek,
  mondayOf,
  parseWeeklyState,
  validJournalDate,
  type WeeklyArchive,
  type WeeklyState,
} from './weekly-model';

interface WeekResponse {
  user: CloudUser;
  weekStart: string;
  today: string;
  archive: WeeklyArchive;
}
type Phase = 'loading' | 'ready' | 'unauthorized' | 'error';

function validateResponse(data: WeekResponse): WeekResponse {
  if (
    !data.user?.id ||
    !validJournalDate(data.weekStart) ||
    mondayOf(data.weekStart) !== data.weekStart ||
    !validJournalDate(data.today) ||
    !data.archive ||
    !Number.isSafeInteger(data.archive.revision) ||
    data.archive.revision < 0 ||
    (data.archive.state !== null && !parseWeeklyState(data.archive.state, data.weekStart))
  ) {
    throw new Error('周记数据格式异常，请重新加载');
  }
  return data;
}

export function useWeeklyJournal(selection: string) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<WeekResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [session, setSession] = useState(0);
  const generation = useRef(0);
  const read = useRef<AbortController | null>(null);
  const write = useRef<AbortController | null>(null);
  const current = useRef<WeekResponse | null>(null);
  const pending = useRef<{ key: string; week: string; body: string } | null>(null);
  const mounted = useRef(false);

  const clear = useCallback(() => {
    generation.current += 1;
    read.current?.abort();
    write.current?.abort();
    write.current = null;
    current.current = null;
    pending.current = null;
    setData(null);
    setBusy(false);
    setError('');
    setPhase('loading');
    setSession((value) => value + 1);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const changed = () => {
      clear();
      setReload((value) => value + 1);
    };
    window.addEventListener('dblog-account-change', changed);
    return () => {
      mounted.current = false;
      generation.current += 1;
      read.current?.abort();
      write.current?.abort();
      window.removeEventListener('dblog-account-change', changed);
    };
  }, [clear]);

  useEffect(() => {
    const controller = new AbortController();
    read.current = controller;
    const epoch = ++generation.current;
    current.current = null;
    pending.current = null;
    setData(null);
    setPhase('loading');
    setError('');
    void cloudRequest<WeekResponse>(`/weekly-journal${selection ? `?week=${selection}` : ''}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    })
      .then((response) => {
        if (controller.signal.aborted || epoch !== generation.current) return;
        const next = validateResponse(response);
        if (selection && next.weekStart !== selection) throw new Error('返回的周次不一致，请重试');
        current.current = next;
        setData(next);
        setPhase('ready');
      })
      .catch((cause) => {
        if (controller.signal.aborted || epoch !== generation.current) return;
        setPhase(cause instanceof CloudError && cause.status === 401 ? 'unauthorized' : 'error');
        setError(cause instanceof Error ? cause.message : '周记加载失败，请重试');
      });
    return () => controller.abort();
  }, [selection, reload]);

  const save = useCallback(
    async (key: string, transform: (state: WeeklyState) => WeeklyState): Promise<boolean> => {
      const previous = current.current;
      if (!previous || write.current) return false;
      const controller = new AbortController();
      write.current = controller;
      const epoch = generation.current;
      setBusy(true);
      setError('');
      try {
        if (!pending.current || pending.current.key !== key || pending.current.week !== previous.weekStart) {
          const state = transform(previous.archive.state ?? emptyWeek(previous.weekStart));
          if (!parseWeeklyState(state, previous.weekStart)) throw new Error('内容超出限制或格式无效，请调整后保存');
          pending.current = {
            key,
            week: previous.weekStart,
            body: JSON.stringify({ baseRevision: previous.archive.revision, mutationId: crypto.randomUUID(), state }),
          };
        }
        const response = await cloudRequest<WeekResponse>(`/weekly-journal?week=${previous.weekStart}`, {
          method: 'PUT',
          body: pending.current.body,
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (controller.signal.aborted || !mounted.current || epoch !== generation.current) return false;
        const next = validateResponse(response);
        if (next.user.id !== previous.user.id || next.weekStart !== previous.weekStart) {
          clear();
          setReload((value) => value + 1);
          return false;
        }
        current.current = next;
        pending.current = null;
        setData(next);
        return true;
      } catch (cause) {
        if (controller.signal.aborted || !mounted.current || epoch !== generation.current) return false;
        if (cause instanceof CloudError && cause.status === 401) {
          clear();
          setPhase('unauthorized');
        } else if (cause instanceof CloudError && cause.status === 409) {
          pending.current = null;
          try {
            const latest = validateResponse(
              await cloudRequest<WeekResponse>(`/weekly-journal?week=${previous.weekStart}`, {
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
              }),
            );
            if (controller.signal.aborted || epoch !== generation.current) return false;
            if (latest.user.id !== previous.user.id || latest.weekStart !== previous.weekStart) {
              clear();
              setReload((value) => value + 1);
              return false;
            }
            current.current = latest;
            setData(latest);
            setError('周记已在其他窗口更新，已载入最新内容。你的输入仍保留，请核对后再次保存。');
          } catch {
            if (!controller.signal.aborted && epoch === generation.current)
              setError('最新周记加载失败，输入仍保留，请重新加载后再保存。');
          }
        } else {
          setError(cause instanceof Error ? cause.message : '保存失败，输入仍保留，请重试');
        }
        return false;
      } finally {
        if (write.current === controller) write.current = null;
        if (!controller.signal.aborted && mounted.current && epoch === generation.current) setBusy(false);
      }
    },
    [clear],
  );

  return { phase, data, error, busy, session, save, retry: () => setReload((value) => value + 1) };
}
