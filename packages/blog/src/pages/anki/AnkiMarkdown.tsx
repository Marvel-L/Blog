import { memo } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkTyporaMarks } from '@/utils/remarkTyporaMarks';
import { visit } from 'unist-util-visit';
import type { Root, Element, Text } from 'hast';
import '@/styles/resumeTypography.css';

/** 普通文本换行统一成 br；移除 Markdown 硬换行自动生成的分隔换行，避免 br + pre-wrap 双重换行。 */
function rehypeCardBreaks() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (!['p', 'li', 'strong', 'em', 'a', 'del', 'mark', 'ins'].includes(node.tagName)) return;
      // 松散列表项的 p/ul 等块之间的结构换行不是正文，不转换为额外 br。
      if (
        node.tagName === 'li' &&
        node.children.some((child) => child.type === 'element' && ['p', 'ul', 'ol'].includes(child.tagName))
      )
        return;
      const children: Element['children'] = [];
      for (const child of node.children) {
        if (child.type !== 'text' || !child.value.includes('\n')) {
          children.push(child);
          continue;
        }
        const previous = children.at(-1);
        const value =
          previous?.type === 'element' && previous.tagName === 'br' ? child.value.replace(/^\n/, '') : child.value;
        value.split('\n').forEach((line, index) => {
          if (index > 0) children.push({ type: 'element', tagName: 'br', properties: {}, children: [] });
          if (line) children.push({ type: 'text', value: line } satisfies Text);
        });
      }
      node.children = children;
    });
  };
}

const plugins = [remarkGfm, remarkTyporaMarks];
const rehypePlugins = [rehypeCardBreaks];

/** 不解析 HTML，不加载远程媒体；URL 再经白名单过滤，预览和正式展示走同一路径。 */
const safeUrl = (url: string): string => {
  const safe = defaultUrlTransform(url);
  return /^(?:https?:|mailto:)/i.test(safe) ? safe : '';
};
const components: Components = {
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // 媒体卡片不在当前功能范围；避免卡片预览向第三方发送请求。
  img: ({ alt }) => <span>{alt ? `[图片：${alt}]` : '[图片]'}</span>,
  table: ({ children }) => (
    <div className="anki-markdown-table">
      <table>{children}</table>
    </div>
  ),
};

export const AnkiMarkdown = memo(function AnkiMarkdown({
  content,
  className = '',
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={`anki-markdown ${className}`}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={plugins}
        rehypePlugins={rehypePlugins}
        urlTransform={safeUrl}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
