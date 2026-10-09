---
id: xiaolin_algo_week2_day3
title: 算法打卡冲刺 week2 day3
excerpt: 树的遍历
category: 算法
tags:
  - 日常
  - 我的来时路
author: Marvel-L
rank: 白银
series: false
draft: false
---

# 144. 二叉树的前序遍历

力扣链接 : https://leetcode.cn/problems/binary-tree-preorder-traversal/description/

给定一个二叉树的根节点 root ，返回 它的 前序遍历 。

## 思路

前序遍历的顺序是：根节点 -> 左子树 -> 右子树。

使用 ==DFS== 进行遍历, 优先加入根节点 然后遍历左右节点

额外需要注意 题目可能会传递 ==空的Root==

## Code 

```go
func dfs(u *TreeNode, res []int) []int {
    if u == nil {
        return res
    }
    res = append(res, u.Val)
    res = dfs(u.Left, res)
    res = dfs(u.Right, res)
    return res
}

func preorderTraversal(root *TreeNode) []int {
    return dfs(root, make([]int,0,10))
}
```

# 145. 二叉树的后序遍历, 94. 二叉树的中序遍历

力扣链接 : 

https://leetcode.cn/problems/binary-tree-postorder-traversal/description/,

https://leetcode.cn/problems/binary-tree-inorder-traversal/description/

题目描述 :

给定一个二叉树的根节点 root ，返回 它的 后序遍历 。

给定一个二叉树的根节点 root ，返回 它的 中序遍历 。

## 思路

根据要求，在 ==后序遍历== 的基础上调整一下 输出答案的顺序

## Code
 
**中序遍历 :**

```go
 func dfs(u *TreeNode, res []int) []int {
    if u == nil {
        return res
    }
    res = dfs(u.Left, res)
    res = append(res, u.Val)
    res = dfs(u.Right, res)
    return res
}

func inorderTraversal(root *TreeNode) []int {
    return dfs(root, make([]int,0,10))
}
```


**后序遍历 :**

```go
func dfs(u *TreeNode, res []int) []int {
    if u == nil {
        return res
    }
    res = dfs(u.Left, res)
    res = dfs(u.Right, res)
    res = append(res, u.Val)
    return res
}

func postorderTraversal(root *TreeNode) []int {
    return dfs(root, make([]int,0,10))
}
```

# 102. 二叉树的层序遍历

力扣链接 : https://leetcode.cn/problems/binary-tree-level-order-traversal/description/

题目描述 :

给定一个二叉树的根节点 root ，返回 它的 层序遍历 。

## 思路

层序使用 ==BFS== 的思路 ，不过在 Golang 没有 Queue 的概念，使用起来比较麻烦

这里额外使用 `list` 来进行实现

整个的思路如下

1. 把当前这一层的节点加入到 我们的队列中
2. ==弹出当前这一层的节点，并把下一层的节点加入到队列中==
3. 将这一层弹出的节点加入到 结果数组里面

## Code

```go
func bfs(root *TreeNode) [][]int  {
    if root == nil  {
        return [][]int{}
    }
    res := make([][]int,0)
    q := list.New() 
    q.PushBack(root)

    for q.Len() > 0 {
        size := q.Len() 
        level := make([]int,0,size)
        for i := 0 ; i < size ; i ++ {
            front := q.Front() 
            q.Remove(front)
            
            node := front.Value.(*TreeNode)
            level = append(level, node.Val)
            if node.Left != nil {
                q.PushBack(node.Left)
            }
            if node.Right != nil {
                q.PushBack(node.Right)
            }
        }
        res = append(res, level)
    }
    return res 
}

func levelOrder(root *TreeNode) [][]int {
    return bfs(root)
}
```
