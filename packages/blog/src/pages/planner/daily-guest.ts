import type { useDailyPlanner } from './useDailyPlanner';

export const guestDaily: ReturnType<typeof useDailyPlanner> = {
  state: { version: 1, tasks: [] },
  view: {
    user: null,
    status: '登录后记录每日遗留',
    conflict: null,
    connecting: false,
    githubStatus: 'disabled',
    pending: false,
    syncing: false,
    error: null,
    confirmedAt: null,
  },
  edit: () => {},
  sync: () => {},
  resolve: () => {},
  restore: () => {},
};
