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

function mockPrintFonts(load: (font: string, text: string) => Promise<unknown>, ready = Promise.resolve()) {
  const append = document.body.append.bind(document.body);
  vi.spyOn(document.body, 'append').mockImplementation((...nodes) => {
    append(...nodes);
    for (const node of nodes) {
      if (node instanceof HTMLIFrameElement)
        Object.defineProperty(node.contentDocument!, 'fonts', {
          configurable: true,
          value: { load, ready },
        });
    }
  });
}

it('waits for embedded Chinese code glyphs and font readiness before printing', async () => {
  let loaded!: () => void;
  let ready!: () => void;
  const load = vi.fn(() => new Promise<void>((resolve) => (loaded = resolve)));
  mockPrintFonts(load, new Promise<void>((resolve) => (ready = resolve)));
  const doc = newDocument('中文代码');
  doc.content.markdown = '<pre><code class="language-go">// <mark>中文注释</mark>\nprintln("中文字符串")</code></pre>';
  const errors = vi.fn();
  const dispose = printDocument(doc, errors);
  const frame = document.querySelector('iframe')!;
  const print = vi.spyOn(frame.contentWindow!, 'print').mockImplementation(() => {});
  vi.spyOn(frame.contentWindow!, 'focus').mockImplementation(() => {});
  expect(load).toHaveBeenCalledWith('11pt "Resume Print CJK"', '// 中文注释\nprintln("中文字符串")');
  expect(print).not.toHaveBeenCalled();
  loaded();
  await Promise.resolve();
  expect(print).not.toHaveBeenCalled();
  ready();
  await waitFor(() => expect(print).toHaveBeenCalledOnce());
  expect(frame.contentDocument!.querySelector('code')!.textContent).toBe('// 中文注释\nprintln("中文字符串")');
  expect(frame.contentDocument!.querySelector('mark')).toHaveTextContent('中文注释');
  expect(errors).not.toHaveBeenCalled();
  dispose();
});

it('uses an embedded font for ordinary prose with default typography', async () => {
  mockPrintFonts(vi.fn(() => Promise.resolve()));
  const doc = newDocument('中文正文');
  doc.content.markdown = '# 中文标题\n\n普通正文与 **加粗内容**。\n\n> 引用内容';
  const errors = vi.fn();
  const dispose = printDocument(doc, errors);
  const frame = document.querySelector('iframe')!;
  const print = vi.spyOn(frame.contentWindow!, 'print').mockImplementation(() => {});
  vi.spyOn(frame.contentWindow!, 'focus').mockImplementation(() => {});
  await waitFor(() => expect(print).toHaveBeenCalledOnce());
  const article = frame.contentDocument!.querySelector('article')!;
  expect(frame.contentWindow!.getComputedStyle(article).fontFamily).toContain('Resume Print CJK');
  expect(article.querySelector('h1')).toHaveTextContent('中文标题');
  expect(article.querySelector('strong')).toHaveTextContent('加粗内容');
  expect(article.querySelector('blockquote')).toHaveTextContent('引用内容');
  expect(errors).not.toHaveBeenCalled();
  dispose();
});

it('reports embedded font loading failures instead of printing missing glyphs', async () => {
  mockPrintFonts(vi.fn(() => Promise.reject(new Error('font unavailable'))));
  const doc = newDocument('中文代码');
  doc.content.markdown = '```go\n// 中文注释\n```';
  const errors = vi.fn();
  printDocument(doc, errors);
  const frame = document.querySelector('iframe')!;
  const print = vi.spyOn(frame.contentWindow!, 'print').mockImplementation(() => {});
  await waitFor(() => expect(errors).toHaveBeenCalledWith('打印内容加载失败，请重试。'));
  expect(print).not.toHaveBeenCalled();
  expect(document.querySelector('iframe')).toBeNull();
});
