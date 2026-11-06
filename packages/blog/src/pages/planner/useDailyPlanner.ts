import { useCallback, useEffect, useRef, useState } from 'react';
import { apiOrigin, authorizationStorage, plannerTransport } from './api';
import { readAuthorization } from '../trend/authorization';
import { sameData } from './model';
import { dailyDraftKey, emptyDailyState, parseDailyState, type DailyPlannerState } from './daily-model';
import { PlannerSynchronizer, type PlannerSyncUser, type PlannerSyncView } from './sync';

const initialView: PlannerSyncView<DailyPlannerState> = {
  user: null,
  status: '登录后记录每日遗留',
  conflict: null,
  connecting: false,
  githubStatus: 'disabled',
  pending: false,
  syncing: false,
  error: null,
  confirmedAt: null,
};
export const useDailyPlanner = (user: PlannerSyncUser | null) => {
  const userId = user?.id;
  const [state, setState] = useState(emptyDailyState);
  const [view, setView] = useState(initialView);
  const engine = useRef<PlannerSynchronizer<DailyPlannerState> | null>(null);
  const reconnect = useRef<(() => Promise<void>) | null>(null);
  const connected = useRef(false);
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    setState(emptyDailyState());
    latest.current = emptyDailyState();
    setView(initialView);
    connected.current = false;
    if (!userId) return;
    let active = true;
    const synchronizer = new PlannerSynchronizer(
      emptyDailyState(),
      (next, identity) => {
        if (active && identity?.id === userId) {
          latest.current = next;
          setState(next);
        }
      },
      (next) => {
        if (active) {
          connected.current = !!next.user;
          setView(next);
          if (!next.user) setState(emptyDailyState());
        }
      },
      localStorage,
      { parse: parseDailyState, empty: emptyDailyState, same: sameData, draftKey: dailyDraftKey },
    );
    engine.current = synchronizer;
    const connect = async () => {
      try {
        const origin = apiOrigin();
        const authorization = readAuthorization(authorizationStorage, origin, Date.now());
        const transport = plannerTransport(origin, authorization?.token ?? '', '/daily', parseDailyState);
        const load = transport.load;
        transport.load = async (signal) => {
          const response = await load(signal);
          if (response.user.id !== userId) throw new Error('账号已切换，请重新连接计划');
          return response;
        };
        await synchronizer.connect(transport);
      } catch (cause) {
        if (active) setView({ ...initialView, error: cause instanceof Error ? cause.message : '每日遗留连接失败' });
      }
    };
    reconnect.current = connect;
    void connect();
    const tick = () => void synchronizer.tick();
    const accountChange = () => {
      synchronizer.disconnect();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') tick();
    }, 15_000);
    window.addEventListener('online', tick);
    window.addEventListener('focus', tick);
    window.addEventListener('dblog-account-change', accountChange);
    return () => {
      active = false;
      synchronizer.stop();
      engine.current = null;
      reconnect.current = null;
      window.clearInterval(interval);
      window.removeEventListener('online', tick);
      window.removeEventListener('focus', tick);
      window.removeEventListener('dblog-account-change', accountChange);
    };
  }, [userId]);
  const edit = useCallback((next: DailyPlannerState) => {
    if (!engine.current) return;
    const parsed = parseDailyState(JSON.stringify(next));
    latest.current = parsed;
    setState(parsed);
    engine.current.edit(parsed);
  }, []);
  const sync = useCallback(() => {
    if (connected.current) void engine.current?.tick();
    else void reconnect.current?.();
  }, []);
  const resolve = useCallback((cloud: boolean) => engine.current?.resolve(cloud), []);
  const restore = useCallback(
    (task: DailyPlannerState['tasks'][number]) => {
      if (!engine.current || latest.current.tasks.some((entry) => entry.id === task.id)) return;
      edit({ ...latest.current, tasks: [...latest.current.tasks, task] });
    },
    [edit],
  );
  const visible = !!userId && view.user?.id === userId;
  return {
    state: visible ? state : emptyDailyState(),
    view: visible || view.connecting ? view : { ...initialView, error: view.error },
    edit,
    sync,
    resolve,
    restore,
  };
};
