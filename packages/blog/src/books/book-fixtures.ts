import type { PostMetadata } from '@/types';
import type { BookPackageDefinition } from './books-core.mjs';

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

/** Fixed inputs keep UI/model tests independent of edits to the author's books. */
export const packageDefinitions: BookPackageDefinition[] = [
  {
    id: 'algorithms',
    name: '算法学习手册',
    subtitle: '把题目、方法与复盘组织成可连续阅读的知识包。',
    edition: 'ALGORITHM FIELD NOTES',
    accent: '#365348',
    chapters: [
      {
        id: 'start',
        title: '阅读指南',
        directory: ['开始'],
        content: '# 阅读指南\n\n## 使用方法\n\n先阅读方法，再练习题目。',
        relatedPostIds: ['leetCode-hot-100'],
      },
      {
        id: 'linked-list',
        title: '链表：从指针关系入手',
        directory: ['数据结构'],
        content: '# 链表：从指针关系入手\n\n## 基础框架\n\n先跟踪指针关系。\n\n## 常见题型\n\n反转链表。',
        relatedPostIds: ['lcsaf-reverse-link-0x01'],
      },
      {
        id: 'number-theory',
        title: '数论：最大公约数',
        directory: ['数学基础'],
        content:
          '# 数论：最大公约数\n\n## 实现\n\n```go\nfunc gcd(a, b int) int {\n    for b != 0 {\n        a, b = b, a%b\n    }\n    return a\n}\n```',
        relatedPostIds: ['gcd_learning_0x01'],
      },
    ],
  },
];
