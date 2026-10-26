---
id: kth-smallest-element-in-a-bst-0x01
title: 二叉搜索树中第 K 小的元素
excerpt: 二叉搜索树中第 K 小的元素
category: 算法
tags:
  - 树
  - BST
author: Marvel-L
rank: 钻石
series: false
draft: false
coverImage: /posts-img/算法/芝麻凛学链表.jpeg
---


# 230. 二叉搜索树中第 K 小的元素

题目链接 : https://leetcode.cn/problems/kth-smallest-element-in-a-bst/description/?envType=study-plan-v2&envId=top-100-liked

给定一个二叉搜索树的根节点 `root` ，和一个整数 `k` ，请你设计一个算法查找其中第 `k` 小的元素（k 从 1 开始计数）。

## 难点

1. 题目给的 ==二叉搜索树== 的条件需要用上， 一开始想着是额外构建一个堆 然后将节点全都读一遍再放入到堆里面进行操作

2. 但是二叉搜索树本来就满足 ==左节点已经小于根节点，右节点已经大于根节点== 的情况


## 思路

1. 由于给定的是二叉搜索树，因此是满足 左根右的设定，即我们如果按照中序遍历来进行处理的话 会得到一个顺序数组

2. 因此我们只需要在遍历中序遍历的时候 同步记录是第几个即可

3. 当我们==左子树==枚举完之后，则代表当前这个节点是 第K个节点

## Code

```go
var ans int 
func kthSmallest(root *TreeNode, k int) int {
    var dfs func(*TreeNode)
    dfs = func(node *TreeNode) {
        if node == nil  || k < 0 {
            return 
        }

        dfs(node.Left)
        k -- 
        if k == 0 {
            ans = node.Val
        }
        dfs(node.Right)
    }
    dfs(root)
    return ans 
}
```


