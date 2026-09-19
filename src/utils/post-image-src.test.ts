import { describe, expect, it } from 'vitest';
import { siblingContentImageUrl, siblingImageRelative, siblingPostImageUrl } from './post-image-src.mjs';

describe('siblingPostImageUrl', () => {
  const filePath = '/posts/life/choose/北京工作切换.md';

  it('把文章旁边的相对图片改写到 /posts-img', () => {
    expect(siblingPostImageUrl(filePath, 'bei_jing.jpg')).toBe('/posts-img/life/choose/bei_jing.jpg');
    expect(siblingPostImageUrl(filePath, './my_baby_and_me.jpg')).toBe('/posts-img/life/choose/my_baby_and_me.jpg');
  });

  it('磁盘绝对路径同样能定位到 posts 目录', () => {
    expect(siblingPostImageUrl('/Users/me/Blog-marvel/posts/life/choose/北京工作切换.md', 'bei_jing.jpg')).toBe(
      '/posts-img/life/choose/bei_jing.jpg',
    );
  });

  it('外链、站内绝对路径和跳出 posts 的路径不改写', () => {
    expect(siblingPostImageUrl(filePath, 'https://cdn.example.com/a.jpg')).toBeUndefined();
    expect(siblingPostImageUrl(filePath, '/posts-img/a.jpg')).toBeUndefined();
    expect(siblingPostImageUrl(filePath, '../../../secret.jpg')).toBeUndefined();
    expect(siblingPostImageUrl(filePath, 'notes.md')).toBeUndefined();
  });

  it('relative 与 URL 对应', () => {
    expect(siblingImageRelative(filePath, 'bei_jing.jpg')).toBe('life/choose/bei_jing.jpg');
  });
});

describe('siblingContentImageUrl — 说说', () => {
  const filePath = '/shuoshuo/26-09-19/26-09-19.md';
  const options = { contentDir: 'shuoshuo', publicPrefix: '/shuoshuo-img' };

  it('把说说旁边的相对图片改写到 /shuoshuo-img', () => {
    expect(siblingContentImageUrl(filePath, 'img.png', options)).toBe('/shuoshuo-img/26-09-19/img.png');
    expect(siblingContentImageUrl(filePath, './img.png', options)).toBe('/shuoshuo-img/26-09-19/img.png');
    expect(siblingImageRelative(filePath, 'img.png', options)).toBe('26-09-19/img.png');
  });

  it('外链和跳出 shuoshuo 的路径不改写', () => {
    expect(siblingContentImageUrl(filePath, 'https://cdn.example.com/a.jpg', options)).toBeUndefined();
    expect(siblingContentImageUrl(filePath, '../../../secret.png', options)).toBeUndefined();
  });
});
