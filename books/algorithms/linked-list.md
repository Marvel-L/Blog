---
id: linked-list
title: 链表：从指针关系入手
group: 数据结构
relatedPostIds:
  - lcsaf-seek-link-list-0x01
  - lcsaf-reverse-link-0x01
  - lcsaf-add-two-numbers-ii-0x01
---

# 链表：从指针关系入手

链表题的难点通常不是语法，而是同时维护多个节点之间的关系。动手前先回答三个问题：当前节点是谁、下一步要保存什么、修改后哪条边会消失。

## 基础框架

```text
保存 next → 修改连接 → 移动当前指针
```

## 常见题型

- 遍历与计数
- 快慢指针
- 反转区间
- 删除或插入节点
- 合并多个链表

处理边界时优先考虑虚拟头节点，它能统一“修改头节点”和“修改中间节点”的分支。
