import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANKI_SYNC_EVENT, type AnkiSyncEvent } from './anki-api';
import { AnkiSyncStatus } from './AnkiSyncStatus';

const FRESH_MS = 5 * 60 * 1000;
const emit = (detail: AnkiSyncEvent) => act(() => window.dispatchEvent(new CustomEvent(ANKI_SYNC_EVENT, { detail })));
const confirm = (id = 1, path = '/anki/dashboard', write = false) => {
  emit({ id, path, write, phase: 'pending' });
  emit({ id, path, write, phase: 'success', at: Date.now() });
};
const fail = (id = 1, path = '/anki/dashboard', write = false) => {
  emit({ id, path, write, phase: 'pending' });
  emit({ id, path, write, phase: 'error' });
};
const orb = () => screen.getByRole('button', { name: /^云端同步：/ });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('同步悬浮球', () => {
  it('未确认为中性，不常驻同步说明；点击展开，关闭恢复焦点', () => {
    render(<AnkiSyncStatus onSync={vi.fn()} disabled={false} />);
    expect(orb().parentElement).toHaveAttribute('data-state', 'connecting');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '手动同步' })).not.toBeInTheDocument();
    fireEvent.click(orb());
    expect(screen.getByRole('dialog', { name: '云端同步' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭同步面板' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(screen.getByRole('button', { name: '手动同步' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(orb()).toHaveFocus();
  });

  it('5 分钟内绿，边界到时变红且不发请求；新的确认恢复绿色', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const sync = vi.fn();
    render(<AnkiSyncStatus onSync={sync} disabled={false} />);
    confirm();
    expect(orb().parentElement).toHaveAttribute('data-state', 'fresh');
    act(() => vi.advanceTimersByTime(FRESH_MS - 1));
    expect(orb().parentElement).toHaveAttribute('data-state', 'fresh');
    act(() => vi.advanceTimersByTime(1));
    expect(orb().parentElement).toHaveAttribute('data-state', 'stale');
    expect(sync).not.toHaveBeenCalled();
    confirm(2);
    expect(orb().parentElement).toHaveAttribute('data-state', 'fresh');
  });

  it('后台时钟跳跃后页面恢复立即校准；卸载取消时效计时器', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { unmount } = render(<AnkiSyncStatus onSync={vi.fn()} disabled={false} />);
    confirm();
    vi.setSystemTime(new Date('2026-01-01T00:06:00Z'));
    fireEvent(document, new Event('visibilitychange'));
    expect(orb().parentElement).toHaveAttribute('data-state', 'stale');
    confirm(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('失败立刻红；成功拉取不能消除未确认写入，原写入成功才恢复', () => {
    render(<AnkiSyncStatus onSync={vi.fn()} disabled={false} />);
    confirm();
    fail(2, '/anki/reviews', true);
    expect(orb().parentElement).toHaveAttribute('data-state', 'stale');
    confirm(3);
    expect(orb().parentElement).toHaveAttribute('data-state', 'stale');
    fireEvent.click(orb());
    expect(screen.getByRole('alert')).toHaveTextContent('手动拉取不会重交失败的操作');
    confirm(4, '/anki/reviews', true);
    expect(orb().parentElement).toHaveAttribute('data-state', 'fresh');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('同步在途禁止重复操作，取消后可重试；新组件不接受旧请求确认', () => {
    const sync = vi.fn();
    const first = render(<AnkiSyncStatus onSync={sync} disabled={false} />);
    fireEvent.click(orb());
    fireEvent.click(screen.getByRole('button', { name: '手动同步' }));
    fireEvent.click(screen.getByRole('button', { name: '手动同步' }));
    expect(sync).toHaveBeenCalledTimes(1);
    emit({ id: 1, path: '/anki/dashboard', write: false, phase: 'pending' });
    expect(screen.getByRole('button', { name: '同步中…' })).toBeDisabled();
    emit({ id: 1, path: '/anki/dashboard', write: false, phase: 'cancelled' });
    fireEvent.click(screen.getByRole('button', { name: '手动同步' }));
    expect(sync).toHaveBeenCalledTimes(2);
    emit({ id: 2, path: '/anki/dashboard', write: false, phase: 'pending' });
    first.unmount();
    render(<AnkiSyncStatus onSync={sync} disabled={false} />);
    emit({ id: 2, path: '/anki/dashboard', write: false, phase: 'success', at: Date.now() });
    expect(orb().parentElement).toHaveAttribute('data-state', 'connecting');
  });

  it('SSR 与首次水合无时钟依赖、没有伪造绿色状态', async () => {
    const sync = vi.fn();
    const html = renderToString(<AnkiSyncStatus onSync={sync} disabled={false} />);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const recoverable = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <AnkiSyncStatus onSync={sync} disabled={false} />, {
        onRecoverableError: recoverable,
      });
    });
    expect(container.innerHTML).toBe(html);
    expect(recoverable).not.toHaveBeenCalled();
    act(() => root?.unmount());
    container.remove();
  });
});
