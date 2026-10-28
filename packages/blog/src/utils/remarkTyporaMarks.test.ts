import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { remarkTyporaMarks } from './remarkTyporaMarks';

const toHtml = (markdown: string) =>
  unified()
    .use(remarkParse)
    .use(remarkTyporaMarks)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(markdown)
    .toString();

describe('remarkTyporaMarks', () => {
  it('三等号、嵌套、转义和 Setext 标题保留语义', () => {
    expect(toHtml('===**粗体**与*斜体*===')).toContain('<mark><strong>粗体</strong>与<em>斜体</em></mark>');
    expect(toHtml('==双== 与 ===三===')).toContain('<mark>三</mark>');
    expect(toHtml('a === b')).not.toContain('<mark>');
    expect(toHtml('`===代码===`')).toContain('<code>===代码===</code>');
    expect(toHtml('```js\nconst a = b === c;\n===原样===\n```')).not.toContain('<mark>');
    expect(toHtml('标题\n===')).toContain('<h1>标题</h1>');
    expect(toHtml('\\===转义\\===')).not.toContain('<mark>');
    expect(toHtml('===不成对==')).not.toContain('<mark>');
  });
  it('把 ++text++ 渲染为下划线 ins', () => {
    expect(toHtml('开始 ++未来规划++ 了')).toContain('<ins>未来规划</ins>');
  });

  it('把 ==text== 渲染为高亮 mark', () => {
    expect(toHtml('这是 ==重点== 内容')).toContain('<mark>重点</mark>');
  });

  it('允许与粗体内嵌套', () => {
    const html = toHtml('++**加粗下划线**++');
    expect(html).toContain('<ins><strong>加粗下划线</strong></ins>');
  });

  it('允许下划线与高亮互相嵌套', () => {
    expect(toHtml('++==双重==++')).toContain('<ins><mark>双重</mark></ins>');
    expect(toHtml('==++双重++==')).toContain('<mark><ins>双重</ins></mark>');
  });

  it('未成对的 C++ / 比较运算符保持原样', () => {
    const html = toHtml('熟悉 C++ 与 a == b 比较');
    expect(html).not.toContain('<ins>');
    expect(html).not.toContain('<mark>');
    expect(html).toContain('C++');
    expect(html).toContain('a == b');
  });

  it('空内容 ++++ / ==== 不生成空标签', () => {
    const html = toHtml('空 ++++ 与 ==== 标记');
    expect(html).not.toContain('<ins>');
    expect(html).not.toContain('<mark>');
  });

  it('行内代码与围栏代码块内的标记不渲染', () => {
    expect(toHtml('使用 `++raw++` 与 `==raw==`')).toContain('<code>++raw++</code>');
    expect(toHtml('使用 `++raw++` 与 `==raw==`')).toContain('<code>==raw==</code>');
    expect(toHtml('```\n++code++\n==code==\n```')).not.toContain('<ins>');
    expect(toHtml('```\n++code++\n==code==\n```')).not.toContain('<mark>');
  });

  it('两侧有空格的 ++ text ++ 不成对（避免误伤）', () => {
    const html = toHtml('这是 ++ 未贴紧 ++ 的写法');
    expect(html).not.toContain('<ins>');
  });
});
