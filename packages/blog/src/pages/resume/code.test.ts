import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { describe, expect, it } from 'vitest';
import { ResumeCodeBlock } from './ResumeCodeBlock';
import { markdownToHtml, htmlToMarkdown, cleanResumeHtml, HIGHLIGHT } from './markdown';
import { parseCodeInfo } from './code';
import { codeTokens } from './code-highlight';
import { ResumeCommentMark, addCommentAnchor, commentRanges, documentMarkdown } from './comments';

const go = 'package main\n\nfunc main() {\n\tfmt.Println("你好 <script> & `")\n}\n';
function createEditor(markdown: string) {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      ResumeCodeBlock,
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      ResumeCommentMark,
    ],
    content: markdownToHtml(markdown),
  });
  return {
    editor,
    element,
    dispose: () => {
      editor.destroy();
      element.remove();
    },
  };
}

describe('draft code syntax and selected-text highlighting', () => {
  it.each([go, '', '\n\n', ' \t\n  ', 'const s = "````";\n\n\n', '😀 <tag> & \ue60f'])(
    'round trips language, metadata and exact unmarked source through the actual code schema: %j',
    (source) => {
      const { editor, dispose } = createEditor('`````go title="方案"\n' + source + '\n`````');
      try {
        expect(editor.state.doc.firstChild?.textContent).toBe(source);
        expect(editor.state.doc.firstChild?.attrs).toMatchObject({ language: 'go', codeMeta: 'title="方案"' });
        const exported = htmlToMarkdown(editor.getHTML());
        expect(exported).not.toMatch(/hljs-|高亮行|data-resume-code-lines/);
        editor.commands.setContent(markdownToHtml(exported));
        expect(editor.state.doc.firstChild?.textContent).toBe(source);
        expect(editor.state.doc.firstChild?.attrs).toMatchObject({ language: 'go', codeMeta: 'title="方案"' });
      } finally {
        dispose();
      }
    },
  );

  it.each(['fmt.Println', 'func main() {\n\tfmt.Println'])(
    'marks only the selected code text, keeps syntax/source/comments, saves and reloads and supports undo: %j',
    (selected) => {
      const id = '11111111-1111-4111-8111-111111111111';
      const { editor, element, dispose } = createEditor(
        '```go\n' + go + '\n```\n\n<span data-resume-comments="' + id + '">普通正文</span>',
      );
      try {
        const anchors = commentRanges(editor.state.doc);
        const from = 1 + go.indexOf(selected);
        expect(
          editor
            .chain()
            .setTextSelection({ from, to: from + selected.length })
            .setHighlight({ color: HIGHLIGHT })
            .run(),
        ).toBe(true);
        expect([...element.querySelectorAll('code mark')].map((mark) => mark.textContent).join('')).toBe(selected);
        expect(element.querySelector('code .hljs-keyword')).toHaveTextContent('package');
        expect(editor.state.doc.firstChild?.textContent).toBe(go);
        expect(commentRanges(editor.state.doc)).toEqual(anchors);
        expect(element.querySelector('.resume-code-block button')).toBeNull();
        expect(editor.getHTML()).not.toContain('hljs-keyword');
        const exported = documentMarkdown(editor.state.doc);
        expect(exported).toContain('<pre>');
        expect(exported).toContain('<mark');
        expect(editor.commands.undo()).toBe(true);
        expect(editor.getHTML()).not.toContain('<mark');
        expect(editor.commands.redo()).toBe(true);
        expect(editor.getHTML()).toContain('<mark');
        editor.commands.setContent(markdownToHtml(exported), { emitUpdate: false });
        expect(editor.state.doc.firstChild?.textContent).toBe(go);
        expect([...element.querySelectorAll('code mark')].map((mark) => mark.textContent).join('')).toBe(selected);
        expect(commentRanges(editor.state.doc)).toEqual(anchors);
        expect(() => addCommentAnchor(editor.state, { from, to: from + selected.length }, crypto.randomUUID())).toThrow(
          '代码块暂不支持批注',
        );
        editor
          .chain()
          .setTextSelection({ from, to: from + selected.length })
          .unsetHighlight()
          .run();
        expect(documentMarkdown(editor.state.doc)).toContain('```go');
        expect(editor.state.doc.firstChild?.textContent).toBe(go);
      } finally {
        dispose();
      }
    },
  );

  it('preserves colored and highlighted literal HTML, blank lines and whitespace while edits move the selected marks', () => {
    const source = '<mark>literal</mark> & `\n\n\t';
    const { editor, dispose } = createEditor('```go\n' + source + '\n```');
    try {
      const from = 1 + source.indexOf('literal');
      editor
        .chain()
        .setTextSelection({ from, to: from + 7 })
        .setHighlight({ color: HIGHLIGHT })
        .setColor('#c2413b')
        .run();
      editor.view.dispatch(editor.state.tr.insertText('// new\n', 1));
      const exported = documentMarkdown(editor.state.doc);
      editor.commands.setContent(markdownToHtml(exported));
      expect(editor.state.doc.firstChild?.textContent).toBe('// new\n' + source);
      const html = new DOMParser().parseFromString(editor.getHTML(), 'text/html');
      expect(html.querySelector('code mark')?.textContent).toBe('literal');
      expect(html.querySelector('code span[style]')?.textContent).toBe('literal');
      expect(html.querySelectorAll('code mark')).toHaveLength(1);
      expect(html.querySelector('code span[style]')?.getAttribute('style')).toContain('rgb(194, 65, 59)');
    } finally {
      dispose();
    }
  });

  it('keeps unknown and oversized code readable and treats fence metadata as metadata without line controls', () => {
    expect(codeTokens('func main() {}', 'go').length).toBeGreaterThan(0);
    expect(codeTokens('<script>alert(1)</script>', 'unsupported')).toEqual([]);
    expect(codeTokens('x'.repeat(50_001), 'go')).toEqual([]);
    expect(parseCodeInfo('go {2,4-6} title="方案"')).toEqual({ language: 'go', meta: '{2,4-6} title="方案"' });
    const source = Array.from({ length: 1001 }, (_, i) => `// ${i}`).join('\n');
    const { editor, element, dispose } = createEditor('```unknown\n' + source + '\n```');
    try {
      expect(element.querySelectorAll('button')).toHaveLength(0);
      expect(element.querySelector('code')?.textContent).toBe(source);
      expect(editor.state.doc.firstChild?.attrs.language).toBe('unknown');
    } finally {
      dispose();
    }
  });

  it('keeps only allowed code marks and language/metadata, strips scripts, positioning and line-configuration attributes', () => {
    const clean = cleanResumeHtml(
      '<pre class="overlay" data-resume-code-lines="2" data-unsafe="x"><code class="language-go fixed"><mark onclick="evil()" style="position:fixed;background-color:red">&lt;script&gt;</mark></code></pre>',
    );
    expect(clean).toContain('class="language-go"');
    expect(clean).toContain('<mark');
    expect(clean).toContain('&lt;script&gt;');
    expect(clean).not.toMatch(/fixed|overlay|data-unsafe|onclick|position|data-resume-code-lines|<script>/);
    expect(cleanResumeHtml('<pre><code class="language-evil&lt;">x</code></pre>')).not.toMatch(/class=/);
  });
});
