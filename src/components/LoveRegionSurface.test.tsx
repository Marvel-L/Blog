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
        <LoveRegionSurface regionId="xiangtan" />
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

  it('默认展示湘潭地域沙盘', async () => {
    renderLoveRegionSurface();

    expect(await screen.findByRole('heading', { name: '湘潭' })).toBeInTheDocument();
    expect(screen.getByTestId('love-region-stage')).toBeInTheDocument();
    expect(screen.getByText('雨湖区')).toBeInTheDocument();
    expect(screen.getByText('湘潭县')).toBeInTheDocument();
  });

  it('点击版图舞台后切换为垂直立面', async () => {
    const user = userEvent.setup();
    renderLoveRegionSurface();

    const stage = screen.getByTestId('love-region-stage');
    expect(stage).toHaveAttribute('data-view', 'sandtable');

    await user.click(stage);
    expect(stage).toHaveAttribute('data-view', 'plane');

    await user.click(stage);
    expect(stage).toHaveAttribute('data-view', 'sandtable');
  });
});
