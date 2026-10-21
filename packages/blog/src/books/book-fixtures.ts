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
  post('leetCode-hot-100', '算法', '/posts/算法/leetcode/hot100/index.md', { title: 'LeetCode Hot 100' }),
  post('lcsaf-reverse-link-0x01', '算法', '/posts/算法/链表/反转/index.md', { title: '反转链表' }),
  post('gcd_learning_0x01', '算法', '/posts/算法/数论/最大公约数/index.md', { title: '最大公约数' }),
  post('for-gamma-error-0x01', 'Golang', '/posts/golang/for/index.md', { title: 'Go For 循环' }),
  post('go-pointer-pass-by-value-0x01', 'Golang', '/posts/golang/指针/index.md', { title: 'Go 指针' }),
  post('cam-aim-tidy-0x01', '项目', '/posts/program/cam.md', { title: 'CAM 项目整理' }),
  post('volc-contract-process-reading-0x01', '项目', '/posts/program/volc.md', { title: '合同项目阅读' }),
  post('26-10-19-记录这几天', '日常', '/posts/life/recent.md', { title: '记录这几天' }),
];
