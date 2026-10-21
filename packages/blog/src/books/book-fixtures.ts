import type { PostMetadata } from '@/types';
export const post = (
  id: string,
  category: string,
  filePath: string,
  extra: Partial<PostMetadata> = {},
): PostMetadata => ({
  id,
  title: id,
  category,
  filePath,
  excerpt: `${id} 摘要`,
  date: '2026-10-01',
  tags: ['笔记'],
  readTime: '3 分钟',
  ...extra,
});
export const catalog = [
  post('reverse', '算法', '/posts/算法/链表/反转/反转链表/index.md', { title: '反转链表' }),
  post('merge', '算法', '/posts/算法/链表/合并/两数相加/index.md', { title: '两数相加' }),
  post('gcd', '算法', '/posts/算法/数论/最大公约数/index.md', { title: '最大公约数' }),
  post('go-pointer', 'Golang', '/posts/golang/指针/为什么传了指针/index.md', { title: 'Go 指针' }),
];
