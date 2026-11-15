import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import { TableKit } from '@tiptap/extension-table';
import { cleanResumeHtml, htmlToMarkdown, markdownToHtml, RED, GREEN } from './markdown';
import { validResumeState, validateResume } from './model';

describe('resume Markdown document conversion', () => {
  it('preserves legacy template headings, contact text, dates and nested achievements', () => {
    const html = markdownToHtml(
      '# 示例姓名\n\n> <span class="icon">&#xe60f;</span> `123456`\n\n## &#xe80c; 教育经历\n\n<div class="entry-title"><h3>示例大学</h3><p>2020 - 2024</p></div>\n\n- **项目**\n    - 嵌套成果',
    );
    expect(html).toContain('<h1>示例姓名</h1>');
    expect(html).toContain('<h3>示例大学</h3>');
    expect(html).toContain('2020 - 2024');
    expect(html).toContain('<code>123456</code>');
    expect(html).not.toContain('\ue80c');
    const plain = htmlToMarkdown(html);
    expect(plain).toContain('### 示例大学');
    expect(plain).toContain('**项目**');
    expect(plain).toContain('嵌套成果');
  });
  it('round trips red, green, highlight, bold, links, underline and tables through the actual editor schema', () => {
    const input =
      '# 姓名\n\n<mark><strong>重点</strong></mark> <span style="color: red">红色</span> <span style="color: green">绿色</span> <u>下划线</u>\n\n[链接](https://example.com)\n\n| 项目 | 时间 |\n| --- | --- |\n| 后端 | 2026 |';
    const editor = new Editor({
      extensions: [StarterKit, TextStyle, Color, Highlight.configure({ multicolor: true }), TableKit],
      content: markdownToHtml(input),
    });
    try {
      const exported = htmlToMarkdown(editor.getHTML());
      editor.commands.setContent(markdownToHtml(exported));
      const result = editor.getHTML();
      const doc = new DOMParser().parseFromString(result, 'text/html');
      expect(doc.querySelector('mark strong, strong mark')?.textContent).toBe('重点');
      expect(Array.from(doc.querySelectorAll('span')).map((n) => n.style.color)).toEqual([
        'rgb(194, 65, 59)',
        'rgb(24, 121, 78)',
      ]);
      expect(doc.querySelector('u')?.textContent).toBe('下划线');
      expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
      expect(doc.querySelectorAll('table tr')).toHaveLength(2);
    } finally {
      editor.destroy();
    }
  });
  it('colors only the selected text and supports undo', () => {
    const editor = new Editor({
      extensions: [StarterKit, TextStyle, Color, Highlight],
      content: '<p>负责系统开发</p>',
    });
    try {
      editor.chain().setTextSelection({ from: 3, to: 5 }).setColor(RED).setHighlight().run();
      expect(editor.getHTML()).toContain('负责<span');
      expect(editor.getHTML()).toContain('系统</mark>');
      expect(editor.getHTML()).toContain('开发</p>');
      editor.commands.setColor(GREEN);
      expect(editor.getHTML()).toContain('rgb(24, 121, 78)');
      editor.commands.unsetHighlight();
      expect(editor.getHTML()).not.toContain('<mark');
      expect(editor.commands.undo()).toBe(true);
    } finally {
      editor.destroy();
    }
  });
  it('removes scripts, embeds, unsafe URLs and non-document CSS from import and paste', () => {
    const html = cleanResumeHtml(
      '<script>alert(1)</script><iframe src="https://example.com"></iframe><img src=x onerror=alert(1)><p onclick="alert(1)" style="position:fixed; color: red; background-image: url(https://x)">正文</p><a href="javascript:alert(1)">恶意</a><a href="//example.com">相对</a>',
    );
    expect(html).not.toMatch(/script|iframe|<img|onerror|onclick|position|background-image|javascript|\/\/example/);
    expect(html).toContain('rgb(194, 65, 59)');
    expect(html).toContain('正文');
  });
  it('rejects malformed snapshots and oversized or invalid source', () => {
    expect(validResumeState({ version: 1, markdown: '简历' })).toBe(true);
    expect(validResumeState({ version: 1, markdown: '\0' })).toBe(false);
    expect(validResumeState({ version: 1, markdown: '字'.repeat(100001) })).toBe(false);
    expect(() =>
      validateResume({ user: { id: 'a', name: '', login: '' }, resume: { revision: 1, state: null, updatedAt: null } }),
    ).toThrow();
  });
});
