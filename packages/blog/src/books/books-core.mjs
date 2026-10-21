/** Pure package model shared by the client, SSG and sitemap generation. */
import { getBookPackageDefinitions } from './book-packages.mjs';

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const bookPath = (bookId) => `/book/${encodeURIComponent(bookId)}`;
export const chapterPath = (bookId, chapterId) => `${bookPath(bookId)}/chapter/${encodeURIComponent(chapterId)}`;

const publicPostMap = (posts) =>
  new Map(posts.filter((post) => !post.needHidden && !post.draft).map((post) => [post.id, post]));

const buildTree = (chapters, bookId) => {
  const groups = new Map();
  chapters.forEach((chapter) => {
    const label = chapter.group || '内容';
    const group = groups.get(label) ?? [];
    group.push({
      id: `${bookId}/chapter/${chapter.id}`,
      label: chapter.title,
      chapter,
      children: [],
    });
    groups.set(label, group);
  });
  return Array.from(groups, ([label, children]) => ({
    id: `${bookId}/group/${encodeURIComponent(label)}`,
    label,
    children,
  }));
};

export const flattenChapters = (tree) =>
  tree.flatMap((node) => (node.chapter ? [node.chapter] : flattenChapters(node.children)));

/** Book packages are author-maintained; posts are optional related reading only. */
export const buildBooks = (posts) => {
  const postsById = publicPostMap(posts);
  return getBookPackageDefinitions().map((definition) => {
    const chapters = definition.chapters.map((chapter) => ({
      ...chapter,
      relatedPosts: (chapter.relatedPostIds ?? []).map((id) => postsById.get(id)).filter(Boolean),
    }));
    const relatedPosts = Array.from(
      new Map(chapters.flatMap((chapter) => chapter.relatedPosts).map((post) => [post.id, post])).values(),
    );
    return {
      ...definition,
      chapters,
      tree: buildTree(chapters, definition.id),
      posts: relatedPosts,
    };
  });
};

export const findLegacyChapter = (book, chapterId) => {
  const related = book.posts.find((post) => post.id === chapterId);
  if (!related) return undefined;
  return book.chapters.find((chapter) => chapter.relatedPosts.some((post) => post.id === chapterId));
};

/** Decoded output paths, matching existing SSG filesystem semantics. */
export const getBookRoutes = (posts, includeChapters = true) =>
  [
    'book',
    ...buildBooks(posts).flatMap((book) => [
      `book/${book.id}`,
      ...(includeChapters ? book.chapters.map((chapter) => `book/${book.id}/chapter/${chapter.id}`) : []),
    ]),
  ].sort(compareText);
