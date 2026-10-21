import { describe, expect, it } from 'vitest';
import { buildBooks, bookPath, chapterPath, flattenChapters, getBookRoutes } from './books-core.mjs';

import { catalog, post } from './book-fixtures';

describe('Book catalog', () => {
  it('builds one book per public category without mutating metadata', () => {
    const original = JSON.stringify(catalog);
    const books = buildBooks(catalog);
    expect(books.map((book) => [book.id, book.name, book.posts.length])).toEqual([
      ['algorithms', '算法', 3],
      ['golang', 'Golang', 1],
    ]);
    expect(JSON.stringify(catalog)).toBe(original);
    expect(buildBooks([...catalog].reverse())).toEqual(books);
    expect(buildBooks([])).toEqual([]);
  });
  it('keeps directory hierarchy and removes article container and redundant category root', () => {
    const book = buildBooks(catalog)[0];
    expect(book.tree.map((node) => node.label)).toEqual(['数论', '链表']);
    const linked = book.tree.find((node) => node.label === '链表')!;
    expect(linked.children.map((node) => node.label)).toEqual(['反转', '合并']);
    expect(linked.children[0].children[0].post?.id).toBe('reverse');
    expect(flattenChapters(book.tree).map((item) => item.id)).toEqual(['gcd', 'reverse', 'merge']);
  });
  it('honors series order, avoids locale-dependent order and strips shared container', () => {
    const books = buildBooks([
      post('second', '项目', '/posts/program/second.md', { series: true, seriesName: '工程', seriesOrder: 2 }),
      post('first', '项目', '/posts/program/first.md', { series: true, seriesName: '工程', seriesOrder: 1 }),
    ]);
    expect(books[0].posts.map((item) => item.id)).toEqual(['first', 'second']);
  });
  it('excludes hidden/draft metadata and supports unknown/prototype-like category names', () => {
    const books = buildBooks([
      ...catalog,
      post('secret', '私密', '/posts/secret.md', { needHidden: true }),
      { ...post('draft', '草稿', '/posts/draft.md'), draft: true },
    ]);
    expect(books).toHaveLength(2);
    const unknown = buildBooks([post('custom', 'constructor', '/posts/custom.md')])[0];
    expect(unknown.id).toMatch(/^c-[0-9a-f-]+$/);
    expect(buildBooks([post('custom', '新分类', '/posts/custom.md')])[0].name).toBe('新分类');
  });
  it('shares encoded browser URLs and decoded SSG paths with sitemap category routes only', () => {
    expect(bookPath('golang')).toBe('/book/golang');
    expect(chapterPath('golang', 'Go 指针')).toBe('/book/golang/chapter/Go%20%E6%8C%87%E9%92%88');
    expect(getBookRoutes(catalog, false)).toEqual(['book', 'book/algorithms', 'book/golang']);
    expect(getBookRoutes(catalog)).toContain('book/algorithms/chapter/reverse');
    expect(new Set(getBookRoutes(catalog)).size).toBe(getBookRoutes(catalog).length);
  });
});
