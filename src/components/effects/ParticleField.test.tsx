import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ParticleField } from './ParticleField';

describe('ParticleField', () => {
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

  it('粒子层使用负 z-index，避免盖住文章图片', () => {
    render(<ParticleField effect="sakura" />);
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas).toHaveClass('z-particle');
    expect(canvas).toHaveClass('pointer-events-none');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
  });

  it('enabled=false 时不渲染画布', () => {
    const { container } = render(<ParticleField effect="sakura" enabled={false} />);
    expect(container.querySelector('canvas')).toBeNull();
  });
});
