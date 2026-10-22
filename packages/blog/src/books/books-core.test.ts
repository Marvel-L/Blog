import { describe, expect, it } from 'vitest';
import { buildBooks, bookPath, chapterPath, findLegacyChapter, flattenChapters, getBookRoutes } from './books-core.mjs';
import { catalog, post } from './book-fixtures';
import { getBookPackageDefinitions } from '@/services/books';

const definitions = getBookPackageDefinitions();

describe('Book package catalog', () => {
  it('builds author-maintained packages instead of deriving books from categories', () => {
    const original = JSON.stringify(catalog);
    const books = buildBooks(catalog, definitions);
    expect(books.map((book) => book.id)).toContain('algorithms');
    expect(books.map((book) => book.id)).toContain('golang');
    expect(books.find((book) => book.id === 'algorithms')?.chapters.map((chapter) => chapter.id)).toEqual([
      'start',
      'linked-list',
      'number-theory',
    ]);
    expect(buildBooks([...catalog, post('new-category', '新分类', '/posts/new.md')], definitions)).toHaveLength(
      books.length,
    );
    expect(JSON.stringify(catalog)).toBe(original);
  });

  it('keeps physical subpackage directories and chapter order', () => {
    const book = buildBooks(catalog, definitions).find((item) => item.id === 'algorithms')!;
    expect(book.tree.map((node) => node.label)).toEqual(['开始', '数据结构', '数学基础']);
    expect(flattenChapters(book.tree).map((chapter) => chapter.id)).toEqual(['start', 'linked-list', 'number-theory']);
  });

  it('builds nested directories and keeps reading order consistent with the tree', () => {
    const chapter = (id: string, directory: string[]) => ({ id, directory, title: id, content: `# ${id}` });
    const definition = {
      ...definitions[0],
      chapters: [
        chapter('first', ['Go', '基础']),
        chapter('root', []),
        chapter('second', ['Go', '基础']),
        chapter('third', ['Java', '基础']),
      ],
    };
    const book = buildBooks([], [definition])[0];
    expect(book.tree.map((node) => node.label)).toEqual(['Go', 'root', 'Java']);
    expect(book.tree[0].children[0].label).toBe('基础');
    expect(book.tree[0].children[0].children.map((node) => node.chapter?.id)).toEqual(['first', 'second']);
    expect(book.tree[1].chapter?.id).toBe('root');
    expect(book.tree[2].children[0].children[0].chapter?.id).toBe('third');
    expect(book.tree[0].children[0].id).not.toBe(book.tree[2].children[0].id);
    expect(book.chapters.map((chapter) => chapter.id)).toEqual(['first', 'second', 'root', 'third']);
    expect(flattenChapters(book.tree)).toEqual(book.chapters);
  });

  it('resolves only existing public related posts and removes duplicates at book level', () => {
    const book = buildBooks(catalog, definitions).find((item) => item.id === 'algorithms')!;
    expect(book.chapters.find((chapter) => chapter.id === 'linked-list')?.relatedPosts.map((post) => post.id)).toEqual([
      'lcsaf-reverse-link-0x01',
    ]);
    expect(new Set(book.posts.map((item) => item.id)).size).toBe(book.posts.length);
    const hidden = post('leetCode-hot-100', '算法', '/posts/hidden.md', { needHidden: true });
    expect(buildBooks([hidden], definitions).find((item) => item.id === 'algorithms')?.posts).toEqual([]);
    const draft = post('leetCode-hot-100', '算法', '/posts/draft.md');
    expect(
      buildBooks([{ ...draft, draft: true }], definitions).find((item) => item.id === 'algorithms')?.posts,
    ).toEqual([]);
  });

  it('maps old post chapter links to the package chapter containing that post', () => {
    const book = buildBooks(catalog, definitions).find((item) => item.id === 'algorithms')!;
    expect(findLegacyChapter(book, 'lcsaf-reverse-link-0x01')?.id).toBe('linked-list');
    expect(findLegacyChapter(book, 'unknown')).toBeUndefined();
  });

  it('shares encoded browser URLs and decoded SSG paths', () => {
    expect(bookPath('golang')).toBe('/book/golang');
    expect(chapterPath('golang', '语言 基础')).toBe('/book/golang/chapter/%E8%AF%AD%E8%A8%80%20%E5%9F%BA%E7%A1%80');
    expect(getBookRoutes(definitions, false)).toContain('book/algorithms');
    expect(getBookRoutes(definitions)).toContain('book/algorithms/chapter/linked-list');
    expect(new Set(getBookRoutes(definitions)).size).toBe(getBookRoutes(definitions).length);
    expect(buildBooks(catalog, [])).toEqual([]);
    expect(getBookRoutes([])).toEqual(['book']);
  });
});
