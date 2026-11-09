import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PlannerSync from './PlannerSync';

const state = { version: 1 as const, months: { '2026-11': [{ id: 'task', text: '保留目标', completed: false }] } };
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubEnv('VITE_PLANNER_API_ORIGIN', window.location.origin);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 401 })),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(['cloud', 'pages'])('%s 的同步球在 SSR 与首帧只按部署类型预留账号位置', async (target) => {
  vi.stubEnv('VITE_DEPLOY_TARGET', target);
  const ui = <PlannerSync state={state} onApply={vi.fn()} user={null} today="2026-11-09" notify={vi.fn()} />;
  expect(renderToString(ui).includes('planner-sync-float--cloud')).toBe(target === 'cloud');
  render(ui);
  const launcher = screen.getByRole('region', { name: '计划同步' });
  expect(launcher.classList.contains('planner-sync-float--cloud')).toBe(target === 'cloud');
  const orb = screen.getByRole('button', { name: /^云端同步：/ });
  expect(orb).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(orb);
  await waitFor(() => expect(screen.getByRole('region', { name: '云端同步详情' })).toHaveFocus());
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(orb).toHaveFocus();
  expect(screen.queryByRole('region', { name: '云端同步详情' })).not.toBeInTheDocument();
});
