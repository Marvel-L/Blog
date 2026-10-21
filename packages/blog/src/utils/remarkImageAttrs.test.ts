import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import {
  imageFigureLayoutClass,
  isInlineMarkdownImageChild,
  parseImageAttrBody,
  resolveImageDisplayOptions,
} from './markdownImageDisplay';
import { remarkImageAttrs } from './remarkImageAttrs';
import { consumeImageAttrBlocks } from './remark-image-attrs-core.mjs';

const toHtml = (markdown: string) =>
  unified()
    .use(remarkParse)
    .use(remarkImageAttrs)
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(markdown)
    .toString();

describe('parseImageAttrBody', () => {
  it('解析单个块内的 class 与 no-dark', () => {
    expect(parseImageAttrBody('.small')).toEqual({ classNames: ['small'] });
    expect(parseImageAttrBody('no-dark')).toEqual({ classNames: ['no-dark'] });
  });

  it('忽略 #id 与 key=value', () => {
    expect(parseImageAttrBody('.small #hero width=320')).toEqual({
      classNames: ['small'],
    });
  });
});

describe('consumeImageAttrBlocks', () => {
  it('连续多个 {} 合并 class', () => {
    expect(consumeImageAttrBlocks('{.small}{.inline} 其余')).toEqual({
      classNames: ['small', 'inline'],
      remaining: ' 其余',
    });
  });

  it('允许块之间空白', () => {
    expect(consumeImageAttrBlocks('{.small} {.inline}')).toEqual({
      classNames: ['small', 'inline'],
      remaining: '',
    });
  });
});

describe('isInlineMarkdownImageChild', () => {
  it('认 img className 含 inline（p 检测时机）', () => {
    expect(isInlineMarkdownImageChild({ className: 'inline' })).toBe(true);
    expect(isInlineMarkdownImageChild({ className: ['small', 'inline'] })).toBe(true);
    expect(isInlineMarkdownImageChild({ className: 'small' })).toBe(false);
  });

  it('认 figure 的 data-inline', () => {
    expect(isInlineMarkdownImageChild({ 'data-role': 'markdown-figure', 'data-inline': true })).toBe(true);
  });
});

describe('resolveImageDisplayOptions', () => {
  it('默认通栏', () => {
    expect(resolveImageDisplayOptions(undefined, undefined)).toEqual({
      size: 'default',
      inline: false,
      noDark: false,
      passthroughClasses: [],
    });
  });

  it('识别尺寸、并排与特效预留 class', () => {
    expect(resolveImageDisplayOptions('small inline fx-spark', null)).toEqual({
      size: 'small',
      inline: true,
      noDark: false,
      passthroughClasses: ['fx-spark'],
    });
  });

  it('className 为数组时仍能识别（hast / react-markdown）', () => {
    expect(resolveImageDisplayOptions(['small', 'inline'], null)).toEqual({
      size: 'small',
      inline: true,
      noDark: false,
      passthroughClasses: [],
    });
  });

  it('仅 inline 时默认按 small', () => {
    expect(resolveImageDisplayOptions('inline', null)).toEqual({
      size: 'small',
      inline: true,
      noDark: false,
      passthroughClasses: [],
    });
  });

  it('inline + medium 可覆盖默认 small', () => {
    expect(resolveImageDisplayOptions(['inline', 'medium'], null)).toMatchObject({
      size: 'medium',
      inline: true,
    });
  });

  it('title no-dark 与 class no-dark 均可', () => {
    expect(resolveImageDisplayOptions(undefined, 'no-dark').noDark).toBe(true);
    expect(resolveImageDisplayOptions('no-dark', null).noDark).toBe(true);
  });
});

describe('imageFigureLayoutClass', () => {
  it('inline 与通栏使用不同语义 class（宽度由 CSS data-* 控制）', () => {
    expect(imageFigureLayoutClass({ size: 'default', inline: false, noDark: false, passthroughClasses: [] })).toBe(
      'md-img-figure',
    );
    expect(imageFigureLayoutClass({ size: 'small', inline: true, noDark: false, passthroughClasses: [] })).toContain(
      'md-img-figure--inline',
    );
  });
});

describe('remarkImageAttrs', () => {
  it('把 {.small} 写到 img class 并移除花括号文本', () => {
    const html = toHtml('![早饭](a.jpg){.small}');
    expect(html).toContain('class="small"');
    expect(html).toContain('alt="早饭"');
    expect(html).not.toContain('{.small}');
  });

  it('支持多个 {} 与同行多图', () => {
    const html = toHtml('![a](a.jpg){.small}{.inline} ![b](b.jpg){.inline}');
    expect(html).toContain('class="small inline"');
    expect(html).toContain('class="inline"');
    expect(html).not.toContain('{.');
  });

  it('同段多张 {.inline} 提升为 markdown-image-row 容器', () => {
    const html = toHtml('![a](a.jpg){.inline} ![b](b.jpg){.inline}');
    expect(html).toContain('data-role="markdown-image-row"');
    expect(html).toContain('class="markdown-image-row"');
    expect(html.match(/class="inline"/g)?.length).toBe(2);
    expect(html).not.toMatch(/<p>.*breakfast|<p>.*class="inline"/);
  });

  it('无属性块时不改动', () => {
    const html = toHtml('![x](x.jpg)');
    expect(html).toContain('<img src="x.jpg" alt="x">');
    expect(html).not.toContain('class=');
  });

  it('透传 fx-* 供后续特效', () => {
    const html = toHtml('![x](x.jpg){.small}{.fx-spark}');
    expect(html).toContain('class="small fx-spark"');
  });
});
