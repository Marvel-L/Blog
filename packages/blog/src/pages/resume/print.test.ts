import { afterEach, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { printDocument } from './print';
import { newDocument } from './library';

afterEach(() => {
  document.querySelectorAll('iframe').forEach((node) => node.remove());
  vi.restoreAllMocks();
});
it('prints only the current markdown snapshot and removes comment anchors and app chrome', async () => {
  const doc = newDocument('<测试主稿>');
  doc.content.markdown = '# 当前方案\n\n<span data-resume-comments="11111111-1111-4111-8111-111111111111">正文</span>';
  doc.content.comments = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      quote: '正文',
      body: '私有评论',
      createdAt: '2026-11-18T10:00:00.000Z',
    },
  ];
  const errors = vi.fn();
  const dispose = printDocument(doc, errors);
  const frame = document.querySelector('iframe')!;
  const print = vi.spyOn(frame.contentWindow!, 'print').mockImplementation(() => {});
  vi.spyOn(frame.contentWindow!, 'focus').mockImplementation(() => {});
  await waitFor(() => expect(print).toHaveBeenCalledOnce());
  expect(frame.contentDocument?.title).toBe('<测试主稿>');
  expect(frame.contentDocument?.body.textContent).toContain('当前方案');
  expect(frame.contentDocument?.body.innerHTML).not.toMatch(/私有评论|data-resume-comments|resume-toolbar/);
  expect(errors).not.toHaveBeenCalled();
  dispose();
  expect(document.querySelector('iframe')).toBeNull();
});
it('reports missing images instead of silently producing an incomplete PDF', async () => {
  const doc = newDocument('主稿');
  doc.content.markdown = '![架构](https://example.com/missing.png)';
  const errors = vi.fn();
  const dispose = printDocument(doc, errors);
  const frame = document.querySelector('iframe')!;
  const print = vi.spyOn(frame.contentWindow!, 'print').mockImplementation(() => {});
  frame.contentDocument!.querySelector('img')!.dispatchEvent(new Event('error'));
  await waitFor(() => expect(errors).toHaveBeenCalledWith(expect.stringContaining('图片无法加载')));
  expect(print).not.toHaveBeenCalled();
  expect(document.querySelector('iframe')).toBeNull();
  dispose();
});

it('prints Go syntax and selected text highlights, retaining empty lines and literal HTML as code', async () => {
  const doc = newDocument('代码方案');
  const source = 'package main\n\nfunc main() {\n\tprintln("<script>")\n}';
  doc.content.markdown =
    '<pre><code class="language-go">package main\n\nfunc main() {\n\t<mark>println</mark>("&lt;script&gt;")\n}</code></pre>';
  const dispose = printDocument(doc, vi.fn());
  const target = document.querySelector('iframe')!.contentDocument!;
  try {
    const code = target.querySelector('code')!;
    expect(code.textContent).toBe(source);
    expect(code.querySelector('.hljs-keyword')).toHaveTextContent('package');
    expect(code.querySelectorAll('mark')).toHaveLength(1);
    expect(code.querySelector('mark')).toHaveTextContent('println');
    expect(target.querySelector('script, button')).toBeNull();
    expect(target.head.textContent).toContain('print-color-adjust:exact');
  } finally {
    dispose();
  }
});
