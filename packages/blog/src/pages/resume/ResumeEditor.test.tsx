import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import ResumeEditor from './ResumeEditor';
import type { ResumeState } from './model';

afterEach(() => vi.restoreAllMocks());

async function mount() {
  const changes = vi.fn();
  const errors = vi.fn();
  function Harness() {
    const [state, setState] = useState<ResumeState>({ version: 1, markdown: '负责系统开发，系统开发' });
    const [mode, setMode] = useState<'edit' | 'markdown' | 'preview'>('edit');
    return (
      <>
        <button onClick={() => setMode('markdown')}>源码</button>
        <button onClick={() => setMode('edit')}>编辑</button>
        <ResumeEditor
          state={state}
          mode={mode}
          onModeChange={setMode}
          onChange={(next) => {
            changes(next);
            setState(next);
          }}
          onError={errors}
        />
      </>
    );
  }
  const rendered = render(<Harness />);
  const doc = await screen.findByRole('textbox', { name: '简历正文' });
  await waitFor(() => expect(doc).toHaveTextContent('负责系统开发'));
  const editor = (doc as HTMLElement & { editor: Editor }).editor;
  return { ...rendered, editor, doc, changes, errors };
}

it('submits anchors and metadata once, edits comments without rewriting source, locates and deletes them', async () => {
  const { editor, doc, changes, errors } = await mount();
  act(() => {
    editor.commands.setTextSelection({ from: 3, to: 7 });
  });
  fireEvent.contextMenu(doc, { clientX: 50, clientY: 100 });
  fireEvent.click(screen.getByRole('menuitem', { name: '添加评论' }));
  fireEvent.change(screen.getByRole('textbox', { name: '评论内容' }), { target: { value: '补充指标' } });
  expect(changes).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '提交评论' }));
  expect(changes).toHaveBeenCalledTimes(1);
  const first: ResumeState = changes.mock.calls[0][0];
  expect(first.comments?.[0]).toMatchObject({ body: '补充指标', quote: '系统开发' });
  expect(first.markdown).toContain(first.comments![0].id);
  expect(screen.queryByText('原文已删除或标记已移除')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '编辑评论' }));
  fireEvent.change(screen.getByRole('textbox', { name: '评论内容' }), { target: { value: '补充延迟指标' } });
  fireEvent.click(screen.getByRole('button', { name: '保存评论' }));
  expect(changes.mock.lastCall![0].markdown).toBe(first.markdown);
  fireEvent.click(screen.getByRole('button', { name: '源码' }));
  expect(screen.getByLabelText(/Markdown 源码/)).toHaveValue(first.markdown);
  expect(within(screen.getByRole('complementary', { name: '简历评论' })).getByText('补充延迟指标')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '定位原文：系统开发' }));
  expect(doc).toHaveAttribute('contenteditable', 'false');
  expect(editor.state.selection.from).toBe(3);
  expect(editor.state.selection.to).toBe(7);
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  act(() => {
    editor.view.dispatch(editor.state.tr.delete(3, 7));
  });
  expect(await screen.findByText('原文已删除或标记已移除')).toBeInTheDocument();
  expect(screen.getByText('补充延迟指标')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '定位原文：系统开发' })).toBeDisabled();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: '删除评论' }));
  expect(changes.mock.lastCall![0].comments).toEqual([]);
  expect(doc).toHaveTextContent('负责，系统开发');
  expect(errors.mock.calls.every(([message]) => message === '')).toBe(true);
});

it('retains draft text and rejects a stale selected range after concurrent body editing', async () => {
  const { editor, errors, changes } = await mount();
  act(() => {
    editor.commands.setTextSelection({ from: 3, to: 7 });
  });
  fireEvent.click(screen.getByRole('button', { name: '添加评论' }));
  fireEvent.change(screen.getByRole('textbox', { name: '评论内容' }), { target: { value: '保留我的输入' } });
  act(() => {
    editor.view.dispatch(editor.state.tr.insertText('新', 1));
  });
  fireEvent.click(screen.getByRole('button', { name: '提交评论' }));
  expect(errors).toHaveBeenLastCalledWith(expect.stringContaining('正文已更改'));
  expect(screen.getByRole('textbox', { name: '评论内容' })).toHaveValue('保留我的输入');
  expect(changes.mock.lastCall![0].comments).toBeUndefined();
});
