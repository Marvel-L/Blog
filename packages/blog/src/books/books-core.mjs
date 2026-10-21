/** Pure catalog model shared by the client, SSG and sitemap generation. */
const editions = {
  算法: ['algorithms', '思路、推导与解题笔记', 'THE ART OF SOLVING', '#365348'],
  Golang: ['golang', '在代码里理解语言', 'THINKING IN GO', '#365d74'],
  项目: ['projects', '从想法到实现的过程', 'BUILD & REFLECT', '#665079'],
  日常: ['life', '日子里的片段与回声', 'NOTES ON LIVING', '#8c6045'],
  重要决策: ['decisions', '选择背后的思考', 'THE PATH WE TAKE', '#7c4045'],
  健身: ['fitness', '身体与日常的练习', 'STRENGTH & BALANCE', '#686c42'],
  求职心得: ['career', '工作、成长与下一程', 'WORK IN PROGRESS', '#49666a'],
  prompts: ['prompts', '与 AI 对话的工具箱', 'WORDS INTO TOOLS', '#62607d'],
  分享: ['sharing', '值得留下的发现', 'IDEAS TO KEEP', '#9a7541'],
  其他: ['miscellany', '尚未归类的灵感', 'A LITTLE OF EVERYTHING', '#68625a'],
};

const editionFor = (name) => (Object.hasOwn(editions, name) ? editions[name] : undefined);

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const categoryId = (name) =>
  editionFor(name)?.[0] ?? `c-${Array.from(name, (c) => c.codePointAt(0).toString(16)).join('-')}`;

export const bookPath = (bookId) => `/book/${encodeURIComponent(bookId)}`;
export const chapterPath = (bookId, postId) => `${bookPath(bookId)}/chapter/${encodeURIComponent(postId)}`;

const directories = (post) => {
  if (post.series && post.seriesName) return [post.seriesName];
  const parts = post.filePath.replaceAll('\\', '/').split('/').filter(Boolean);
  if (parts[0] === 'posts') parts.shift();
  const filename = parts.pop() ?? '';
  // index.md's parent names this article, rather than a chapter group.
  if (filename.toLowerCase() === 'index.md') parts.pop();
  if (parts[0]?.toLowerCase() === post.category.toLowerCase()) parts.shift();
  return parts.filter((part) => part !== '.' && part !== '..');
};

const makeTree = (posts, bookId) => {
  const paths = posts.map(directories);
  // The common filesystem container is represented by the book itself.
  while (paths.length && paths.every((parts) => parts.length && parts[0] === paths[0][0])) {
    paths.forEach((parts) => parts.shift());
  }
  const tree = [];
  posts.forEach((post, index) => {
    let nodes = tree;
    let parent = bookId;
    for (const label of paths[index]) {
      const id = `${parent}/${encodeURIComponent(label)}`;
      let folder = nodes.find((node) => !node.post && node.id === id);
      if (!folder) {
        folder = { id, label, children: [] };
        nodes.push(folder);
      }
      nodes = folder.children;
      parent = id;
    }
    nodes.push({ id: `${bookId}/post/${post.id}`, label: post.title, post, children: [] });
  });
  const sort = (nodes) => {
    nodes.sort((a, b) => {
      if (Boolean(a.post) !== Boolean(b.post)) return a.post ? 1 : -1;
      if (a.post && b.post)
        return (
          (a.post.seriesOrder ?? Number.MAX_SAFE_INTEGER) - (b.post.seriesOrder ?? Number.MAX_SAFE_INTEGER) ||
          compareText(a.post.title, b.post.title) ||
          compareText(a.post.id, b.post.id)
        );
      return compareText(a.label, b.label);
    });
    nodes.forEach((node) => sort(node.children));
  };
  sort(tree);
  return tree;
};

export const flattenChapters = (tree) =>
  tree.flatMap((node) => (node.post ? [node.post] : flattenChapters(node.children)));

/** Only published public metadata is supplied; explicitly hidden items stay excluded. */
export const buildBooks = (posts) => {
  const groups = new Map();
  posts
    .filter((post) => !post.needHidden && !post.draft)
    .forEach((post) => {
      const group = groups.get(post.category) ?? [];
      group.push(post);
      groups.set(post.category, group);
    });
  return Array.from(groups, ([name, entries]) => {
    const id = categoryId(name);
    const [, subtitle, edition, accent] = editionFor(name) ?? [
      id,
      '收藏于此，慢慢读。',
      'A PERSONAL COLLECTION',
      '#68625a',
    ];
    const tree = makeTree(entries, id);
    return { id, name, subtitle, edition, accent, tree, posts: flattenChapters(tree) };
  }).sort((a, b) => b.posts.length - a.posts.length || compareText(a.id, b.id));
};

/** Decoded output paths, matching existing /post/<id> SSG filesystem semantics. */
export const getBookRoutes = (posts, includeChapters = true) => [
  'book',
  ...buildBooks(posts).flatMap((book) => [
    `book/${book.id}`,
    ...(includeChapters ? book.posts.map((post) => `book/${book.id}/chapter/${post.id}`) : []),
  ]),
];
