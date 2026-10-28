import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 仅把现有 Markdown 依赖内联到离线原型；不参与博客运行时或构建链路。
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '..');
const output = path.join(directory, '关于页雷达图-demo.html');
const entry = `
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
import DOMPurify from 'dompurify';
import { remarkTyporaMarks } from './packages/blog/src/utils/remark-typora-marks-core.mjs';
import { remarkCodeMeta } from './packages/blog/src/utils/remarkCodeMeta.ts';
import { remarkImageAttrs } from './packages/blog/src/utils/remarkImageAttrs.ts';
const processor = unified().use(remarkParse).use(remarkGfm).use(remarkTyporaMarks)
  .use(remarkCodeMeta).use(remarkImageAttrs).use(remarkRehype)
  .use(rehypeHighlight, {detect:false, ignoreMissing:true}).use(rehypeStringify);
window.RadarMarkdown = function(source) {
  if (!DOMPurify.isSupported) throw new Error('当前浏览器不支持安全预览');
  return DOMPurify.sanitize(String(processor.processSync(source)), {
    USE_PROFILES: {html:true}, FORBID_TAGS:['style','form','input','button'],
    FORBID_ATTR:['style'], ADD_ATTR:['data-meta']
  });
};
`;
const bundle = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: 'radar-markdown-entry.js' },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  write: false,
  legalComments: 'inline',
});
const template = await readFile(path.join(directory, 'demo-template.html'), 'utf8');
let html = template.replace('/* INLINE_MARKDOWN_BUNDLE */', () =>
  bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'),
);
// 字体从项目原资产内联，保持 Aa 排版与文章一致，不依赖网络。
const fontNames = ['SourceHanSansCN-Regular.woff2', 'SourceHanSerifCN-Bold.woff2', 'JetBrainsMono-Regular.woff2'];
const fontData = Object.fromEntries(
  await Promise.all(
    fontNames.map(async (name) => [
      name,
      (await readFile(path.join(root, 'packages/blog/src/assets/resume-fonts', name))).toString('base64'),
    ]),
  ),
);
const stylesheet = await readFile(path.join(root, 'packages/blog/src/styles/resumeTypography.css'), 'utf8');
html = html.replace(
  '/* INLINE_RESUME_STYLES */',
  stylesheet.replace(
    /url\('\.\.\/assets\/resume-fonts\/([^']+)'\)/g,
    (match, name) => `url('data:font/woff2;base64,${fontData[name]}')`,
  ),
);
await writeFile(output, html);
console.log('已生成自包含离线原型：' + output);
