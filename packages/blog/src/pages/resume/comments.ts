import { Mark } from '@tiptap/core';
import { DOMSerializer, type Node as DocumentNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { COMMENT_ATTR, commentIds } from './model';
import { htmlToMarkdown } from './markdown';

export const ResumeCommentMark = Mark.create({
  name: 'resumeComment',
  inclusive: false,
  addAttributes() {
    return {
      ids: {
        default: [],
        parseHTML: (element) => commentIds(element.getAttribute(COMMENT_ATTR)),
        renderHTML: (attributes) => ({ [COMMENT_ATTR]: attributes.ids.join(' ') }),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: `span[${COMMENT_ATTR}]`,
        getAttrs: (element) => (commentIds(element.getAttribute(COMMENT_ATTR)).length ? null : false),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
});

export function commentRanges(doc: DocumentNode): Map<string, { from: number; to: number }[]> {
  const ranges = new Map<string, { from: number; to: number }[]>();
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const ids: string[] = node.marks.find((mark) => mark.type.name === 'resumeComment')?.attrs.ids ?? [];
    for (const id of ids) {
      const entries = ranges.get(id) ?? [];
      entries.push({ from: pos, to: pos + node.nodeSize });
      ranges.set(id, entries);
    }
  });
  return ranges;
}

/** Merge marks per text segment so overlapping comments retain both anchors. */
export function addCommentAnchor(state: EditorState, range: { from: number; to: number }, id: string): Transaction {
  const type = state.schema.marks.resumeComment;
  const tr = state.tr;
  let supported = true;
  state.doc.nodesBetween(range.from, range.to, (node, pos, parent) => {
    if (!node.isText) return;
    if (
      !parent?.type.allowsMarkType(type) ||
      node.marks.some((mark) => mark.type !== type && mark.type.excludes(type))
    ) {
      supported = false;
      return;
    }
    const previous = node.marks.find((mark) => mark.type === type);
    const ids = [...new Set([...(previous?.attrs.ids ?? []), id])];
    tr.addMark(Math.max(pos, range.from), Math.min(pos + node.nodeSize, range.to), type.create({ ids }));
  });
  if (!supported || !tr.docChanged) throw new Error('请选择普通正文添加评论，代码块暂不支持批注。');
  return tr;
}

export function removeCommentAnchor(state: EditorState, id: string): Transaction {
  const type = state.schema.marks.resumeComment;
  const tr = state.tr;
  state.doc.descendants((node, pos) => {
    const mark = node.marks.find((value) => value.type === type);
    if (!node.isText || !mark?.attrs.ids.includes(id)) return;
    const ids = mark.attrs.ids.filter((value: string) => value !== id);
    tr.removeMark(pos, pos + node.nodeSize, type);
    if (ids.length) tr.addMark(pos, pos + node.nodeSize, type.create({ ids }));
  });
  return tr;
}

export function documentMarkdown(doc: DocumentNode): string {
  const container = document.createElement('div');
  container.append(DOMSerializer.fromSchema(doc.type.schema).serializeFragment(doc.content));
  return htmlToMarkdown(container.innerHTML);
}
