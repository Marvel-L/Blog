import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MindFileDialog, MindFiles } from './MindFiles';
import { newMindState } from './model';
import { hasOpenOverlay } from '@/hooks/useModalOverlay';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('mind source editing', () => {
  it('never applies partial invalid source and protects dirty text on close', async () => {
    const state = newMindState('mind'),
      apply = vi.fn(() => true),
      close = vi.fn();
    render(<MindFileDialog initialState={state} onApply={apply} onClose={close} />);
    expect(hasOpenOverlay()).toBe(true);
    expect(screen.getByRole('dialog').parentElement?.parentElement).toBe(document.body);
    fireEvent.change(screen.getByLabelText('导图源码'), { target: { value: '{"version":' } });
    fireEvent.click(screen.getByRole('button', { name: '应用到当前导图' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('JSON 语法');
    expect(apply).not.toHaveBeenCalled();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.keyDown(screen.getByLabelText('导图源码'), { key: 'Escape' });
    expect(confirm).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '关闭文件编辑' }));
    expect(close).toHaveBeenCalledOnce();
  });
  it('retains source on failed application and reuses Markdown node IDs on retry', async () => {
    const apply = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
      close = vi.fn();
    render(<MindFileDialog onApply={apply} onClose={close} />);
    fireEvent.change(screen.getByLabelText('导图文件格式'), { target: { value: 'markdown' } });
    fireEvent.change(screen.getByLabelText('导图源码'), { target: { value: '# 编码\n- 根\n  - 子' } });
    fireEvent.click(screen.getByRole('button', { name: '导入为新导图' }));
    await screen.findByRole('alert');
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '导入为新导图' }));
    await act(async () => {});
    expect(apply.mock.calls[0][0]).toEqual(apply.mock.calls[1][0]);
    expect(close).toHaveBeenCalledOnce();
  });
  it('ignores a late file read after unmount and keeps the existing text on read errors', async () => {
    let resolve!: (source: string) => void;
    const file = {
      name: 'mind.md',
      size: 42,
      text: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    };
    const { unmount } = render(<MindFileDialog onApply={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('读取导图文件'), { target: { files: [file] } });
    expect(screen.getByLabelText('导图源码')).toBeDisabled();
    unmount();
    await act(async () => resolve('- 迟到的文件'));
    expect(hasOpenOverlay()).toBe(false);
    render(<MindFileDialog onApply={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('读取导图文件'), {
      target: { files: [{ ...file, text: () => Promise.reject(new Error('read error')) }] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('文件读取失败');
    expect(screen.getByLabelText('导图源码')).toHaveValue('');
  });
  it('does not overwrite a map that changed since its source editor opened', async () => {
    let state = newMindState('mind');
    const replace = vi.fn();
    render(<MindFiles getState={() => state} onReplace={replace} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: '导图文件与源码' }));
    state = { ...state, title: '外部的新修改' };
    fireEvent.click(screen.getByRole('button', { name: '应用到当前导图' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('发生了变化');
    expect(replace).not.toHaveBeenCalled();
    expect((screen.getByLabelText('导图源码') as HTMLTextAreaElement).value).toContain('未命名导图');
  });
});
