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
