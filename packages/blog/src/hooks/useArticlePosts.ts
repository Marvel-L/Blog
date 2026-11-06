/**
 * 首页与文章列表共享文章数据：同步首帧、重试加载与密码解锁后的增量刷新。
 */
import { useEffect, useMemo, useState } from 'react';
import type { PostMetadata } from '@/types';
import { getInitialPosts, getPosts } from '@/services/posts';
import { getCachedPrivacyPostMetadata, readUnlockedPrivacyPosts, toPrivacyPostMetadata } from '@/services/privacyPosts';
import { PRIVACY_ACCESS_CHANGE_EVENT, readPrivacyAccess } from '@/utils/privacyAccess';
import { sortPosts } from '@/utils/postSorting';

const initialPosts = getInitialPosts();
const mergePosts = (publicPosts: PostMetadata[], hiddenPosts: PostMetadata[]) =>
  sortPosts(Array.from(new Map([...publicPosts, ...hiddenPosts].map((post) => [post.id, post])).values()), 'newest');

export const useArticlePosts = () => {
  const [allPosts, setAllPosts] = useState(initialPosts);
  const [loading, setLoading] = useState(initialPosts.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [privacyRefreshVersion, setPrivacyRefreshVersion] = useState(0);
  const categories = useMemo(() => Array.from(new Set(allPosts.map((post) => post.category))), [allPosts]);

  useEffect(() => {
    if (readPrivacyAccess()) {
      const cachedPosts = getCachedPrivacyPostMetadata();
      if (cachedPosts.length > 0) setAllPosts(mergePosts(initialPosts, cachedPosts));
    }
    const handlePrivacyChange = () => setPrivacyRefreshVersion((version) => version + 1);
    window.addEventListener(PRIVACY_ACCESS_CHANGE_EVENT, handlePrivacyChange);
    return () => window.removeEventListener(PRIVACY_ACCESS_CHANGE_EVENT, handlePrivacyChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unlocked = readPrivacyAccess();
    const refreshInBackground = initialPosts.length > 0 && loadAttempt === 0;
    if (refreshInBackground && !unlocked) {
      setAllPosts(initialPosts);
      setLoadError(null);
      setLoading(false);
      return;
    }

    const load = async () => {
      if (!refreshInBackground) setLoading(true);
      try {
        const publicPosts = loadAttempt > 0 || initialPosts.length === 0 ? await getPosts() : initialPosts;
        if (cancelled) return;
        const hiddenPosts = unlocked ? await readUnlockedPrivacyPosts() : [];
        if (cancelled) return;
        setAllPosts(unlocked ? mergePosts(publicPosts, hiddenPosts.map(toPrivacyPostMetadata)) : publicPosts);
        setLoadError(null);
      } catch (error) {
        console.error('文章列表加载失败:', error);
        if (!cancelled) setLoadError('文章列表加载失败，请稍后刷新重试。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, privacyRefreshVersion]);

  return { allPosts, categories, loading, loadError, reload: () => setLoadAttempt((attempt) => attempt + 1) };
};
