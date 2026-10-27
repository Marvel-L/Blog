// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildBooks, getBookRoutes } from '@d-blog/blog/books-core';
import { loadBookPackages, writeBookData } from './book-content.mjs';

let root;
const put = (filename, content) => {
  const target = path.join(root, filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content));
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(tmpdir(), 'dblog-books-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('local Book content packages', () => {
  it('discovers books and nested Markdown chapters without configuration or Blog posts', () => {
    put('README.md', '# Author documentation');
    put('go/intro.md', '# Go 入门\n\n独立正文');
    put('go/基础/pointers.md', '# 指针\n\n## 值传递\n\n内容');
    put('go/.drafts/ignored.md', '# 不发布');
    put('go/.ignored.md', '# 不发布');
    put('assets/image.txt', 'not a book');
    const books = loadBookPackages(root);
    expect(books.map((book) => book.id)).toEqual(['go']);
    expect(books[0].name).toBe('go');
    expect(books[0].chapters.map((chapter) => [chapter.id, chapter.title, chapter.directory])).toEqual([
      ['intro', 'Go 入门', []],
      ['基础--pointers', '指针', ['基础']],
    ]);
    expect(buildBooks([], books)[0].tree.map((node) => node.label)).toEqual(['Go 入门', '基础']);
    expect(getBookRoutes(books)).toContain('book/go/chapter/基础--pointers');
  });

  it.each(['json', 'yaml', 'yml'])(
    'reads per-package config.%s and pins chapters while discovering new files',
    (ext) => {
      const config = {
        id: 'stable-id',
        name: '自定义手册',
        subtitle: '持续整理',
        edition: 'GO NOTES',
        accent: '#365d74',
        order: -1,
        chapters: [{ file: '基础/b.md', id: 'stable-chapter', title: '配置标题', relatedPostIds: ['post'] }, 'a.md'],
      };
      put('go/config.' + ext, ext === 'json' ? config : JSON.stringify(config));
      put('go/a.md', '# A');
      put('go/基础/b.md', '---\ntitle: 正文标题\n---\n# B');
      put('go/new.md', '# 新章节');
      const book = loadBookPackages(root)[0];
      expect(book).toMatchObject({ id: 'stable-id', name: '自定义手册', accent: '#365d74' });
      expect(book.chapters.map((chapter) => chapter.id)).toEqual(['stable-chapter', 'a', 'new']);
      expect(book.chapters[0]).toMatchObject({
        title: '配置标题',
        directory: ['基础'],
        relatedPostIds: ['post'],
        content: '# B',
      });
      expect(getBookRoutes([book])).toContain('book/stable-id/chapter/stable-chapter');
    },
  );

  it('reads ordinary YAML syntax and front matter with deterministic numeric ordering', () => {
    put('z/config.yaml', 'name: YAML 手册\norder: -1\naccent: "#365d74"\n');
    put('z/a.md', '---\norder: 2\n---\n# A');
    put('z/核心/b.md', '---\nid: stable\ntitle: 自定义标题\norder: 1\nrelatedPostIds: [post, post]\n---\n# B');
    put('a/intro.md', '# Another book');
    const books = loadBookPackages(root);
    expect(books.map((book) => book.id)).toEqual(['z', 'a']);
    expect(books[0].chapters.map((chapter) => chapter.id)).toEqual(['stable', 'a']);
    expect(books[0].chapters[0]).toMatchObject({ title: '自定义标题', directory: ['核心'], relatedPostIds: ['post'] });
    expect(loadBookPackages(root)).toEqual(books);
  });

  it('puts direct Markdown first at every level without comparing orders across packages', () => {
    put('go/config.json', { markdownFirst: true, chapters: ['基础/嵌套/b.md', '基础/z.md', 'z.md'] });
    put('go/z.md', '---\norder: 100\n---\n# Root pinned');
    put('go/a.md', '---\norder: 50\n---\n# Root unlisted');
    put('go/基础/z.md', '---\norder: 100\n---\n# Direct pinned');
    put('go/基础/a.md', '---\norder: 50\n---\n# Direct unlisted');
    put('go/基础/嵌套/b.md', '---\norder: -100\n---\n# Nested pinned');
    const definition = loadBookPackages(root)[0];
    expect(definition.chapters.map((chapter) => chapter.id)).toEqual(['z', 'a', '基础--z', '基础--a', '基础--嵌套--b']);
    const book = buildBooks([], [definition])[0];
    expect(book.chapters.map((chapter) => chapter.id)).toEqual(definition.chapters.map((chapter) => chapter.id));
    expect(book.tree.map((node) => node.label)).toEqual(['Root pinned', 'Root unlisted', '基础']);
    expect(book.tree[2].children.map((node) => node.label)).toEqual(['Direct pinned', 'Direct unlisted', '嵌套']);
  });

  it.each(['json', 'yaml', 'yml'])('orders sibling directories with config.%s and appends unlisted packages', (ext) => {
    const config = {
      directoryOrder: { '.': ['技术', '业务'], 技术: ['接口', 'MQ'], '技术/接口': ['鉴权', '基础'] },
    };
    put(`go/config.${ext}`, config);
    put('go/root.md', '---\norder: 999\n---\n# Root');
    put('go/业务/b.md', '---\norder: -50\n---\n# Business');
    put('go/技术/root.md', '# Tech root');
    put('go/技术/MQ/one.md', '---\norder: 2\n---\n# MQ one');
    put('go/技术/MQ/two.md', '---\norder: 1\n---\n# MQ two');
    put('go/技术/接口/root.md', '# API root');
    put('go/技术/接口/基础/a.md', '# Basics');
    put('go/技术/接口/鉴权/a.md', '# Auth');
    put('go/技术/定时/a.md', '# Cron');
    put('go/其他/a.md', '# Other');
    put('go/技术/MQ/.hidden.md', '# Hidden');
    put('go/技术/MQ/draft.md', '---\ndraft: true\n---\n');
    const definition = loadBookPackages(root)[0];
    const book = buildBooks([], [definition])[0];
    expect(book.tree.map((node) => node.label)).toEqual(['Root', '技术', '业务', '其他']);
    expect(book.tree[1].children.map((node) => node.label)).toEqual(['Tech root', '接口', 'MQ', '定时']);
    expect(book.tree[1].children[1].children.map((node) => node.label)).toEqual(['API root', '鉴权', '基础']);
    expect(book.tree[1].children[2].children.map((node) => node.label)).toEqual(['MQ two', 'MQ one']);
    expect(book.chapters).toHaveLength(10);
    expect(book.chapters.map((chapter) => chapter.id)).toEqual(definition.chapters.map((chapter) => chapter.id));
    expect(loadBookPackages(root)).toEqual([definition]);
    // A new chapter requires no configuration update and stays inside its package.
    put('go/技术/MQ/new.md', '# New MQ');
    expect(buildBooks([], loadBookPackages(root))[0].tree[1].children[2].children.map((node) => node.label)).toEqual([
      'New MQ',
      'MQ two',
      'MQ one',
    ]);
  });

  it('can explicitly retain interleaved Markdown positions while ordering directory slots', () => {
    put('go/config.yaml', 'markdownFirst: false\ndirectoryOrder:\n  ".": [技术, 业务]\n');
    put('go/业务/a.md', '---\norder: -1\n---\n# Business');
    put('go/root.md', '# Root');
    put('go/技术/a.md', '---\norder: 1\n---\n# Tech');
    const book = buildBooks([], loadBookPackages(root))[0];
    expect(book.tree.map((node) => node.label)).toEqual(['技术', 'Root', '业务']);
  });

  it('preserves legacy chapter priority when directory sorting is absent or disabled', () => {
    put('go/config.json', { chapters: ['基础/b.md'] });
    put('go/root.md', '# Root');
    put('go/基础/b.md', '# Pinned');
    const legacy = loadBookPackages(root);
    expect(legacy[0].chapters.map((chapter) => chapter.id)).toEqual(['基础--b', 'root']);
    put('go/config.json', { chapters: ['基础/b.md'], markdownFirst: false });
    expect(loadBookPackages(root)).toEqual(legacy);
  });

  it('accepts empty or draft-only configured directories without rendering empty nodes', () => {
    put('go/config.json', { directoryOrder: { '.': ['empty', 'drafts'] } });
    fs.mkdirSync(path.join(root, 'go/empty'));
    put('go/drafts/unfinished.md', '---\ndraft: true\n---\n');
    put('go/root.md', '# Root');
    expect(buildBooks([], loadBookPackages(root))[0].tree.map((node) => node.label)).toEqual(['Root']);
  });

  it('refreshes added, edited and removed chapters from the filesystem', () => {
    put('local/first.md', '# First');
    expect(loadBookPackages(root)[0].chapters).toHaveLength(1);
    put('local/second.md', '# Second\n\nNew body');
    expect(loadBookPackages(root)[0].chapters.map((chapter) => chapter.id)).toEqual(['first', 'second']);
    put('local/second.md', '# Second\n\nChanged body');
    expect(loadBookPackages(root)[0].chapters[1].content).toContain('Changed body');
    fs.unlinkSync(path.join(root, 'local/first.md'));
    expect(loadBookPackages(root)[0].chapters.map((chapter) => chapter.id)).toEqual(['second']);
  });

  it('derives titles from real Markdown headings, excluding code and comments', () => {
    put('go/intro.md', '```md\n# Example\n```\n\n<!--\n# Hidden\n-->\n\n# **Go** &amp; `context`');
    put('go/no-heading.md', '正文没有一级标题。');
    expect(loadBookPackages(root)[0].chapters.map((chapter) => chapter.title)).toEqual(['Go & context', 'no-heading']);
  });

  it('excludes draft books and chapters including unfinished chapter bodies', () => {
    put('private/config.json', { draft: true });
    put('private/unfinished.md', 'invalid unfinished content');
    put('public/unfinished.md', '---\ndraft: true\n---\n');
    put('public/ready.md', '# Ready');
    const books = loadBookPackages(root);
    expect(books.map((book) => book.id)).toEqual(['public']);
    expect(books[0].chapters.map((chapter) => chapter.id)).toEqual(['ready']);
    expect(getBookRoutes(books)).not.toContain('book/public/chapter/unfinished');
  });

  it.each([
    ['malformed JSON', 'go/config.json', '{', 'go/config.json'],
    ['malformed YAML', 'go/config.yaml', 'name: [', 'go/config.yaml'],
    ['non-object config', 'go/config.json', [], 'expected an object'],
    ['unknown field', 'go/config.json', { subtitlle: 'typo' }, 'unknown field'],
    ['unsafe book id', 'go/config.json', { id: '../escape' }, 'id is unsafe'],
    ['invalid accent', 'go/config.json', { accent: 'red' }, '#RRGGBB'],
    ['invalid order', 'go/config.json', { order: '1' }, 'order must'],
    ['invalid draft', 'go/config.json', { draft: 'false' }, 'draft must'],
    ['invalid Markdown preference', 'go/config.json', { markdownFirst: 'true' }, 'markdownFirst must be a boolean'],
    ['invalid directory map', 'go/config.json', { directoryOrder: [] }, 'directoryOrder must be an object'],
    ['null directory map', 'go/config.json', { directoryOrder: null }, 'directoryOrder must be an object'],
    ['missing parent directory', 'go/config.json', { directoryOrder: { missing: [] } }, 'parent "missing"'],
    ['parent path traversal', 'go/config.json', { directoryOrder: { '../other': [] } }, 'missing or outside'],
    ['noncanonical parent', 'go/config.json', { directoryOrder: { '基础/': [] } }, 'missing or outside'],
    ['invalid directory list', 'go/config.json', { directoryOrder: { '.': '基础' } }, 'must be an array'],
    ['missing directory', 'go/config.json', { directoryOrder: { '.': ['missing'] } }, 'missing or outside'],
    ['file as directory', 'go/config.json', { directoryOrder: { '.': ['intro.md'] } }, 'missing or outside'],
    ['invalid directory item', 'go/config.json', { directoryOrder: { '.': [42] } }, 'directoryOrder item'],
    ['child path traversal', 'go/config.json', { directoryOrder: { '.': ['../基础'] } }, 'direct child'],
    ['child with slash', 'go/config.json', { directoryOrder: { '.': ['基础/嵌套'] } }, 'direct child'],
    ['child with backslash', 'go/config.json', { directoryOrder: { '.': ['基础\\嵌套'] } }, 'direct child'],
    ['hidden directory', 'go/config.json', { directoryOrder: { '.': ['.hidden'] } }, 'direct child'],
    ['padded directory', 'go/config.json', { directoryOrder: { '.': [' 基础 '] } }, 'direct child'],
    ['duplicate directory', 'go/config.json', { directoryOrder: { '.': ['基础', '基础'] } }, 'listed twice'],
    ['missing chapter', 'go/config.json', { chapters: ['missing.md'] }, 'missing or outside'],
    ['path traversal', 'go/config.json', { chapters: ['../other.md'] }, 'missing or outside'],
    ['duplicate file', 'go/config.json', { chapters: ['intro.md', 'intro.md'] }, 'listed twice'],
    [
      'group tag in config',
      'go/config.json',
      { chapters: [{ file: 'intro.md', group: '核心' }] },
      'unknown field "group"',
    ],
    ['group tag in front matter', 'go/intro.md', '---\ngroup: 核心\n---\n# Intro', 'unknown field "group"'],
    ['empty body', 'go/intro.md', '---\ntitle: Empty\n---\n', 'body must not be empty'],
    ['invalid related IDs', 'go/intro.md', '---\nrelatedPostIds: [42]\n---\n# Intro', 'relatedPostIds item'],
    ['unsafe chapter ID', 'go/intro.md', '---\nid: a/b\n---\n# Intro', 'id is unsafe'],
    ['invalid front matter', 'go/intro.md', '---\ntitle: [\n---\n# Intro', 'go/intro.md'],
  ])('rejects %s with a file-specific diagnostic', (_label, filename, content, reason) => {
    put('go/intro.md', '# Intro');
    put('go/基础/chapter.md', '# Basics');
    put(filename, content);
    expect(() => loadBookPackages(root)).toThrow(reason);
  });

  it('rejects ambiguous configuration files', () => {
    put('go/config.json', {});
    put('go/config.yaml', 'name: Go');
    expect(() => loadBookPackages(root)).toThrow('keep only one');
  });

  it('rejects duplicate public book and chapter IDs', () => {
    put('first/config.json', { id: 'same' });
    put('second/config.json', { id: 'same' });
    expect(() => loadBookPackages(root)).toThrow('duplicate book id');
    fs.rmSync(path.join(root, 'second'), { recursive: true });
    put('first/a.md', '---\nid: same\n---\n# A');
    put('first/b.md', '---\nid: same\n---\n# B');
    expect(() => loadBookPackages(root)).toThrow('duplicate chapter id');
  });

  it('rejects symlinks and unreadable content instead of silently losing chapters', () => {
    put('go/intro.md', '# Intro');
    fs.symlinkSync(path.join(root, 'go/intro.md'), path.join(root, 'go/link.md'));
    expect(() => loadBookPackages(root)).toThrow('symbolic links');
    expect(() => loadBookPackages(path.join(root, 'go/intro.md'))).toThrow('Invalid Book content');
  });

  it('allows an empty bookshelf and an explicitly configured book with no chapters', () => {
    expect(loadBookPackages(path.join(root, 'missing'))).toEqual([]);
    put('empty/config.json', { name: 'Coming soon' });
    expect(loadBookPackages(root)[0].chapters).toEqual([]);
  });

  it('writes a shared snapshot idempotently and reports output failures', () => {
    put('go/intro.md', '# Intro');
    const books = loadBookPackages(root);
    const output = path.join(root, 'generated/books.json');
    writeBookData(books, output);
    const modified = fs.statSync(output).mtimeMs;
    expect(JSON.parse(fs.readFileSync(output, 'utf8'))).toEqual(books);
    writeBookData(books, output);
    expect(fs.statSync(output).mtimeMs).toBe(modified);
    put('go/intro.md', '# Edited');
    writeBookData(loadBookPackages(root), output);
    expect(JSON.parse(fs.readFileSync(output, 'utf8'))[0].chapters[0].content).toBe('# Edited');
    expect(() => writeBookData(books, root)).toThrow('failed to write data');
  });
});
