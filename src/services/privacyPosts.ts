import type { Post, PostMetadata } from '@/types';
import type { EncryptedPrivacyPayload } from '@/utils/privacyCrypto';
import { decryptPrivacyPayload } from '@/utils/privacyCrypto';
import { getDateTimestamp } from '@/utils/date';
import type { PostSearchResult, PostSearchScope } from './posts';
import { clearPrivacyAccess, readPrivacyAccess, readPrivacySessionPassword } from '@/utils/privacyAccess';

const generatedPrivacyModules = import.meta.glob<EncryptedPrivacyPayload>('../../generated/privacy-posts.json', {
  eager: true,
  import: 'default',
});

const encryptedPrivacyPayload = Object.values(generatedPrivacyModules)[0] ?? null;
const unlockedCache = new Map<string, Post[]>();
const normalizeSearchText = (value: string) => value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
const getFieldMatchScore = (value: string, terms: string[], fullQuery: string, weight: number) => {
  if (!value) {
    return 0;
  }

  let score = 0;

  if (value === fullQuery) {
    score += weight * 12;
  } else if (value.startsWith(fullQuery)) {
    score += weight * 9;
  } else if (value.includes(fullQuery)) {
    score += weight * 6;
  }

  terms.forEach((term) => {
    if (value === term) {
      score += weight * 5;
      return;
    }

    if (value.startsWith(term)) {
      score += weight * 4;
      return;
    }

    if (value.includes(term)) {
      score += weight * 2;
    }
  });

  return score;
};

const isPrivacyPost = (value: unknown): value is Post => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Post;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.excerpt === 'string' &&
    typeof candidate.date === 'string' &&
    Array.isArray(candidate.tags) &&
    typeof candidate.category === 'string' &&
    typeof candidate.filePath === 'string' &&
    typeof candidate.readTime === 'string' &&
    typeof candidate.content === 'string'
  );
};

export const toPrivacyPostMetadata = (post: Post): PostMetadata => {
  const { content: _content, searchText: _searchText, ...metadata } = post;
  return metadata;
};

export const unlockPrivacyPosts = async (password: string): Promise<Post[]> => {
  if (!encryptedPrivacyPayload) {
    return [];
  }

  const cached = unlockedCache.get(password);
  if (cached) {
    return cached;
  }

  const decrypted = await decryptPrivacyPayload<{ posts?: unknown }>(password, encryptedPrivacyPayload);
  const posts = Array.isArray(decrypted.posts) ? decrypted.posts.filter(isPrivacyPost) : [];
  unlockedCache.set(password, posts);
  return posts;
};

export const readUnlockedPrivacyPosts = async (): Promise<Post[]> => {
  if (!readPrivacyAccess()) {
    return [];
  }

  const password = readPrivacySessionPassword();
  if (!password) {
    clearPrivacyAccess();
    return [];
  }

  try {
    return await unlockPrivacyPosts(password);
  } catch {
    clearPrivacyAccess();
    return [];
  }
};

export const getUnlockedPrivacyPostById = async (id: string): Promise<Post | undefined> => {
  const posts = await readUnlockedPrivacyPosts();
  return posts.find((post) => post.id === id);
};

export interface PrivacySearchResult {
  post: PostSearchResult;
  score: number;
  dateTimestamp: number;
}

export const searchPrivacyPosts = (
  posts: Post[],
  query: string,
  options: { scope?: PostSearchScope } = {},
): PrivacySearchResult[] => {
  const normalizedQuery = normalizeSearchText(query);
  const scope = options.scope ?? 'all';

  if (!normalizedQuery) {
    return [];
  }

  const terms = normalizedQuery.split(' ').filter(Boolean);
  return posts
    .map((post) => {
      const fields =
        scope === 'title'
          ? [{ value: normalizeSearchText(post.title), weight: 8 }]
          : scope === 'category'
            ? [{ value: normalizeSearchText(post.category), weight: 6 }]
            : scope === 'content'
              ? [
                  { value: normalizeSearchText(post.excerpt), weight: 2 },
                  { value: normalizeSearchText(post.searchText ?? post.content), weight: 1 },
                ]
              : [
                  { value: normalizeSearchText(post.title), weight: 8 },
                  { value: normalizeSearchText(post.category), weight: 4 },
                  { value: normalizeSearchText(post.excerpt), weight: 2 },
                  { value: normalizeSearchText(post.searchText ?? post.content), weight: 1 },
                ];

      let score = 0;
      const matchedTerms = new Set<string>();

      fields.forEach(({ value, weight }) => {
        score += getFieldMatchScore(value, terms, normalizedQuery, weight);
        terms.forEach((term) => {
          if (value.includes(term)) {
            matchedTerms.add(term);
          }
        });
      });

      if (scope === 'all') {
        post.tags.forEach((tag) => {
          const normalizedTag = normalizeSearchText(tag);
          score += getFieldMatchScore(normalizedTag, terms, normalizedQuery, 5);
          terms.forEach((term) => {
            if (normalizedTag.includes(term)) {
              matchedTerms.add(term);
            }
          });
        });
      }

      return {
        post: toPrivacyPostMetadata(post),
        score,
        matchedTerms,
      };
    })
    .filter(({ score, matchedTerms }) => score > 0 && matchedTerms.size === terms.length)
    .map(({ post, score }) => ({
      post,
      score,
      dateTimestamp: getDateTimestamp(post.date),
    }))
    .sort((a, b) => b.score - a.score || b.dateTimestamp - a.dateTimestamp);
};
