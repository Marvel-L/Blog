---
id: xiaolin_algo_week2_day4
title: 算法打卡冲刺 week2 day4
excerpt: 二叉树的相关操作
category: 算法
tags:
  - 算法打卡日常
  - 我的来时路
author: Marvel-L
rank: 白银
series: false
draft: false
coverImage: /posts-img/算法/小林_冲刺weekly/leetcode.png
---

# 226. 翻转二叉树

力扣链接： https://leetcode.cn/problems/invert-binary-tree/

题目：给你一个树，翻转一下。

## 思路

按后序遍历处理，先递归左右子树，再在当前节点交换左右孩子。

## Code

```go
func dfs(root *TreeNode) *TreeNode {
    if root == nil {
        return nil
    }
    left := dfs(root.Left)
    right := dfs(root.Right)
    root.Left = right
    root.Right = left
    return root
}

func invertTree(root *TreeNode) *TreeNode {
    return dfs(root)
}
```

# 101. 对称二叉树

力扣链接： https://leetcode.cn/problems/symmetric-tree/

题目：判断二叉树是否对称。

## 思路

这里使用层序遍历。逐层取出节点，如果某一层从左到右和从右到左不一致，就不是对称二叉树。

为了保留空位信息，空节点用 `-101` 占位，这样可以一起比较结构和数值。

## Code

```go
func bfs(root *TreeNode) bool {
    if root == nil {
        return true
    }

    q := list.New()
    q.PushBack(root)

    for q.Len() > 0 {
        n := q.Len()
        level := make([]int, 0, n)
        for i := 0; i < n; i++ {
            front := q.Front()
            q.Remove(front)

            node := front.Value.(*TreeNode)
            if node != nil {
                level = append(level, node.Val)
            } else {
                level = append(level, -101)
            }
            if node != nil {
                q.PushBack(node.Left)
                q.PushBack(node.Right)
            }
        }
        for i, j := 0, n-1; i < j; i, j = i+1, j-1 {
            if level[i] != level[j] {
                return false
            }
        }
    }
    return true
}

func isSymmetric(root *TreeNode) bool {
    return bfs(root)
}
```
