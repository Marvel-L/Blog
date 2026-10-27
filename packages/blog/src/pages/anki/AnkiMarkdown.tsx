import { memo } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const plugins = [remarkGfm];

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
      <ReactMarkdown skipHtml remarkPlugins={plugins} urlTransform={safeUrl} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
