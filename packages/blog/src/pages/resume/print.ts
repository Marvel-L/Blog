import type { DraftDocument } from './model';
import { markdownToHtml, cleanResumeHtml } from './markdown';
import githubHighlight from 'highlight.js/styles/github.css?raw';
import { codeTokens } from './code-highlight';

/** Decorate existing text nodes so selected marks and code text survive printing. */
function decoratePrintCode(body: HTMLElement) {
  for (const pre of body.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    if (!code) continue;
    const source = code.textContent ?? '';
    const language = [...code.classList].find((name) => name.startsWith('language-'))?.slice(9) ?? '';
    const tokens = codeTokens(source, language);
    const walker = body.ownerDocument.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
    let offset = 0;
    let tokenIndex = 0;
    for (const node of textNodes) {
      const text = node.textContent ?? '';
      const fragment = body.ownerDocument.createDocumentFragment();
      const end = offset + text.length;
      let cursor = offset;
      while (tokenIndex < tokens.length && tokens[tokenIndex].to <= offset) tokenIndex++;
      for (let i = tokenIndex; i < tokens.length && tokens[i].from < end; i++) {
        const token = tokens[i];
        const start = Math.max(cursor, token.from);
        if (start > cursor) fragment.append(source.slice(cursor, start));
        const span = body.ownerDocument.createElement('span');
        span.className = token.className;
        span.textContent = source.slice(start, Math.min(end, token.to));
        fragment.append(span);
        cursor = Math.min(end, token.to);
      }
      if (cursor < end) fragment.append(source.slice(cursor, end));
      node.replaceWith(fragment);
      offset = end;
    }
    code.classList.add('hljs');
  }
}

/** Print an isolated current snapshot, without app navigation, comments or other drafts. */
export function printDocument(doc: DraftDocument, onError: (message: string) => void): () => void {
  const frame = document.createElement('iframe');
  frame.title = '定稿打印预览';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:1000px;border:0';
  document.body.append(frame);
  let live = true;
  let timer: ReturnType<typeof setTimeout>;
  const dispose = () => {
    live = false;
    clearTimeout(timer);
    frame.remove();
  };
  const target = frame.contentDocument;
  const win = frame.contentWindow;
  if (!target || !win) {
    dispose();
    throw new Error('打印窗口不可用');
  }
  try {
    target.title = doc.title;
    for (const sheet of document.querySelectorAll('link[rel="stylesheet"], style'))
      target.head.append(sheet.cloneNode(true));
    const styled = Boolean(document.querySelector('.site-shell[data-typography="resume"]'));
    const css = target.createElement('style');
    css.textContent = `${githubHighlight}
      @page { size: A4; margin: 16mm; }
      html, body { margin: 0 !important; background: white !important; color: #293936 !important; }
      .resume-document { min-height: 0; font-family: ${styled ? "'Resume Sans'," : ''} 'PingFang SC', sans-serif;
        font-size: 11pt; line-height: 1.8; overflow-wrap: anywhere; }
      .resume-document :is(h1,h2,h3,h4,h5,h6) { ${styled ? "font-family:'Resume Serif',serif;" : ''}
        break-after: avoid; font-weight:700; line-height:1.5; margin:1.3em 0 .5em; }
      .resume-document h1 { font-size:24pt; margin-top:0; }
      .resume-document h2 { font-size:16pt; color:${styled ? '#4870ad' : '#49654f'};
        border-bottom:1px solid #a2b6d4; padding-bottom:.25em; }
      .resume-document h3 { font-size:13pt; }
      .resume-document p { margin:0 0 .8em; }
      .resume-document a { color:#4870ad; text-decoration:underline; }
      .resume-document :is(ul,ol) { padding-left:1.5em; margin:.6em 0 1em; }
      .resume-document ul { list-style:disc; } .resume-document ol { list-style:decimal; }
      .resume-document li { margin:.2em 0; }
      .resume-document :is(code,pre) { font-family:${styled ? "'Resume Mono'," : ''} monospace; white-space:pre-wrap; }
      .resume-document img { display:block; max-width:100%; height:auto; margin:1em auto; break-inside:avoid; }
      .resume-document table { border-collapse:collapse; width:100%; }
      .resume-document :is(th,td) { border:1px solid #dde3dc; padding:6px; }
      .resume-document blockquote { padding-left:1em; border-left:2px solid #dde3dc; }
      .resume-document mark { background:#fef08a; color:#293936; print-color-adjust:exact; }
      .resume-document pre { padding:12px; background:white; break-inside:auto; }
      .resume-document pre code.hljs { display:block; padding:0; background:transparent; overflow:visible;
        font-size:.9em; line-height:1.8; }
      .resume-document pre, .resume-document pre * { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
    `;
    target.head.append(css);
    const body = target.createElement('article');
    body.className = 'resume-document';
    body.innerHTML = cleanResumeHtml(markdownToHtml(doc.content.markdown), false);
    decoratePrintCode(body);
    target.body.append(body);
    win.addEventListener('afterprint', dispose, { once: true });
    timer = setTimeout(() => {
      if (!live) return;
      dispose();
      onError('字体或图片加载超时，请检查图片链接后重试打印。');
    }, 15000);
    const images = Array.from(body.querySelectorAll('img')).map((image) =>
      image.complete
        ? Promise.resolve(image.naturalWidth > 0)
        : new Promise<boolean>((resolve) => {
            image.addEventListener('load', () => resolve(true), { once: true });
            image.addEventListener('error', () => resolve(false), { once: true });
          }),
    );
    const fonts =
      styled && target.fonts
        ? Promise.all([
            target.fonts.load('11pt "Resume Sans"'),
            target.fonts.load('700 16pt "Resume Serif"'),
            target.fonts.load('11pt "Resume Mono"'),
          ])
        : (target.fonts?.ready ?? Promise.resolve());
    void Promise.all([fonts, ...images])
      .then((results) => {
        if (!live) return;
        clearTimeout(timer);
        if (results.slice(1).some((result) => result === false)) {
          dispose();
          onError('部分图片无法加载，请检查图片链接后重试打印。');
          return;
        }
        try {
          win.focus();
          win.print();
        } catch {
          dispose();
          onError('打印预览打开失败，请重试。');
        }
      })
      .catch(() => {
        if (live) {
          dispose();
          onError('打印内容加载失败，请重试。');
        }
      });
    return dispose;
  } catch (cause) {
    dispose();
    throw cause;
  }
}
