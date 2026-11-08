import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Confession } from '../Confession';
import { emptyConfession, type ConfessionState } from './model';
import { ConfessionEntryForm, NewTombstone } from './ConfessionForms';
const requests = vi.hoisted(() => {
  vi.stubEnv('VITE_DEPLOY_TARGET', 'cloud');
  return { fetch: vi.fn() };
});
vi.mock('@/cloud/api', async (original) => ({
  ...(await original<typeof import('@/cloud/api')>()),
  cloudRequest: requests.fetch,
}));
vi.mock('./ConfessionWorld', () => ({
  ConfessionWorld: class {
    constructor(
      _host: HTMLElement,
      private callbacks: { onReady: () => void; onRegion: (inside: boolean) => void },
    ) {
      queueMicrotask(() => callbacks.onReady());
    }
    setState() {}
    enterChurch() {
      this.callbacks.onRegion(true);
    }
    returnToGraves() {
      this.callbacks.onRegion(false);
    }
    focusGrave() {}
    projectSaint() {
      return { x: 50, y: 32, visible: true };
    }
    moveTouch() {}
    dispose() {}
  },
}));
const view = () => (
  <HelmetProvider>
    <MemoryRouter initialEntries={['/confession']}>
      <Confession />
    </MemoryRouter>
  </HelmetProvider>
);
beforeEach(() => {
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubEnv('VITE_DEPLOY_TARGET', 'cloud');
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  requests.fetch.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('confession experience', () => {
  it('visitors see both scenes but private interactions prompt login without saving', async () => {
    requests.fetch.mockResolvedValue({ user: null });
    render(view());
    await waitFor(() => expect(requests.fetch).toHaveBeenCalledWith('/me', expect.anything()));
    await waitFor(() => expect(screen.getByRole('button', { name: '进入教堂' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '进入教堂' }));
    expect(screen.getByText('我在听。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '与圣女凛交谈' }));
    expect(screen.getByRole('dialog', { name: '请登录' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '你的记事' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭弹窗' }));
    fireEvent.click(screen.getByRole('button', { name: '回到墓地' }));
    expect(screen.getByRole('button', { name: '进入教堂' })).toBeEnabled();
    expect(screen.queryByText('我在听。')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '与圣女凛交谈' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看墓碑：失败' }));
    expect(screen.getByRole('dialog', { name: '请登录' })).toBeInTheDocument();
    expect(requests.fetch).not.toHaveBeenCalledWith('/confessions', expect.anything());
  });
  it('saves real content to the chosen category and clears all private views on logout', async () => {
    let saved = emptyConfession();
    const user = { id: 'alice', name: 'Alice', login: 'alice' };
    requests.fetch.mockImplementation(async (path: string, init: RequestInit) => {
      if (path === '/me') return { user };
      if (init?.method === 'PUT') {
        saved = JSON.parse(init.body as string).state;
      }
      return { user, archive: { state: saved, revision: 1 } };
    });
    render(view());
    await waitFor(() => expect(screen.getByRole('button', { name: '我的账号' })).toBeInTheDocument());
    await waitFor(() => expect(requests.fetch).toHaveBeenCalledWith('/confessions', expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: '查看墓碑：失败' }));
    fireEvent.click(screen.getByRole('button', { name: '写一则记事' }));
    expect(screen.getByLabelText('归入哪座墓碑')).toHaveValue(saved.categories[1].id);
    fireEvent.change(screen.getByLabelText('你的记事'), { target: { value: '面试失败，明天继续练习。' } });
    fireEvent.click(screen.getByRole('button', { name: '写下，归档' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(saved.entries[0].content).toBe('面试失败，明天继续练习。');
    fireEvent.click(screen.getByRole('button', { name: '查看墓碑：失败' }));
    expect(screen.getByText('面试失败，明天继续练习。')).toBeInTheDocument();
    requests.fetch.mockResolvedValue({ user: null });
    act(() => window.dispatchEvent(new CustomEvent('dblog-account-change', { detail: { user: null } })));
    await waitFor(() => expect(screen.queryByText('面试失败，明天继续练习。')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('keeps input on save failure and reports a real error', async () => {
    const user = { id: 'alice', name: 'Alice', login: 'alice' };
    requests.fetch.mockImplementation(async (path: string, init: RequestInit) => {
      if (init?.method === 'PUT') throw new Error('保存失败');
      return path === '/me' ? { user } : { user, archive: { state: null, revision: 0 } };
    });
    render(view());
    await waitFor(() => expect(requests.fetch).toHaveBeenCalledWith('/confessions', expect.anything()));
    fireEvent.click(screen.getByText('写一则忏悔'));
    fireEvent.change(screen.getByLabelText('你的记事'), { target: { value: '今天需要重新开始。' } });
    fireEvent.click(screen.getByRole('button', { name: '写下，归档' }));
    await waitFor(() => expect(screen.getAllByText('保存失败').length).toBeGreaterThan(0));
    expect(screen.getByLabelText('你的记事')).toHaveValue('今天需要重新开始。');
    expect(screen.queryByText('已保存到你的私密归档')).not.toBeInTheDocument();
  });
  it('renders a deterministic public SSR frame without private data or API calls', () => {
    const first = renderToString(view());
    const second = renderToString(view());
    expect(first).toBe(second);
    expect(first).toContain('让过错');
    expect(first).not.toContain('面试失败');
    expect(requests.fetch).not.toHaveBeenCalled();
  });
  it('creates a new tombstone and uses the saint bubble to open the real editor', async () => {
    let saved = emptyConfession();
    const user = { id: 'alice', name: 'Alice', login: 'alice' };
    requests.fetch.mockImplementation(async (path: string, init: RequestInit) => {
      if (path === '/me') return { user };
      if (init?.method === 'PUT') saved = JSON.parse(init.body as string).state;
      return { user, archive: { state: saved, revision: 1 } };
    });
    render(view());
    await waitFor(() => expect(requests.fetch).toHaveBeenCalledWith('/confessions', expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: '新增墓碑' }));
    fireEvent.change(screen.getByLabelText('墓碑名称'), { target: { value: '拖延' } });
    fireEvent.click(screen.getByRole('button', { name: '立一座墓碑' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '查看墓碑：拖延' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('雾的浓度'), { target: { value: '80' } });
    expect(screen.getByLabelText('雾的浓度')).toHaveValue('80');
    await waitFor(() => expect(screen.getByRole('button', { name: '进入教堂' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '进入教堂' }));
    fireEvent.click(screen.getByRole('button', { name: '与圣女凛交谈' }));
    expect(screen.getByRole('button', { name: /你今天想忏什么/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /你今天想忏什么/ }));
    expect(screen.getByRole('textbox', { name: '你的记事' })).toBeInTheDocument();
  });
  it('retries the same tombstone draft without blocking or duplicating an acknowledged record', async () => {
    let snapshot = emptyConfession();
    const save = vi.fn(async (next: ConfessionState) => {
      snapshot = next;
      return false;
    });
    const form = render(<NewTombstone state={snapshot} busy={false} onSave={save} />);
    fireEvent.change(screen.getByLabelText('墓碑名称'), { target: { value: '拖延' } });
    fireEvent.click(screen.getByRole('button', { name: '立一座墓碑' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const first = snapshot.categories.at(-1);
    form.rerender(<NewTombstone state={snapshot} busy={false} onSave={save} />);
    fireEvent.click(screen.getByRole('button', { name: '立一座墓碑' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(snapshot.categories).toHaveLength(5);
    expect(snapshot.categories.at(-1)).toEqual(first);
    expect(screen.queryByText('这座墓碑已经存在')).not.toBeInTheDocument();
  });
  it('retries the same entry draft with its original ID and timestamp exactly once', async () => {
    let snapshot = emptyConfession();
    const save = vi.fn(async (next: ConfessionState) => {
      snapshot = next;
      return false;
    });
    const form = render(<ConfessionEntryForm state={snapshot} busy={false} onSave={save} />);
    fireEvent.change(screen.getByLabelText('你的记事'), { target: { value: '今天重新开始。' } });
    fireEvent.click(screen.getByRole('button', { name: '写下，归档' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const first = snapshot.entries[0];
    form.rerender(<ConfessionEntryForm state={snapshot} busy={false} onSave={save} />);
    fireEvent.click(screen.getByRole('button', { name: '写下，归档' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(snapshot.entries).toEqual([first]);
    expect(screen.getByLabelText('你的记事')).toHaveValue('今天重新开始。');
  });
  it('Pages preview does not request an account API', async () => {
    vi.stubEnv('VITE_DEPLOY_TARGET', 'pages');
    render(view());
    fireEvent.click(screen.getByRole('button', { name: '新增墓碑' }));
    expect(screen.getByRole('dialog', { name: '请登录' })).toBeInTheDocument();
    expect(requests.fetch).not.toHaveBeenCalled();
  });
});
