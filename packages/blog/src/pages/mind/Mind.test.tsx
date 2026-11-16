import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Mind from './Mind';
import { MindCanvas } from './MindCanvas';
import { newMindState, type MindState } from './model';
import type { SaveSnapshot } from './sync';

const owner = { id: 'alice', login: 'alice', name: 'Alice' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}
function mount() {
  return render(
    <MemoryRouter>
      <Mind />
      <Location />
    </MemoryRouter>,
  );
}
let changed: MindState;
function Canvas() {
  const [snapshot, setSnapshot] = useState<SaveSnapshot>(() => ({
    state: newMindState('mind'),
    status: 'saved',
    error: '',
    recoveryError: '',
  }));
  return (
    <MindCanvas
      snapshot={snapshot}
      onChange={(state) => {
        changed = state;
        setSnapshot({ ...snapshot, state });
      }}
      onBack={vi.fn()}
      onCopy={vi.fn()}
      onLoadCloud={vi.fn()}
      onRetry={vi.fn()}
      busy={false}
    />
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ user: owner, maps: [] })),
  );
});
afterEach(() => {
  // Flush React's pending mount/unmount effects while their browser stubs exist.
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Mind UI', () => {
  it('SSR is deterministic and anonymous users cannot create or view maps', async () => {
    vi.mocked(fetch).mockResolvedValue(json({}, 401));
    expect(
      renderToString(
        <MemoryRouter>
          <Mind />
        </MemoryRouter>,
      ),
    ).toContain('正在加载 Mind');
    expect(fetch).not.toHaveBeenCalled();
    mount();
    expect(await screen.findByRole('heading', { name: '登录后，展开你的想法' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新建导图' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('导图画布')).not.toBeInTheDocument();
  });
  it('creates a logic map from the dashboard and opens its saved document', async () => {
    let saved: { id: string; state: MindState; revision: number; updatedAt: string };
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (init?.method === 'PUT') {
        saved = {
          id: String(url).split('/').pop()!,
          state: JSON.parse(String(init.body)).state,
          revision: 1,
          updatedAt: '2026-11-15T12:00:00Z',
        };
        return json({ user: owner, map: saved });
      }
      return String(url).endsWith('/maps') ? json({ user: owner, maps: [] }) : json({ user: owner, map: saved });
    });
    mount();
    await screen.findByRole('button', { name: '新建导图' });
    fireEvent.click(screen.getByRole('button', { name: '逻辑图' }));
    fireEvent.click(screen.getByRole('button', { name: '新建导图' }));
    await screen.findByLabelText('导图画布');
    expect(screen.getByLabelText('导图结构')).toHaveValue('logic');
    expect(screen.getByTestId('location')).toHaveTextContent('id=');
    expect(screen.getByRole('button', { name: '节点：中心主题' })).toBeInTheDocument();
  });
  it('handles Tab, Enter, emoji, Delete and undo while protecting text editing and IME', () => {
    render(<Canvas />);
    const canvas = screen.getByLabelText('导图画布');
    fireEvent.keyDown(canvas, { key: 'Tab' });
    let input = screen.getByLabelText('编辑节点');
    fireEvent.change(input, { target: { value: '子主题 A' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(changed.nodes).toHaveLength(2);
    fireEvent.keyDown(input, { key: 'Enter' });
    input = screen.getByLabelText('编辑节点');
    fireEvent.change(input, { target: { value: '同级 B' } });
    expect(changed.nodes[1].parentId).toBe(changed.nodes[2].parentId);
    fireEvent.keyDown(input, { key: 'Delete' });
    expect(changed.nodes).toHaveLength(3);
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '标记 ✅' }));
    expect(screen.getByRole('button', { name: '节点：同级 B ✅' })).toBeInTheDocument();
    fireEvent.keyDown(canvas, { key: 'Delete' });
    expect(screen.queryByRole('button', { name: '节点：同级 B ✅' })).not.toBeInTheDocument();
    fireEvent.keyDown(canvas, { key: 'z', metaKey: true });
    expect(screen.getByRole('button', { name: '节点：同级 B ✅' })).toBeInTheDocument();
  });
  it('keeps canvas controls usable by keyboard and prevents typing from opening global search', () => {
    render(<Canvas />);
    fireEvent.change(screen.getByLabelText('导图名称'), { target: { value: '   ' } });
    expect(changed.title).toBe('未命名导图');
    const canvas = screen.getByLabelText('导图画布');
    fireEvent.keyDown(screen.getByLabelText('放大'), { key: 'Enter' });
    expect(screen.queryByLabelText('编辑节点')).not.toBeInTheDocument();
    const globalKey = vi.fn();
    window.addEventListener('keydown', globalKey);
    fireEvent.keyDown(canvas, { key: '/' });
    expect(globalKey).not.toHaveBeenCalled();
    expect(screen.getByLabelText('编辑节点')).toHaveValue('/');
    window.removeEventListener('keydown', globalKey);
  });
  it('renders markers before text on the same line and saves manual node colors', () => {
    render(<Canvas />);
    fireEvent.click(screen.getByRole('button', { name: '标记 ✅' }));
    const node = screen.getByRole('button', { name: '节点：中心主题 ✅' });
    expect(node.querySelector('.mind-node-content')?.textContent).toBe('✅ 中心主题');
    fireEvent.click(screen.getByRole('button', { name: '节点颜色：粉色' }));
    expect(changed.nodes[0].color).toBe('#f9edf2');
    expect(node.style.getPropertyValue('--branch-fill')).toBe('#f9edf2');
    fireEvent.change(screen.getByLabelText('自定义节点颜色'), { target: { value: '#123456' } });
    expect(changed.nodes[0].color).toBe('#123456');
    fireEvent.click(screen.getByRole('button', { name: '恢复节点自动配色' }));
    expect(changed.nodes[0].color).toBeUndefined();
    fireEvent.doubleClick(node);
    const input = screen.getByLabelText('编辑节点');
    expect(input).toHaveAttribute('wrap', 'off');
    fireEvent.change(input, { target: { value: '一段很长很长的文字应该在同一行显示\n这里手动换行' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /^节点：一段/ }).querySelector('.mind-node-content')?.textContent).toBe(
      '✅ 一段很长很长的文字应该在同一行显示\n这里手动换行',
    );
  });
  it('focuses the canvas without scrolling it when selecting a node', () => {
    render(<Canvas />);
    const canvas = screen.getByLabelText('导图画布');
    const focus = vi.spyOn(canvas, 'focus');
    fireEvent.click(screen.getByRole('button', { name: '节点：中心主题' }));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it('wheel pinch changes map zoom, normal two-finger scrolling pans, and layout preserves content', async () => {
    render(<Canvas />);
    const canvas = screen.getByLabelText('导图画布');
    fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -40, clientX: 200, clientY: 100 });
    await waitFor(() => expect(changed.viewport.zoom).toBeGreaterThan(1));
    const previous = changed.viewport;
    fireEvent.wheel(canvas, { deltaX: 45, deltaY: 90 });
    await waitFor(() => expect(changed.viewport.y).toBeGreaterThan(previous.y));
    const nodes = changed.nodes;
    fireEvent.change(screen.getByLabelText('导图结构'), { target: { value: 'logic' } });
    expect(changed.layout).toBe('logic');
    expect(changed.nodes).toEqual(nodes);
  });
  it('clears the visible document on account change and ignores a stale load', async () => {
    mount();
    await screen.findByRole('button', { name: '新建导图' });
    vi.mocked(fetch).mockResolvedValue(json({}, 401));
    await act(async () => window.dispatchEvent(new Event('dblog-account-change')));
    await screen.findByRole('heading', { name: '登录后，展开你的想法' });
    expect(screen.queryByRole('button', { name: '新建导图' })).not.toBeInTheDocument();
  });
});
