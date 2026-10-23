import React, { useEffect, useRef, useState } from 'react';
import type { ExtraProps } from 'react-markdown';
import { Check, ChevronDown, ChevronUp, Copy, Download, FileCode, WrapText } from 'lucide-react';
import { extractTextFromReactNode } from '@/utils/headings';
import { copyTextToClipboard } from '@/utils/clipboard';
import { downloadBlob } from '@/utils/download';

const MAX_CODE_LINES = 30;

const extractLangFromChildren = (children: React.ReactNode): string | undefined => {
  const codeChild = React.Children.toArray(children).find(
    (child) => React.isValidElement(child) && typeof (child.props as Record<string, unknown>).className === 'string',
  ) as React.ReactElement | undefined;
  if (!codeChild) return undefined;
  const cls = (codeChild.props as Record<string, string>).className || '';
  const match = cls.match(/language-([\w-]+)/);
  return match ? match[1] : undefined;
};

const getLangDisplayName = (lang: string): string => {
  const langMap: Record<string, string> = {
    js: 'JavaScript',
    jsx: 'JSX',
    ts: 'TypeScript',
    tsx: 'TSX',
    py: 'Python',
    rb: 'Ruby',
    go: 'Go',
    rs: 'Rust',
    java: 'Java',
    kt: 'Kotlin',
    swift: 'Swift',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    json: 'JSON',
    yaml: 'YAML',
    yml: 'YAML',
    xml: 'XML',
    md: 'Markdown',
    sql: 'SQL',
    sh: 'Shell',
    bash: 'Bash',
    zsh: 'Zsh',
    dockerfile: 'Dockerfile',
    docker: 'Docker',
    graphql: 'GraphQL',
    gql: 'GraphQL',
    c: 'C',
    cpp: 'C++',
    cs: 'C#',
  };
  return langMap[lang] || lang;
};

const CODE_FILE_EXTENSIONS: Record<string, string> = {
  bash: 'sh',
  c: 'c',
  cpp: 'cpp',
  cs: 'cs',
  css: 'css',
  docker: 'dockerfile',
  dockerfile: 'dockerfile',
  go: 'go',
  gql: 'graphql',
  graphql: 'graphql',
  html: 'html',
  java: 'java',
  js: 'js',
  json: 'json',
  jsx: 'jsx',
  kt: 'kt',
  md: 'md',
  py: 'py',
  rb: 'rb',
  rs: 'rs',
  scss: 'scss',
  sh: 'sh',
  sql: 'sql',
  swift: 'swift',
  ts: 'ts',
  tsx: 'tsx',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'sh',
};

const getCodeFileExtension = (lang?: string) => {
  if (!lang) return 'txt';
  return CODE_FILE_EXTENSIONS[lang.toLowerCase()] || 'txt';
};

const getCodeText = (children: React.ReactNode) =>
  extractTextFromReactNode(children).replace(/\r\n?/g, '\n').replace(/\n$/, '');

/** Read title="app.ts" from the fence metadata passed through remarkCodeMeta. */
const extractCodeMeta = (children: React.ReactNode): { filename?: string } => {
  const codeChild = React.Children.toArray(children).find((child) => React.isValidElement(child)) as
    React.ReactElement | undefined;
  const meta = codeChild ? (codeChild.props as Record<string, unknown>)['data-meta'] : undefined;
  if (typeof meta !== 'string' || !meta.trim()) return {};
  const filenameMatch = meta.match(/title\s*=\s*["']([^"']+)["']/);
  return filenameMatch && filenameMatch[1].trim() ? { filename: filenameMatch[1].trim() } : {};
};

