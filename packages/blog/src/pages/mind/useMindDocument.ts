import { useCallback, useEffect, useRef, useState } from 'react';
import { cloudRequest, CloudError } from '@/cloud/api';
import { MindSession, draftKey, validateMap, type MapResponse, type SaveSnapshot } from './sync';
import type { MindState } from './model';

export function useMindDocument(user: string, id: string, unauthorized: () => void) {
  const [snapshot, setSnapshot] = useState<SaveSnapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const session = useRef<MindSession | null>(null);
  const onUnauthorized = useRef(unauthorized);
  useEffect(() => {
    onUnauthorized.current = unauthorized;
  }, [unauthorized]);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setSnapshot(null);
    setLoadError('');
    void cloudRequest<MapResponse>(`/mind/maps/${id}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    })
      .then((response) => {
        if (!live) return;
        const map = validateMap(response, user, id);
        const next = new MindSession(user, id, map, setSnapshot, () => onUnauthorized.current());
        session.current = next;
        setSnapshot({ ...next.snapshot });
        next.start();
      })
      .catch((error) => {
        if (!live) return;
        if (error instanceof CloudError && error.status === 401) onUnauthorized.current();
        else
          setLoadError(
            error instanceof CloudError && error.status === 404
              ? '导图不存在或不属于当前账号。'
              : error instanceof Error
                ? error.message
                : '导图加载失败',
          );
      });
    const pagehide = () => {
      void session.current?.flush(true);
    };
    const online = () => {
      void session.current?.flush();
    };
    const account = () => {
      live = false;
      controller.abort();
      session.current?.dispose(true);
      session.current = null;
      setSnapshot(null);
    };
    const leave = (event: BeforeUnloadEvent) => {
      if (session.current?.hasChanges()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', leave);
    window.addEventListener('dblog-account-change', account);
    return () => {
      live = false;
      controller.abort();
      session.current?.dispose();
      session.current = null;
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('online', online);
      window.removeEventListener('beforeunload', leave);
      window.removeEventListener('dblog-account-change', account);
    };
  }, [user, id, reload]);
  const update = useCallback((state: MindState) => session.current?.update(state), []);
  const flush = useCallback(() => session.current?.flush() ?? Promise.resolve(false), []);
  const loadCloud = useCallback(() => {
    try {
      localStorage.removeItem(draftKey(user, id));
    } catch {
      setLoadError('无法清除本机草稿，请检查浏览器存储权限');
      return;
    }
    setReload((n) => n + 1);
  }, [user, id]);
  return { snapshot, update, flush, loadError, loadCloud, retry: () => setReload((n) => n + 1) };
}
