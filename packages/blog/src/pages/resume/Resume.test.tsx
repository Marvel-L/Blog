import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Resume from './Resume';
import { toLibrary, type StoredResume } from './model';

const user = { id: '10000000-0000-4000-8000-000000000001', login: 'alice', name: 'Alice' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let markdown: string;
let revision: number;
let stored: StoredResume | null;
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
  stored = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_, init) => {
      if (init?.method === 'PUT') {
        stored = JSON.parse(String(init.body)).state;
        markdown = toLibrary(stored).documents[0]?.content.markdown ?? '';
        revision++;
      }
      return json({
        user,
        resume: { state: stored ?? { version: 1, markdown }, revision, updatedAt: '2026-11-15T10:00:00Z' },
      });
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
  expect(html).toContain('正在加载定稿');
  expect(html).not.toContain('私有简历');
  expect(fetch).not.toHaveBeenCalled();
  mount();
  expect(await screen.findByRole('heading', { name: '我的定稿' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '文档编辑' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '使用 GitHub 登录' })).toHaveAttribute(
    'href',
    '/api/v1/auth/github/start?return_to=%2Fresume',
  );
});

it('keeps the legacy resume while creating, editing, duplicating and deleting an independent interview draft', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const first = mount();
  fireEvent.click(await screen.findByRole('button', { name: '新建定稿' }));
  fireEvent.change(screen.getByRole('textbox', { name: '新定稿名称' }), { target: { value: '项目面试主稿' } });
  expect(screen.queryByRole('combobox', { name: '新定稿类型' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: '填入面试提纲' }));
  fireEvent.click(screen.getByRole('button', { name: '创建' }));
  fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
  const source = await screen.findByLabelText(/Markdown 源码/);
  expect((source as HTMLTextAreaElement).value).toContain('## 技术方案与选型取舍');
  fireEvent.change(source, { target: { value: '# 完整面试方案\n\n[原始依据](/Blog/book/source)' } });
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await waitFor(() => expect(toLibrary(stored).documents).toHaveLength(2));
  const documents = toLibrary(stored).documents;
  expect(documents[0].content.markdown).toContain('原始内容');
  expect(documents[1].content.markdown).toContain('完整面试方案');
  fireEvent.change(screen.getByLabelText('选择定稿'), { target: { value: documents[0].id } });
  fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
  expect(await screen.findByLabelText(/Markdown 源码/)).toHaveValue(documents[0].content.markdown);
  fireEvent.change(screen.getByLabelText('选择定稿'), { target: { value: documents[1].id } });
  fireEvent.click(screen.getByRole('button', { name: '预览' }));
  expect(await screen.findByRole('heading', { name: '完整面试方案' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '原始依据' })).toHaveAttribute('href', '/Blog/book/source');
  fireEvent.click(screen.getByRole('button', { name: '复制' }));
  expect(screen.getByLabelText('定稿名称')).toHaveValue('项目面试主稿 副本');
  fireEvent.click(screen.getByRole('button', { name: '删除' }));
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await waitFor(() => expect(toLibrary(stored).documents).toHaveLength(2));
  first.unmount();
  mount();
  await screen.findByRole('button', { name: '新建定稿' });
  expect(screen.getByLabelText('选择定稿').querySelectorAll('option')).toHaveLength(2);
});

it('retains the historical resume, comments and formatting when adding a free-form draft without categories', async () => {
  const legacy = {
    version: 1 as const,
    markdown:
      '# 历史简历\n\n<span data-resume-comments="11111111-1111-4111-8111-111111111111"><mark>重点成果</mark></span> <span style="color: red">指标</span>',
    comments: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        quote: '重点成果',
        body: '已有批注',
        createdAt: '2026-11-16T10:00:00.000Z',
      },
    ],
  };
  stored = legacy;
  const first = mount();
  await screen.findByRole('heading', { name: '历史简历' });
  expect(screen.getByRole('combobox', { name: '选择定稿' }).textContent).toBe('我的简历');
  expect(screen.queryByRole('combobox', { name: '定稿类型' })).not.toBeInTheDocument();
  expect(document.querySelector('.resume-document mark')).toHaveTextContent('重点成果');
  expect(screen.getByText('已有批注')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '新建定稿' }));
  fireEvent.change(screen.getByLabelText('新定稿名称'), { target: { value: '任意内容' } });
  fireEvent.click(screen.getByRole('button', { name: '创建' }));
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await waitFor(() => expect(toLibrary(stored).documents).toHaveLength(2));
  expect(toLibrary(stored).documents[0].content).toEqual(legacy);
  expect(toLibrary(stored).documents[1]).not.toHaveProperty('kind');
  first.unmount();
  mount();
  await screen.findByRole('heading', { name: '历史简历' });
  expect(screen.getByText('已有批注')).toBeInTheDocument();
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