export const CodeBlock = ({
  children,
  node: _node,
  ...props
}: React.DetailedHTMLProps<React.HTMLAttributes<HTMLPreElement>, HTMLPreElement> & { node?: unknown }) => {
  const [copied, setCopied] = useState(false);
  const [copiedLine, setCopiedLine] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isWrapped, setIsWrapped] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const lang = extractLangFromChildren(children);
  const { filename } = extractCodeMeta(children);
  const code = getCodeText(children);
  const lineCount = Math.max(1, code ? code.split('\n').length : 1);
  // Keep the first client and SSR render collapsed for large snippets.
  const [needsExpand, setNeedsExpand] = useState(() => lineCount > MAX_CODE_LINES);
  const visibleLineCount = needsExpand && !isExpanded ? Math.min(lineCount, MAX_CODE_LINES) : lineCount;
  const visibleLineNumbers = Array.from({ length: visibleLineCount }, (_, index) => index + 1);

  // Untagged fences and indented code also need block styling.
  const childrenWithBlockMark = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, { 'data-block-code': 'true' });
    }
    return child;
  });

  useEffect(() => {
    setNeedsExpand(lineCount > MAX_CODE_LINES);
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, [lineCount]);

  const clearCopyFeedback = () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      setCopiedLine(null);
    }, 2200);
  };

  const handleCopy = async () => {
    try {
      if (await copyTextToClipboard(code)) {
        setCopied(true);
        setCopiedLine(null);
        clearCopyFeedback();
      }
    } catch {
      // A failed copy must not interrupt reading.
    }
  };

  const handleCopyLine = async (line: number) => {
    const lineText = code.split('\n')[line - 1];
    if (lineText === undefined) return;
    try {
      if (await copyTextToClipboard(lineText)) {
        setCopied(false);
        setCopiedLine(line);
        clearCopyFeedback();
      }
    } catch {
      // Same fallback behavior as copying the entire snippet.
    }
  };

  const handleDownload = () => {
    const baseName = filename || 'code-snippet';
    const extension = getCodeFileExtension(lang);
    const downloadName = baseName.toLowerCase().endsWith(`.${extension}`) ? baseName : `${baseName}.${extension}`;
    downloadBlob(new Blob([code], { type: 'text/plain;charset=utf-8' }), downloadName);
  };

  return (
    <div
      className="code-block group relative my-5 md:my-7"
      data-lang={lang ? lang.toLowerCase() : undefined}
      data-wrapped={isWrapped ? 'true' : undefined}
    >
      <div className="code-toolbar">
        <div className="code-toolbar-info">
          {filename && (
            <span className="code-filename" title={filename}>
              <FileCode size={13} aria-hidden="true" />
              <span className="truncate">{filename}</span>
            </span>
          )}
          <span className="code-language" aria-label={`代码语言：${lang ? getLangDisplayName(lang) : '纯文本'}`}>
            {lang ? getLangDisplayName(lang) : '纯文本'}
          </span>
        </div>
        <div className="code-toolbar-actions">
          {copiedLine !== null ? (
            <span className="code-copy-feedback" role="status" aria-live="polite">
              已复制第 {copiedLine} 行
            </span>
          ) : copied ? (
            <span className="code-copy-feedback" role="status" aria-live="polite">
              代码已复制
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setIsWrapped((wrapped) => !wrapped)}
            className={`code-action-btn ${isWrapped ? 'code-action-btn-active' : ''}`}
            title={isWrapped ? '关闭自动换行' : '开启自动换行'}
            aria-label={isWrapped ? '关闭自动换行' : '开启自动换行'}
            aria-pressed={isWrapped}
          >
            <WrapText size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className={`code-action-btn ${copied || copiedLine !== null ? 'code-action-btn-success' : ''}`}
            title={copied || copiedLine !== null ? '已复制' : '复制代码'}
            aria-label={copied || copiedLine !== null ? '已复制' : '复制代码'}
          >
            {copied || copiedLine !== null ? (
              <span className="copy-pop">
                <Check size={15} aria-hidden="true" />
              </span>
            ) : (
              <Copy size={15} aria-hidden="true" />
            )}
            <span>{copied || copiedLine !== null ? '已复制' : '复制'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="code-action-btn"
            title="下载代码"
            aria-label="下载代码"
          >
            <Download size={15} aria-hidden="true" />
            <span>下载</span>
          </button>
        </div>
      </div>

      <div className={`code-scroll ${needsExpand && !isExpanded ? 'code-block-collapsed' : 'code-block-expanded'}`}>
        <div className="code-content">
          <div className="code-line-numbers" aria-hidden="true">
            {visibleLineNumbers.map((number) => (
              <span
                key={number}
                data-line={number}
                title={`复制第 ${number} 行`}
                onClick={() => {
                  void handleCopyLine(number);
                }}
              >
                {number}
              </span>
            ))}
          </div>
          <pre
            {...props}
            className={`${props.className || ''} !my-0 !min-w-max !bg-transparent !p-3.5 !leading-6 md:!p-5`}
          >
            {childrenWithBlockMark}
          </pre>
        </div>
        {needsExpand && !isExpanded && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="code-expand-btn"
            aria-label="展开完整代码"
            aria-expanded="false"
          >
            <ChevronDown size={15} aria-hidden="true" />
            展开完整代码（共 {lineCount} 行）
          </button>
        )}
        {needsExpand && isExpanded && (
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="code-collapse-btn"
            aria-label="折叠代码"
            aria-expanded="true"
          >
            <ChevronUp size={15} aria-hidden="true" />
            折叠代码
          </button>
        )}
      </div>
    </div>
  );
};

export const MarkdownCode = ({
  className,
  children,
  node: _node,
  ...props
}: React.HTMLAttributes<HTMLElement> & ExtraProps) => {
  const isBlockCode =
    (props as Record<string, unknown>)['data-block-code'] === 'true' || /language-([\w-]+)/.test(className || '');
  return (
    <code
      className={isBlockCode ? className : 'font-mono font-medium before:content-none after:content-none'}
      {...props}
    >
      {children}
    </code>
  );
};
