/**
 * 把内容旁的相对图片路径改写成可访问的 /posts-img/... 或 /shuoshuo-img/... 。
 * 页面地址不是文件所在目录，浏览器不会把 my.jpg 解析到 Markdown 旁边。
 * 只接受落在该文件目录内的图片，拒绝跳出内容根目录。
 */

const IMAGE_EXT = /\.(?:jpe?g|png|gif|webp|avif)$/i;

const hasScheme = (value) => /^[a-z][a-z\d+.-]*:/i.test(value);

/**
 * @param {{ contentDir?: string, publicPrefix?: string }} [options]
 * contentDir 默认 posts；publicPrefix 默认 /{contentDir}-img。
 */
const resolveImageLayout = (options = {}) => {
  const contentDir = options.contentDir || 'posts';
  const publicPrefix = String(options.publicPrefix || `/${contentDir}-img`).replace(/\/$/, '');
  return { contentDir, publicPrefix };
};

/** 站点路径（/posts/a/b.md）或磁盘路径（.../posts/a/b.md）都收成 /posts/... */
export const toSiteContentPath = (filePath, contentDir = 'posts') => {
  const normalized = String(filePath ?? '').replace(/\\/g, '/');
  const marker = `/${contentDir}/`;
  const index = normalized.lastIndexOf(marker);
  if (index >= 0) {
    return normalized.slice(index);
  }
  if (normalized === `/${contentDir}` || normalized === contentDir) {
    return `/${contentDir}`;
  }
  return undefined;
};

export const toSitePostPath = (filePath) => toSiteContentPath(filePath, 'posts');

/**
 * @param {string | undefined} filePath 内容路径，/posts/...md、/shuoshuo/...md 或磁盘绝对路径
 * @param {string | undefined} src 相对图片目标
 * @param {{ contentDir?: string, publicPrefix?: string }} [options]
 * @returns {string | undefined} 站内图片路径；外链、根路径、无法安全解析时返回 undefined
 */
export const siblingContentImageUrl = (filePath, src, options = {}) => {
  if (!filePath || !src) {
    return undefined;
  }

  const { contentDir, publicPrefix } = resolveImageLayout(options);
  const raw = String(src).trim().replace(/\\/g, '/');
  if (!raw || raw.startsWith('#') || raw.startsWith('//') || raw.startsWith('/') || hasScheme(raw)) {
    return undefined;
  }

  const sitePath = toSiteContentPath(filePath, contentDir);
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

  if (parts[0] !== contentDir || parts.length < 2) {
    return undefined;
  }

  const relative = parts.slice(1).join('/');
  if (relative.split('/').includes('..') || !IMAGE_EXT.test(relative.split('?')[0].split('#')[0])) {
    return undefined;
  }

  return `${publicPrefix}/${relative
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
};

/** 文章旁图片，等价于 contentDir=posts、publicPrefix=/posts-img。 */
export const siblingPostImageUrl = (filePath, src) => siblingContentImageUrl(filePath, src);

/** /posts-img/a/b.jpg → a/b.jpg，供在内容目录下找文件。 */
export const siblingImageRelative = (filePath, src, options = {}) => {
  const { publicPrefix } = resolveImageLayout(options);
  const url = siblingContentImageUrl(filePath, src, options);
  const prefix = `${publicPrefix}/`;
  if (!url?.startsWith(prefix)) {
    return undefined;
  }
  return url
    .slice(prefix.length)
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');
};
