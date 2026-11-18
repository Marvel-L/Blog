import DOMPurify from 'dompurify';
import { marked, Renderer } from 'marked';
import TurndownService from 'turndown';
import { COMMENT_ATTR, commentIds } from './model';
import { CODE_META_ATTR, codeLanguage, codeMeta, parseCodeInfo } from './code';

export const RED = '#c2413b';
export const GREEN = '#18794e';
export const HIGHLIGHT = '#fef08a';
export function safeDocumentLink(href: string): boolean {
  return /^(https?:\/\/|mailto:|tel:|#)/i.test(href) || /^\/(?![\\/])/.test(href);
}
export function safeImageUrl(src: string): boolean {
  if (!/^https?:\/\//i.test(src)) return false;
  try {
    const url = new URL(src);
    return !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Shared by import, paste, preview and editor. Only document markup survives. */
export function cleanResumeHtml(html: string, keepComments = true): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'del',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'pre',
      'code',
      'hr',
      'span',
      'mark',
      'div',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'img',
    ],
    ALLOWED_ATTR: [
      'href',
      'src',
      'alt',
      'title',
      'style',
      'start',
      'colspan',
      'rowspan',
      COMMENT_ATTR,
      'class',
      CODE_META_ATTR,
    ],
    ALLOW_DATA_ATTR: false,
  });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  for (const node of doc.body.querySelectorAll('[class]')) {
    const language =
      node.tagName === 'CODE' && node.parentElement?.tagName === 'PRE'
        ? [...node.classList].find((name) => name.startsWith('language-'))
        : '';
    node.removeAttribute('class');
    if (language && codeLanguage(language.slice(9))) node.className = language;
  }
  for (const attr of [CODE_META_ATTR]) {
    for (const node of doc.body.querySelectorAll(`[${attr}]`)) {
      const value = node.tagName === 'PRE' ? codeMeta(node.getAttribute(attr)) : '';
      if (value) node.setAttribute(attr, value);
      else node.removeAttribute(attr);
    }
  }
  for (const node of doc.body.querySelectorAll(`[${COMMENT_ATTR}]`)) {
    const ids = keepComments && node.tagName === 'SPAN' ? commentIds(node.getAttribute(COMMENT_ATTR)) : [];
    if (ids.length) node.setAttribute(COMMENT_ATTR, ids.join(' '));
    else node.removeAttribute(COMMENT_ATTR);
  }
  for (const node of doc.body.querySelectorAll<HTMLElement>('[style]')) {
    const color = node.style.color;
    const background = node.style.backgroundColor;
    node.removeAttribute('style');
    if (['rgb(194, 65, 59)', 'red', '#c2413b', 'rgb(255, 0, 0)'].includes(color)) node.style.color = RED;
    if (['rgb(24, 121, 78)', 'green', '#18794e', 'rgb(0, 128, 0)'].includes(color)) node.style.color = GREEN;
    if (background && node.tagName === 'MARK') node.style.backgroundColor = HIGHLIGHT;
  }
  for (const link of doc.body.querySelectorAll('a')) {
    const href = link.getAttribute('href') ?? '';
    if (!safeDocumentLink(href)) link.removeAttribute('href');
    link.setAttribute('rel', 'noopener noreferrer');
  }
  for (const image of doc.body.querySelectorAll('img')) {
    if (!safeImageUrl(image.getAttribute('src') ?? '')) image.remove();
    else image.setAttribute('referrerpolicy', 'no-referrer');
  }
  // Old resume templates use private-use font glyphs without a portable font.
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode())
    if (!walker.currentNode.parentElement?.closest('pre, code'))
      walker.currentNode.textContent = walker.currentNode.textContent?.replace(/[\uE000-\uF8FF]/gu, '') ?? '';
  return doc.body.innerHTML;
}

export function markdownToHtml(markdown: string): string {
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const renderer = new Renderer();
  renderer.code = ({ text, lang }) => {
    const { language, meta } = parseCodeInfo(lang ?? '');
    return `<pre${meta ? ` ${CODE_META_ATTR}="${escape(meta)}"` : ''}><code${language ? ` class="language-${language}"` : ''}>${escape(text)}</code></pre>\n`;
  };
  return cleanResumeHtml(marked.parse(markdown, { async: false, gfm: true, breaks: false, renderer }));
}

function codeToMarkdown(pre: HTMLElement): string {
  const code = pre.querySelector('code');
  // A fence has no inline-mark syntax. Safe HTML preserves selected code marks
  // while its escaped text retains literal <, &, whitespace and newlines.
  if (code?.querySelector('mark, span[style]')) return `\n\n${pre.outerHTML}\n\n`;
  const text = code?.textContent ?? pre.textContent ?? '';
  const language = codeLanguage([...(code?.classList ?? [])].find((name) => name.startsWith('language-'))?.slice(9));
  const meta = codeMeta(pre.getAttribute(CODE_META_ATTR));
  let fenceLength = 3;
  for (const match of text.matchAll(/`+/g)) fenceLength = Math.max(fenceLength, match[0].length + 1);
  const fence = '`'.repeat(fenceLength);
  return `\n\n${fence}${language}${meta ? ` ${meta}` : ''}\n${text}\n${fence}\n\n`;
}

export function htmlToMarkdown(html: string): string {
  const converter = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    blankReplacement: (_content, node) =>
      node.nodeName === 'PRE'
        ? codeToMarkdown(node)
        : (node as HTMLElement & { isBlock: boolean }).isBlock
          ? '\n\n'
          : '',
  });
  converter.addRule('resumeCode', {
    filter: 'pre',
    replacement: (_content, node) => {
      return codeToMarkdown(node as HTMLElement);
    },
  });
  // Editor table cells contain paragraphs and may span rows/columns. HTML keeps
  // that structure intact; pipe-table serializers discard it on a round trip.
  converter.addRule('resumeTable', {
    filter: 'table',
    replacement: (_content, node) => `\n\n${(node as HTMLElement).outerHTML}\n\n`,
  });
  converter.addRule('resumeStrike', {
    filter: ['del', 's'],
    replacement: (content) => `~~${content}~~`,
  });
  converter.addRule('resumeMarks', {
    filter: (node) => ['SPAN', 'MARK', 'U'].includes(node.nodeName),
    replacement: (content, node) => {
      const element = node as HTMLElement;
      const color = element.style.color;
      // Inline HTML is intentional: CommonMark has no text-color syntax.
      let result = content;
      if (color) result = `<span style="color: ${color}">${result}</span>`;
      if (node.nodeName === 'MARK') result = `<mark>${result}</mark>`;
      if (node.nodeName === 'U') result = `<u>${result}</u>`;
      const ids = element.getAttribute(COMMENT_ATTR);
      if (ids) result = `<span ${COMMENT_ATTR}="${ids}">${result}</span>`;
      return result;
    },
  });
  return converter.turndown(cleanResumeHtml(html));
}

export function importNotice(markdown: string): string {
  return /<img\b|!\[.*?\]\(/i.test(markdown)
    ? '正文已导入，支持 HTTP / HTTPS 图片链接；本地路径图片请替换为可访问链接。'
    : 'Markdown 已导入，可直接在文档中继续编辑。';
}
