---
id: lcsaf-fast-slow-link-list-0x01
title: 灵茶山艾府 - 链表快慢指针
excerpt: 快慢指针
category: 算法
tags:
  - 日常
  - 链表
  - 快慢指针
author: Marvel-L
rank: 钻石
series: false
draft: false
coverImage: /posts-img/算法/芝麻凛学链表.jpeg
---

# 876. 链表的中间结点

题目链接 : https://leetcode.cn/problems/middle-of-the-linked-list/description/

给你单链表的头结点 head ，请你找出并返回链表的中间结点。

如果有两个中间结点，则返回第二个中间结点。

## 思路

我们从图中可以看到

1. 第一个图 一共 ==5个节点 4条边==, 我们想要知道第三个节点,即我们要走 ==2条边== 

2. 第二个图 一共 ==6个节点 5条边==, 我们想要知道第四个节点,即我们要走 ==3条边== 

我们从边的角度考虑，如果 ==(边+1)/2== 即是我们要走的边，那么这个 ==+1什么意思呢，我们可以看作 tail->nil== 这条边

那么我们==怎么在链表中做到整除==

1. 我们可以引入一个 快指针，让他先走 ==2步== 慢指针只走一步，那么当快指针走到头的时候，即整个距离 /2 

![img.png](img.png)

![img_1.png](img_1.png)

## Code
 
```go
func middleNode(head *ListNode) *ListNode {
    fast, slow := head,head 
    for fast != nil && fast.Next != nil {
        fast = fast.Next.Next
        slow = slow.Next
    }
    return slow 
}
```