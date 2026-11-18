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
