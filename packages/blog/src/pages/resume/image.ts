import { Node, mergeAttributes } from '@tiptap/core';
import { safeImageUrl } from './markdown';

export const ResumeImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ src: { default: null }, alt: { default: null }, title: { default: null } }),
  parseHTML: () => [
    { tag: 'img[src]', getAttrs: (node) => (safeImageUrl(node.getAttribute('src') ?? '') ? null : false) },
  ],
  renderHTML: ({ HTMLAttributes }) => ['img', mergeAttributes(HTMLAttributes, { referrerpolicy: 'no-referrer' })],
});
