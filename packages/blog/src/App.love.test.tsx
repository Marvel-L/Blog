import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  vi.stubEnv('VITE_DEPLOY_TARGET', 'cloud');
});
vi.mock('./pages/Home', () => ({ Home: () => <p>普通首页内容</p> }));
vi.mock('./components/TypewriterIntro', () => ({ TypewriterIntro: () => null }));
vi.mock('./components/OfflineStatus', () => ({ OfflineStatus: () => null }));
vi.mock('./components/ServiceWorkerUpdatePrompt', () => ({ ServiceWorkerUpdatePrompt: () => null }));
vi.mock('./components/mascot/RinMascot', () => ({ default: () => null }));
vi.mock('./components/effects/ParticleField', () => ({ ParticleField: () => null }));
vi.mock('./services/busuanzi', () => ({ pingBusuanzi: vi.fn() }));
vi.mock('./cloud/api', async (original) => ({
  ...(await original<typeof import('./cloud/api')>()),
  cloudRequest: vi.fn(async () => ({ user: null })),
}));
import { AppShell } from './App';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('Love account integration', () => {
  it('keeps the real account panel mounted so users can log in from Love 必做', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <AppShell />
        </MemoryRouter>
      </HelmetProvider>,
    );
    await screen.findByRole('button', { name: '打开云端账号：账号登录' });
    await userEvent.click(screen.getByRole('button', { name: '进入 Love 面' }));
    await screen.findByRole('region', { name: 'Love 首页' });
    await userEvent.click(screen.getAllByRole('button', { name: '必做' })[0]);
    await userEvent.click(await screen.findByRole('button', { name: '登录后记录' }));
    expect(await screen.findByRole('dialog', { name: '云端账号' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '使用账号密码登录' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '关闭云端账号' }));
    await userEvent.click(screen.getByRole('button', { name: '退出 Love 面' }));
    await waitFor(() => expect(screen.getByText('普通首页内容')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '打开云端账号：账号登录' })).toBeInTheDocument();
  });
});
