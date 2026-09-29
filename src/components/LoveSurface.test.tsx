import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { LoveSurface } from './LoveSurface';

const renderLoveSurface = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <LoveSurface />
      </MemoryRouter>
    </HelmetProvider>,
  );

describe('LoveSurface', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('默认展示地域系统入口，打开后进入湘潭地域视图', async () => {
    const user = userEvent.setup();
    renderLoveSurface();

    await user.click(screen.getByRole('button', { name: '打开地域系统，当前湘潭' }));

    expect(await screen.findByRole('heading', { name: '湘潭' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '切换到上一个地域' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '切换到下一个地域' })).toBeInTheDocument();
  });

  it('支持左右切换不同地域', async () => {
    const user = userEvent.setup();
    renderLoveSurface();

    await user.click(screen.getByRole('button', { name: '打开地域系统，当前湘潭' }));
    await screen.findByRole('heading', { name: '湘潭' });

    await user.click(screen.getByRole('button', { name: '切换到下一个地域' }));
    expect(await screen.findByRole('heading', { name: '长沙' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '切换到下一个地域' }));
    expect(await screen.findByRole('heading', { name: '北京' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '切换到上一个地域' }));
    expect(await screen.findByRole('heading', { name: '长沙' })).toBeInTheDocument();
  });

  it('支持从列表直接切换地域', async () => {
    const user = userEvent.setup();
    renderLoveSurface();

    await user.click(screen.getByRole('button', { name: '打开地域系统，当前湘潭' }));
    await screen.findByRole('heading', { name: '湘潭' });

    await user.click(screen.getByRole('button', { name: '查看北京地域' }));
    expect(await screen.findByRole('heading', { name: '北京' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看北京地域' })).toHaveAttribute('aria-pressed', 'true');
  });
});
