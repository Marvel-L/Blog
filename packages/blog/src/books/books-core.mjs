/** Pure package model shared by the client, SSG and sitemap generation. */
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const bookPath = (bookId) => `/book/${encodeURIComponent(bookId)}`;
export const chapterPath = (bookId, chapterId) => `${bookPath(bookId)}/chapter/${encodeURIComponent(chapterId)}`;

const publicPostMap = (posts) =>
  new Map(posts.filter((post) => !post.needHidden && !post.draft).map((post) => [post.id, post]));

const buildTree = (chapters, bookId) => {
  const tree = [];
  const folders = new Map();
  chapters.forEach((chapter) => {
    let children = tree;
    const parts = [];
    chapter.directory.forEach((label) => {
      parts.push(label);
      const key = parts.join('/');
      let folder = folders.get(key);
      if (!folder) {
        folder = {
          id: `${bookId}/directory/${parts.map(encodeURIComponent).join('/')}`,
          label,
          children: [],
        };
        folders.set(key, folder);
        children.push(folder);
      }
      children = folder.children;
    });
    children.push({
      id: `${bookId}/chapter/${chapter.id}`,
      label: chapter.title,
      chapter,
      children: [],
    });
  });
  return tree;
};

export const flattenChapters = (tree) =>
  tree.flatMap((node) => (node.chapter ? [node.chapter] : flattenChapters(node.children)));

/** Book packages are author-maintained; posts are optional related reading only. */
export const buildBooks = (posts, definitions) => {
  const postsById = publicPostMap(posts);
  return definitions.map((definition) => {
    const resolvedChapters = definition.chapters.map((chapter) => ({
      ...chapter,
      relatedPosts: (chapter.relatedPostIds ?? []).map((id) => postsById.get(id)).filter(Boolean),
    }));
    const tree = buildTree(resolvedChapters, definition.id);
    const chapters = flattenChapters(tree);
    const relatedPosts = Array.from(
      new Map(chapters.flatMap((chapter) => chapter.relatedPosts).map((post) => [post.id, post])).values(),
    );
    return {
      ...definition,
      chapters,
      tree,
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
export const getBookRoutes = (definitions, includeChapters = true) =>
  [
    'book',
    ...definitions.flatMap((book) => [
      `book/${book.id}`,
      ...(includeChapters ? book.chapters.map((chapter) => `book/${book.id}/chapter/${chapter.id}`) : []),
    ]),
  ].sort(compareText);
