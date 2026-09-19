/**
 * 把文章旁的相对图片路径改写成可访问的 /posts-img/... 。
 * 文章页地址是 /post/:id，浏览器不会把 my.jpg 解析到 posts/ 目录下。
 * 只接受落在该篇文章目录内的图片，拒绝跳出 posts/。
 */

const IMAGE_EXT = /\.(?:jpe?g|png|gif|webp|avif)$/i;

const hasScheme = (value) => /^[a-z][a-z\d+.-]*:/i.test(value);

/** 站点路径（/posts/a/b.md）或磁盘路径（.../posts/a/b.md）都收成 /posts/... */
export const toSitePostPath = (filePath) => {
  const normalized = String(filePath ?? '').replace(/\\/g, '/');
  const marker = '/posts/';
  const index = normalized.lastIndexOf(marker);
  if (index >= 0) {
    return normalized.slice(index);
  }
  if (normalized === '/posts' || normalized === 'posts') {
    return '/posts';
  }
  return undefined;
};

/**
 * @param {string | undefined} filePath 文章路径，/posts/...md 或磁盘绝对路径
 * @param {string | undefined} src Markdown 图片目标
 * @returns {string | undefined} /posts-img/ 开头的站内路径；外链、根路径、无法安全解析时返回 undefined
 */
export const siblingPostImageUrl = (filePath, src) => {
  if (!filePath || !src) {
    return undefined;
  }

  const raw = String(src).trim().replace(/\\/g, '/');
  if (!raw || raw.startsWith('#') || raw.startsWith('//') || raw.startsWith('/') || hasScheme(raw)) {
    return undefined;
  }

  const sitePath = toSitePostPath(filePath);
  if (!sitePath) {
    return undefined;
  }

  const dir = sitePath.replace(/[^/]*$/, '');
  const parts = [];
  for (const part of `${dir}${raw}`.split('/')) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      if (parts.length === 0) {
        return undefined;
      }
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  if (parts[0] !== 'posts' || parts.length < 2) {
    return undefined;
  }

  const relative = parts.slice(1).join('/');
  if (relative.split('/').includes('..') || !IMAGE_EXT.test(relative.split('?')[0].split('#')[0])) {
    return undefined;
  }

  return `/posts-img/${relative
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
};

/** /posts-img/a/b.jpg → a/b.jpg，供在 posts/ 下找文件。 */
export const siblingImageRelative = (filePath, src) => {
  const url = siblingPostImageUrl(filePath, src);
  if (!url?.startsWith('/posts-img/')) {
    return undefined;
  }
  return url
    .slice('/posts-img/'.length)
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');
};
