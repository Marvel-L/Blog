import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Road } from './Road';

const memoryStore = new Map<string, string>();

beforeEach(() => {
  memoryStore.clear();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memoryStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryStore.set(key, String(value));
      },
      removeItem: (key: string) => {
        memoryStore.delete(key);
      },
      clear: () => {
        memoryStore.clear();
      },
    },
  });
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <Road />
    </MemoryRouter>,
  );

const getStage = () => document.querySelector('[data-road-stage]') as HTMLElement;
const getViewport = () => document.querySelector('[data-road-viewport]') as HTMLElement;

describe('Road', () => {
  it('视图 id 与根节点不同时，子节点排在根节点下方', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '程序员' }));

    const root = document.querySelector('[data-road-node="程序员的一生"]') as HTMLElement;
    const child = document.querySelector('[data-road-node="算法"]') as HTMLElement;
    expect(root).toBeTruthy();
    expect(child).toBeTruthy();
    expect(Number.parseFloat(child.style.top)).toBeGreaterThan(Number.parseFloat(root.style.top));

    for (const line of document.querySelectorAll('line')) {
      expect(Number(line.getAttribute('y2'))).toBeGreaterThan(Number(line.getAttribute('y1')));
    }
  });

  it('离开页面再进入时仍停在上次选中的 Root', async () => {
    const user = userEvent.setup();
    const first = renderPage();
    await user.click(screen.getByRole('button', { name: '程序员' }));
    first.unmount();

    renderPage();
    expect(screen.getByRole('button', { name: '程序员' })).toHaveClass('bg-zinc-900');
    expect(screen.getByRole('button', { name: 'Golang' })).not.toHaveClass('bg-zinc-900');
    expect(document.querySelector('[data-road-node="程序员的一生"]')).toBeTruthy();
  });

  it('不再渲染 Paths 面板', () => {
    renderPage();
    expect(screen.queryByText('Paths')).not.toBeInTheDocument();
  });

  it('刷新后恢复同一 Root 的画布缩放与位置', async () => {
    const user = userEvent.setup();
    const first = renderPage();
    await user.click(screen.getByRole('button', { name: '程序员' }));

    const viewport = getViewport();
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 1000 });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 700 });

    await user.click(screen.getByRole('button', { name: '放大' }));
    await user.pointer([
      { target: viewport, keys: '[MouseLeft>]', coords: { x: 200, y: 220 } },
      { target: viewport, coords: { x: 280, y: 310 } },
      { target: viewport, keys: '[/MouseLeft]' },
    ]);

    const persistedTransform = getStage().style.transform;
    first.unmount();

    renderPage();
    expect(screen.getByRole('button', { name: '程序员' })).toHaveClass('bg-zinc-900');
    expect(getStage().style.transform).toBe(persistedTransform);
  });
});
