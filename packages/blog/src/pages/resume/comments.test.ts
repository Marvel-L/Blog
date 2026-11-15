import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import { TableKit } from '@tiptap/extension-table';
import { addCommentAnchor, commentRanges, documentMarkdown, removeCommentAnchor, ResumeCommentMark } from './comments';
import { cleanResumeHtml, markdownToHtml } from './markdown';
import { validResumeState } from './model';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const comment = { id: a, quote: '系统', body: '补充指标', createdAt: '2026-11-16T10:00:00.000Z' };
const extensions = [StarterKit, TextStyle, Color, Highlight, TableKit, ResumeCommentMark];

describe('resume comment anchoring', () => {
  it('keeps overlapping marks, colors, repeated text and Markdown round trips distinct', () => {
    const editor = new Editor({ extensions, content: '<p>负责系统开发，系统开发</p>' });
    try {
      editor.view.dispatch(addCommentAnchor(editor.state, { from: 3, to: 7 }, a));
      editor.view.dispatch(addCommentAnchor(editor.state, { from: 5, to: 10 }, b));
      editor.chain().setTextSelection({ from: 3, to: 5 }).setColor('#c2413b').setHighlight().run();
      const source = documentMarkdown(editor.state.doc);
      editor.commands.setContent(markdownToHtml(source));
      const ranges = commentRanges(editor.state.doc);
      expect(editor.state.doc.textContent).toBe('负责系统开发，系统开发');
      expect(
        ranges
          .get(a)
          ?.map(({ from, to }) => editor.state.doc.textBetween(from, to))
          .join(''),
      ).toBe('系统开发');
      expect(
        ranges
          .get(b)
          ?.map(({ from, to }) => editor.state.doc.textBetween(from, to))
          .join(''),
      ).toBe('开发，系统');
      expect(editor.getHTML()).toContain('rgb(194, 65, 59)');
      expect(editor.getHTML()).toContain('<mark');
      editor.view.dispatch(removeCommentAnchor(editor.state, a));
      expect(commentRanges(editor.state.doc).has(a)).toBe(false);
      expect(commentRanges(editor.state.doc).has(b)).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('moves marks with text edits, excludes typing at boundaries and leaves deleted text unanchored', () => {
    const editor = new Editor({ extensions, content: '<p>负责系统开发，系统开发</p>' });
    try {
      editor.view.dispatch(addCommentAnchor(editor.state, { from: 3, to: 7 }, a));
      editor.view.dispatch(editor.state.tr.insertText('主要', 1));
      expect(commentRanges(editor.state.doc).get(a)).toEqual([{ from: 5, to: 9 }]);
      editor.commands.insertContentAt(9, '完成');
      expect(commentRanges(editor.state.doc).get(a)).toEqual([{ from: 5, to: 9 }]);
      editor.view.dispatch(editor.state.tr.delete(5, 9));
      expect(commentRanges(editor.state.doc).has(a)).toBe(false);
      expect(editor.state.doc.textContent).toContain('系统开发');
      editor.commands.undo();
      expect(commentRanges(editor.state.doc).has(a)).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('supports selection across paragraphs and table cells and rejects code without changing it', () => {
    const editor = new Editor({
      extensions,
      content: '<p>第一段</p><p>第二段</p><table><tr><td>表格</td></tr></table><pre><code>代码</code></pre>',
    });
    try {
      editor.view.dispatch(addCommentAnchor(editor.state, { from: 2, to: 8 }, a));
      const source = documentMarkdown(editor.state.doc);
      editor.commands.setContent(markdownToHtml(source));
      expect(commentRanges(editor.state.doc).get(a)).toHaveLength(2);
      let cell = 0;
      let code = 0;
      editor.state.doc.descendants((node, pos) => {
        if (node.text === '表格') cell = pos;
        if (node.text?.trim() === '代码') code = pos;
      });
      editor.view.dispatch(addCommentAnchor(editor.state, { from: cell, to: cell + 2 }, b));
      editor.commands.setContent(markdownToHtml(documentMarkdown(editor.state.doc)));
      expect(commentRanges(editor.state.doc).has(b)).toBe(true);
      editor.state.doc.descendants((node, pos) => {
        if (node.text?.trim() === '代码') code = pos;
      });
      expect(editor.state.doc.resolve(code).parent.type.name, editor.getHTML()).toBe('codeBlock');
      const before = editor.getHTML();
      expect(() => addCommentAnchor(editor.state, { from: code, to: code + 2 }, a)).toThrow('代码块');
      expect(editor.getHTML()).toBe(before);
    } finally {
      editor.destroy();
    }
  });

  it('sanitizes anchor attributes and strips copied anchors on paste', () => {
    const html = `<p data-resume-comments="${a}">段落</p><span data-resume-comments="${a} ${a} invalid" onclick="alert(1)">正文</span>`;
    const clean = cleanResumeHtml(html);
    expect(clean).toBe(`<p>段落</p><span data-resume-comments="${a}">正文</span>`);
    expect(cleanResumeHtml(html, false)).toBe('<p>段落</p><span>正文</span>');
  });

  it('accepts legacy snapshots and validates metadata limits, IDs, timestamps and control characters', () => {
    expect(validResumeState({ version: 1, markdown: '旧正文' })).toBe(true);
    expect(validResumeState({ version: 1, markdown: '正文', comments: [comment] })).toBe(true);
    for (const invalid of [
      null,
      [comment, comment],
      [{ ...comment, id: 'bad' }],
      [{ ...comment, body: ' ' }],
      [{ ...comment, body: '\0' }],
      [{ ...comment, quote: '字'.repeat(1001) }],
      [{ ...comment, body: '字'.repeat(2001) }],
      [{ ...comment, createdAt: '2026-02-30T10:00:00.000Z' }],
      [{ ...comment, createdAt: 'yesterday' }],
      [{ ...comment, owner: 'another user' }],
      Array.from({ length: 101 }, (_, i) => ({
        ...comment,
        id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
      })),
    ])
      expect(validResumeState({ version: 1, markdown: '正文', comments: invalid })).toBe(false);
  });
});
