import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('Love 首页不展示地域内容', () => {
    renderLoveSurface();

    expect(screen.getByRole('region', { name: 'Love 首页' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '湘潭' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '切换到下一个地域' })).not.toBeInTheDocument();
  });
});
