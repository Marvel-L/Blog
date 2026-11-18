import CodeBlock from '@tiptap/extension-code-block';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type NodeView } from '@tiptap/pm/view';
import type { Fragment, Node as DocumentNode } from '@tiptap/pm/model';
import { CODE_META_ATTR, codeLanguage, codeMeta } from './code';
import { codeTokens, type CodeToken } from './code-highlight';

const tokenCache = new WeakMap<Fragment, Map<string, CodeToken[]>>();
function decorations(doc: DocumentNode): DecorationSet {
  const result: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return;
    const language = codeLanguage(node.attrs.language);
    const cached = tokenCache.get(node.content) ?? new Map<string, CodeToken[]>();
    const tokens = cached.get(language) ?? codeTokens(node.textContent, language);
    cached.set(language, tokens);
    tokenCache.set(node.content, cached);
    for (const token of tokens)
      result.push(Decoration.inline(pos + 1 + token.from, pos + 1 + token.to, { class: token.className }));
    return false;
  });
  return DecorationSet.create(doc, result);
}

export const ResumeCodeBlock = CodeBlock.extend({
  marks: 'highlight textStyle',
  addOptions() {
    return { ...this.parent!(), enableTabIndentation: true };
  },
  addAttributes() {
    return {
      ...this.parent!(),
      codeMeta: {
        default: '',
        parseHTML: (element) => codeMeta(element.getAttribute(CODE_META_ATTR)),
        renderHTML: (attributes) => (attributes.codeMeta ? { [CODE_META_ATTR]: codeMeta(attributes.codeMeta) } : {}),
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey('resumeCodeSyntax'),
        state: {
          init: (_, state) => decorations(state.doc),
          apply: (tr, previous) => (tr.docChanged ? decorations(tr.doc) : previous),
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
  addNodeView() {
    return ({ node: initial }): NodeView => {
      let node = initial;
      const dom = document.createElement('div');
      dom.className = 'resume-code-block';
      const header = document.createElement('div');
      header.className = 'resume-code-header';
      header.contentEditable = 'false';
      const label = document.createElement('span');
      header.append(label);
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      pre.append(code);
      dom.append(header, pre);
      const render = () => {
        label.textContent = codeLanguage(node.attrs.language) || '代码';
        code.className = `hljs${node.attrs.language ? ` language-${codeLanguage(node.attrs.language)}` : ''}`;
      };
      render();
      return {
        dom,
        contentDOM: code,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          render();
          return true;
        },
        ignoreMutation: (mutation) =>
          mutation.type !== 'selection' &&
          ((mutation.type === 'attributes' && mutation.target === code) || !code.contains(mutation.target)),
      };
    };
  },
});
