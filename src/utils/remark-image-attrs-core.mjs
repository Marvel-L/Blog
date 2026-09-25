/**
 * remark 插件：解析图片后连续的属性块（构建脚本与客户端共用）。
 *
 * 例：`![alt](a.jpg){.small}{.inline}`、`![alt](a.jpg){.medium}{.no-dark}`
 * 多个修饰写成多个 `{}`，依次紧挨（中间可有空白）。
 *
 * 同段多张 {.inline} 图会把 paragraph 提升为
 * `<div data-role="markdown-image-row">`，保证一行横排。
 */
import { visit } from 'unist-util-visit';
import { parseImageAttrBody, paragraphIsInlineImageRow } from './markdown-image-display-core.mjs';

const ATTR_BLOCK_RE = /^(\s*)\{([^{}]*)\}/;

const applyClassesToImage = (image, classNames) => {
  if (classNames.length === 0) return;

  image.data = image.data || {};
  const hProperties = (image.data.hProperties = image.data.hProperties || {});
  const existing = hProperties.className;
  const merged = new Set();

  if (typeof existing === 'string') {
    existing
      .split(/\s+/)
      .filter(Boolean)
      .forEach((name) => merged.add(name));
  } else if (Array.isArray(existing)) {
    existing.filter((name) => typeof name === 'string' && name.length > 0).forEach((name) => merged.add(name));
  }

  classNames.forEach((name) => merged.add(name));
  hProperties.className = Array.from(merged);
};

/** 从紧跟图片的文本里连续吃掉 `{...}{...}`，返回合并 class 与剩余文本。 */
export const consumeImageAttrBlocks = (text) => {
  let remaining = text;
  const classNames = [];

  while (true) {
    const match = ATTR_BLOCK_RE.exec(remaining);
    if (!match) break;

    const parsed = parseImageAttrBody(match[2]);
    classNames.push(...parsed.classNames);
    remaining = remaining.slice(match[0].length);
  }

  return { classNames, remaining };
};

const promoteInlineImageParagraphs = (tree) => {
  visit(tree, 'paragraph', (node) => {
    if (!paragraphIsInlineImageRow(node.children)) return;

    node.data = node.data || {};
    node.data.hName = 'div';
    node.data.hProperties = {
      ...(node.data.hProperties || {}),
      'data-role': 'markdown-image-row',
      className: ['markdown-image-row'],
    };
  });
};

export const remarkImageAttrs = () => (tree) => {
  visit(tree, (node) => {
    if (!Array.isArray(node.children)) return;

    const { children } = node;
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child.type !== 'image') continue;

      const next = children[index + 1];
      if (!next || next.type !== 'text') continue;

      const { classNames, remaining } = consumeImageAttrBlocks(next.value);
      if (classNames.length === 0 && remaining === next.value) continue;

      applyClassesToImage(child, classNames);
      next.value = remaining;
      if (next.value.length === 0) {
        children.splice(index + 1, 1);
      }
    }
  });

  promoteInlineImageParagraphs(tree);
};
