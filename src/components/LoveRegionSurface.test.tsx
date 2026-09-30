import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { LoveRegionSurface } from './LoveRegionSurface';

const renderLoveRegionSurface = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <LoveRegionSurface />
      </MemoryRouter>
    </HelmetProvider>,
  );

describe('LoveRegionSurface', () => {
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

  it('默认展示湘潭地域视图和城市下拉框', async () => {
    renderLoveRegionSurface();

    expect(await screen.findByRole('heading', { name: '湘潭' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '选择地域城市' })).toHaveValue('xiangtan');
  });

  it('支持通过下拉切换不同地域', async () => {
    const user = userEvent.setup();
    renderLoveRegionSurface();

    const select = screen.getByRole('combobox', { name: '选择地域城市' });
    await user.selectOptions(select, 'changsha');
    expect(await screen.findByRole('heading', { name: '长沙' })).toBeInTheDocument();

    await user.selectOptions(select, 'beijing');
    expect(await screen.findByRole('heading', { name: '北京' })).toBeInTheDocument();
    expect(select).toHaveValue('beijing');
  });

  it('鼠标移入版图舞台后进入悬浮态', async () => {
    const user = userEvent.setup();
    renderLoveRegionSurface();

    const stage = screen.getByTestId('love-region-stage');
    expect(stage).toHaveAttribute('data-hovered', 'false');

    await user.hover(stage);
    expect(stage).toHaveAttribute('data-hovered', 'true');

    await user.unhover(stage);
    expect(stage).toHaveAttribute('data-hovered', 'false');
  });
});
