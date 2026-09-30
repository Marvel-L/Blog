import { beforeEach, describe, expect, it } from 'vitest';
import { unlockPrivacyPosts } from './privacyPosts';

describe('privacyPosts', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('正确密码可以解锁隐私文章数据', async () => {
    const posts = await unlockPrivacyPosts('Mx179516');
    expect(Array.isArray(posts)).toBe(true);
    if (posts.length > 0) {
      expect(posts[0]).toMatchObject({
        id: expect.any(String),
        title: expect.any(String),
        category: expect.any(String),
        content: expect.any(String),
      });
    }
  });

  it('错误密码无法解锁隐私文章数据', async () => {
    await expect(unlockPrivacyPosts('wrong-password')).rejects.toThrow('Failed to decrypt privacy payload.');
  });
});
