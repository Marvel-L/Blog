---
id: binary-tree-right-side-view-0x01
title: 二叉树的右视图
excerpt: 二叉树的右视图
category: 算法
tags:
  - 树
  - 树的BFS遍历
  - 树的高度
author: Marvel-L
rank: 钻石
series: false
draft: false
coverImage: /posts-img/算法/二叉树的右视图.png
---

# 二叉树的右视图

题目链接 : https://leetcode.cn/problems/binary-tree-right-side-view/description/?envType=study-plan-v2&envId=top-100-liked

给定一个二叉树的 根节点 root，想象自己站在它的右侧，按照从顶部到底部的顺序，返回从右侧所能看到的节点值。

## 难点

1. 从右边考虑 不太符合 DFS 的思路

## 思路

1. 首先想到的是 BFS，对于每一层 我们只考虑最后一层节点 

2. 因此我们可以在 BFS 的过程中使用 ==last 记录最后一个节点== 不过需要注意的是 ==list 中也有一个 Value 字段==

那么 DFS 的思路怎么来呢

1. 对于 DFS，每一层对应的是 ==树的高度== 

2. 我们考虑从右边开始 DFS，然后再递归左子树

3. 那么 ==我们第一次遇到 高度 = 我们统计的长度的时候 就说明到了== 

4. 换句话说就是 每一层第一次遇见的数

## BFS Code 
```go
func rightSideView(root *TreeNode) []int {
    
    q := list.New() 
    q.PushBack(root)

    var last *TreeNode
    res := make([]int,0)

    for q.Len() > 0 {
        sz := q.Len()
        for i := 0 ; i < sz ; i ++ {
            front := q.Front()
            q.Remove(front)
    
            node := front.Value.(*TreeNode)
            last = node 
            if node != nil && node.Left != nil {
                q.PushBack(node.Left)
            }
            if node != nil && node.Right != nil {
                q.PushBack(node.Right)
            }
        }
        if last != nil {
            res = append(res,last.Val)
        }
    }
    return res 
}
```
## DFS Code

```go
func rightSideView(root *TreeNode) []int {
    var dfs func(*TreeNode, int)
    res := make([]int,0)
    dfs = func(node *TreeNode, depth int) {
        if node == nil {
            return 
        }
        if depth == len(res) {
            res = append(res, node.Val)
        }
        dfs(node.Right, depth + 1)
        dfs(node.Left, depth + 1)
    }
    dfs(root,0)
    return res 
}
```