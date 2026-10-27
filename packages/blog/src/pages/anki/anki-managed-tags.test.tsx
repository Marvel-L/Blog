import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnkiTagManager } from './AnkiTagManager';
import { AnkiTagPicker } from './AnkiTagPicker';

const catalog = [
  { id: 'gc', name: 'GC', cardCount: 2 },
  { id: 'slice', name: 'slice', cardCount: 0 },
];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('独立标签管理', () => {
  it('新建/改名/删除各调用专属端点，名称忽略大小写去重，不向卡片接口写入', async () => {
    let tags = catalog.map((tag) => ({ ...tag }));
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (!init?.method) return new Response(JSON.stringify({ tags }));
      if (init.method === 'POST') {
        const name = JSON.parse(String(init.body)).name;
        const tag = { id: 'gmp', name, cardCount: 0 };
        tags.push(tag);
        return new Response(JSON.stringify(tag));
      }
      if (init.method === 'PATCH') {
        const tag = tags.find((tag) => String(url).endsWith('/' + tag.id))!;
        tag.name = JSON.parse(String(init.body)).name;
        return new Response(JSON.stringify(tag));
      }
      tags = tags.filter((tag) => !String(url).endsWith('/' + tag.id));
      return new Response(JSON.stringify({ deleted: true }));
    });
    vi.stubGlobal('fetch', fetcher);
    const changed = vi.fn();
    render(<AnkiTagManager deckId="d1" onChanged={changed} />);
    await screen.findByRole('button', { name: '重命名标签 GC' });
    fireEvent.change(screen.getByRole('textbox', { name: '标签名称' }), { target: { value: ' Gc ' } });
    fireEvent.click(screen.getByRole('button', { name: '新增标签' }));
    expect(screen.getByRole('alert')).toHaveTextContent('忽略大小写');
    expect(fetcher.mock.calls.filter(([, init]) => init?.method)).toHaveLength(0);
    fireEvent.change(screen.getByRole('textbox', { name: '标签名称' }), { target: { value: 'GMP' } });
    fireEvent.click(screen.getByRole('button', { name: '新增标签' }));
    await screen.findByRole('button', { name: '删除标签 GMP' });
    fireEvent.click(screen.getByRole('button', { name: '重命名标签 GC' }));
    fireEvent.change(screen.getByRole('textbox', { name: '标签名称' }), { target: { value: '垃圾回收' } });
    fireEvent.click(screen.getByRole('button', { name: '保存标签名称' }));
    await screen.findByRole('button', { name: '删除标签 垃圾回收' });
    fireEvent.click(screen.getByRole('button', { name: '删除标签 垃圾回收' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '删除标签 垃圾回收' })).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('卡片及复习进度保留');
    expect(changed).toHaveBeenCalledTimes(3);
    const writes = fetcher.mock.calls.filter(([, init]) => init?.method);
    expect(writes.map(([, init]) => init?.method)).toEqual(['POST', 'PATCH', 'DELETE']);
    expect(writes.every(([url]) => String(url).includes('/decks/d1/tags'))).toBe(true);
  });
  it('创建失败保留输入和已有标签、不误报成功', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async (_url, init) =>
          init?.method
            ? new Response(JSON.stringify({ error: '标签已存在（忽略大小写）' }), { status: 409 })
            : new Response(JSON.stringify({ tags: catalog })),
        ),
    );
    const changed = vi.fn();
    render(<AnkiTagManager deckId="d1" onChanged={changed} />);
    await screen.findByRole('button', { name: '删除标签 GC' });
    fireEvent.change(screen.getByRole('textbox', { name: '标签名称' }), { target: { value: 'new' } });
    fireEvent.click(screen.getByRole('button', { name: '新增标签' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('textbox', { name: '标签名称' })).toHaveValue('new');
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '删除标签 GC' })).toBeInTheDocument();
  });
  it('点击选择/取消只回调标签，不创建目录；旧 Gc 显示选中 GC', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tags: catalog })));
    vi.stubGlobal('fetch', fetcher);
    const change = vi.fn();
    render(<AnkiTagPicker deckId="d1" value={['Gc']} onChange={change} onReady={vi.fn()} />);
    const choices = await screen.findByRole('group', { name: '选择已有标签' });
    const gc = within(choices).getByRole('button', { name: 'GC' });
    expect(gc).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(gc);
    expect(change).toHaveBeenLastCalledWith([]);
    fireEvent.click(within(choices).getByRole('button', { name: 'slice' }));
    expect(change).toHaveBeenLastCalledWith(['Gc', 'slice']);
    expect(fetcher.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });
  it('切换卡片库后忽略旧请求，标签只来自新库', async () => {
    let resolveOld: ((data: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url) =>
        String(url).includes('/d1/')
          ? new Promise<Response>((resolve) => {
              resolveOld = resolve;
            })
          : Promise.resolve(new Response(JSON.stringify({ tags: [{ id: 'java', name: 'Java', cardCount: 0 }] }))),
      ),
    );
    const ready = vi.fn();
    const mounted = render(<AnkiTagPicker deckId="d1" value={[]} onChange={vi.fn()} onReady={ready} />);
    mounted.rerender(<AnkiTagPicker deckId="d2" value={[]} onChange={vi.fn()} onReady={ready} />);
    await screen.findByRole('button', { name: 'Java' });
    await act(async () => {
      resolveOld?.(new Response(JSON.stringify({ tags: catalog })));
    });
    expect(screen.queryByRole('button', { name: 'GC' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Java' })).toBeInTheDocument();
  });
});
