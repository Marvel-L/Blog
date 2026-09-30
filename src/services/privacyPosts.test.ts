import { beforeEach, describe, expect, it } from 'vitest';
import { unlockPrivacyPosts } from './privacyPosts';

describe('privacyPosts', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('正确密码可以解锁隐私文章数据', async () => {
    const posts = await unlockPrivacyPosts('Mx179516');
    expect(Array.isArray(posts)).toBe(true);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0]).toMatchObject({
      id: 'private-welcome',
      title: '隐私区示例文章',
      category: '隐私',
    });
  });

  it('错误密码无法解锁隐私文章数据', async () => {
    await expect(unlockPrivacyPosts('wrong-password')).rejects.toThrow('Failed to decrypt privacy payload.');
  });
});
