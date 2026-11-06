import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostMetadata } from '@/types';
import { useArticlePosts } from './useArticlePosts';
import { getPosts } from '@/services/posts';
import { readUnlockedPrivacyPosts } from '@/services/privacyPosts';
import { PRIVACY_ACCESS_CHANGE_EVENT } from '@/utils/privacyAccess';

const { publicPost, access } = vi.hoisted(() => ({
  publicPost: {
    id: 'public',
    title: '公开文章',
    excerpt: '测试摘要',
    date: '2026-01-01',
    category: '技术',
    tags: [],
    filePath: '/posts/public.md',
    readTime: '1分钟阅读',
  } satisfies PostMetadata,
  access: { unlocked: false },
}));

vi.mock('@/services/posts', () => ({
  getInitialPosts: () => [publicPost],
  getPosts: vi.fn(),
}));
vi.mock('@/services/privacyPosts', () => ({
  getCachedPrivacyPostMetadata: () => [],
  readUnlockedPrivacyPosts: vi.fn(),
  toPrivacyPostMetadata: (post: PostMetadata) => post,
}));
vi.mock('@/utils/privacyAccess', () => ({
  PRIVACY_ACCESS_CHANGE_EVENT: 'test:privacy-change',
  readPrivacyAccess: () => access.unlocked,
}));

describe('useArticlePosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.unlocked = false;
    vi.mocked(getPosts).mockResolvedValue([publicPost]);
    vi.mocked(readUnlockedPrivacyPosts).mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it('构建期文章同步显示，公开状态不重复请求数据', () => {
    const { result } = renderHook(() => useArticlePosts());
    expect(result.current.allPosts).toEqual([publicPost]);
    expect(result.current.categories).toEqual(['技术']);
    expect(result.current.loading).toBe(false);
    expect(getPosts).not.toHaveBeenCalled();
  });

  it('解锁加载失败如实提示，重试后恢复并只请求一次公开数据', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    access.unlocked = true;
    vi.mocked(readUnlockedPrivacyPosts).mockRejectedValueOnce(new Error('加载失败'));
    const { result } = renderHook(() => useArticlePosts());
    await waitFor(() => expect(result.current.loadError).toContain('文章列表加载失败'));
    expect(result.current.allPosts).toEqual([publicPost]);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.loadError).toBeNull());
    expect(getPosts).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  it('重新锁定后忽略旧解锁请求的迟到结果', async () => {
    let resolveHidden!: (posts: Awaited<ReturnType<typeof readUnlockedPrivacyPosts>>) => void;
    access.unlocked = true;
    vi.mocked(readUnlockedPrivacyPosts).mockReturnValue(
      new Promise((resolve) => {
        resolveHidden = resolve;
      }),
    );
    const { result } = renderHook(() => useArticlePosts());
    await waitFor(() => expect(readUnlockedPrivacyPosts).toHaveBeenCalledTimes(1));
    act(() => {
      access.unlocked = false;
      window.dispatchEvent(new Event(PRIVACY_ACCESS_CHANGE_EVENT));
    });
    await act(async () => {
      resolveHidden([{ ...publicPost, id: 'hidden', content: '隐藏正文', needHidden: true }]);
    });
    expect(result.current.allPosts).toEqual([publicPost]);
    expect(result.current.categories).toEqual(['技术']);
  });
});
