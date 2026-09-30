const normalizeHiddenLabel = (value) =>
  typeof value === 'string' ? value.trim().normalize('NFKC').toLowerCase() : '';

const normalizeHiddenList = (value) =>
  Array.isArray(value) ? Array.from(new Set(value.map(normalizeHiddenLabel).filter(Boolean))) : [];

export const normalizeHiddenContentConfig = (config) => ({
  categories: normalizeHiddenList(config?.categories),
  tags: normalizeHiddenList(config?.tags),
});

export const createHiddenContentMatcher = (config) => {
  const normalized = normalizeHiddenContentConfig(config);
  const categories = new Set(normalized.categories);
  const tags = new Set(normalized.tags);

  return {
    categories,
    tags,
    hasHiddenCategory(category) {
      return categories.has(normalizeHiddenLabel(category));
    },
    hasHiddenTag(tag) {
      return tags.has(normalizeHiddenLabel(tag));
    },
  };
};

export const isHiddenPost = (post, matcher = createHiddenContentMatcher()) => {
  if (!post || typeof post !== 'object') {
    return false;
  }

  if (post.needHidden === true) {
    return true;
  }

  if (matcher.hasHiddenCategory(post.category)) {
    return true;
  }

  return Array.isArray(post.tags) && post.tags.some((tag) => matcher.hasHiddenTag(tag));
};
