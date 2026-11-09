// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validatePostContent } from './post-content-validator.mjs';

const makePost = (content) => ({
  data: { title: '测试文章', excerpt: '摘要', tags: [], date: '2026-01-01' },
  id: 'test-post',
  content,
  filePath: '/posts/test-post.md',
});

describe('validatePostContent — 文章链接使用已发布站点路由', () => {
  const publishedPosts = new Map([['merge-intervals-0x01', { id: 'merge-intervals-0x01' }]]);

  it('已发布的 /post/<id> 链接通过校验', () => {
    expect(
      validatePostContent(makePost('[56. 合并区间](/post/merge-intervals-0x01)'), {
        skipFrontMatter: true,
        publishedPosts,
      }),
    ).toEqual([]);
  });

  it('Markdown 文件相对路径不是站点路由，保持 fail-closed', () => {
    const errors = validatePostContent(makePost('[56. 合并区间](../../杂项/区间合并/56_合并区间.md)'), {
      skipFrontMatter: true,
      publishedPosts,
    });
    expect(errors.some((message) => message.includes('unknown site route'))).toBe(true);
  });
});

describe('validatePostContent — /shuoshuo/<id> 链接存在性校验', () => {
  it('链接到存在的说说：不报错', () => {
    const errors = validatePostContent(makePost('[一条说说](/shuoshuo/hello)'), {
      skipFrontMatter: true,
      shuoshuoIds: new Set(['hello']),
    });
    expect(errors).toEqual([]);
  });

  it('链接到不存在的说说：报错（fail-closed）', () => {
    const errors = validatePostContent(makePost('[一条说说](/shuoshuo/missing)'), {
      skipFrontMatter: true,
      shuoshuoIds: new Set(['hello']),
    });
    expect(errors.some((message) => message.includes('missing shuoshuo'))).toBe(true);
  });

  it('链接到 /shuoshuo 集合页（静态路由）：不报错', () => {
    const errors = validatePostContent(makePost('[全部说说](/shuoshuo)'), {
      skipFrontMatter: true,
      shuoshuoIds: new Set(),
    });
    expect(errors).toEqual([]);
  });
});
