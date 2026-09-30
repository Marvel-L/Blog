import type { PrivacyPost } from '@/types';
import type { EncryptedPrivacyPayload } from '@/utils/privacyCrypto';
import { decryptPrivacyPayload } from '@/utils/privacyCrypto';

const generatedPrivacyModules = import.meta.glob<EncryptedPrivacyPayload>('../../generated/privacy-posts.json', {
  eager: true,
  import: 'default',
});

const encryptedPrivacyPayload = Object.values(generatedPrivacyModules)[0] ?? null;
const unlockedCache = new Map<string, PrivacyPost[]>();

const isPrivacyPost = (value: unknown): value is PrivacyPost => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as PrivacyPost;
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

export const unlockPrivacyPosts = async (password: string): Promise<PrivacyPost[]> => {
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
