import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Resume from './Resume';

const user = { id: '10000000-0000-4000-8000-000000000001', login: 'alice', name: 'Alice' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let markdown: string;
let revision: number;
function mount() {
  return render(
    <MemoryRouter>
      <Resume />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  localStorage.clear();
  markdown = '# 私有简历\n\n原始内容';
  revision = 1;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_, init) => {
      if (init?.method === 'PUT') {
        markdown = JSON.parse(String(init.body)).state.markdown;
        revision++;
      }
      return json({ user, resume: { state: { version: 1, markdown }, revision, updatedAt: '2026-11-15T10:00:00Z' } });
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('renders an anonymous deterministic shell without making requests during SSR', async () => {
  vi.mocked(fetch).mockResolvedValue(json({}, 401));
  const html = renderToString(
    <MemoryRouter>
      <Resume />
    </MemoryRouter>,
  );
  expect(html).toContain('正在加载简历');
  expect(html).not.toContain('私有简历');
  expect(fetch).not.toHaveBeenCalled();
  mount();
  expect(await screen.findByRole('heading', { name: '我的简历' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '文档编辑' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '使用 GitHub 登录' })).toHaveAttribute(
    'href',
    '/api/v1/auth/github/start?return_to=%2Fresume',
  );
});
it('saves Markdown edits, displays them in the document, and clears private content on logout', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Markdown' }));
  const source = await screen.findByLabelText(/Markdown 源码/);
  expect(source).toHaveValue(markdown);
  fireEvent.change(source, { target: { value: '# 修改后的姓名\n\n<mark>项目成果</mark>' } });
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await waitFor(() => expect(markdown).toContain('修改后的姓名'));
  fireEvent.click(screen.getByRole('button', { name: '文档编辑' }));
  expect(await screen.findByRole('heading', { name: '修改后的姓名' })).toBeInTheDocument();
  expect(screen.getByText('项目成果').tagName).toBe('MARK');
  vi.mocked(fetch).mockResolvedValue(json({}, 401));
  act(() => {
    window.dispatchEvent(new CustomEvent('dblog-account-change', { detail: { user: null } }));
  });
  expect(await screen.findByRole('link', { name: '使用 GitHub 登录' })).toBeInTheDocument();
  expect(screen.queryByText('项目成果')).not.toBeInTheDocument();
});

it('does not rewrite imported Markdown when opening the document or switching preview modes', async () => {
  markdown = '# 私有简历\n\n<div class="entry-title"><h3>示例经历</h3><p>2026 - 至今</p></div>\n\n- **成果**\n';
  const original = markdown;
  mount();
  await screen.findByRole('heading', { name: '示例经历' });
  fireEvent.click(screen.getByRole('button', { name: '预览' }));
  fireEvent.click(screen.getByRole('button', { name: '文档编辑' }));
  fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
  expect(screen.getByLabelText(/Markdown 源码/)).toHaveValue(original);
  expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
});
