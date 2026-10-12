---
id: xiaolin_algo_week2_day4
title: 算法打卡冲刺 week2 day4
excerpt: 树的遍历
category: 算法
tags:
  - 日常
  - 我的来时路
author: Marvel-L
rank: 白银
series: false
draft: false
coverImage: /posts-img/算法/小林_冲刺weekly/leetcode.png
---

## 110.平衡二叉树

力扣链接： https://leetcode.cn/problems/balanced-binary-tree/
    
题目： 判断是不是平衡，左右子树高度差不超过1

## 思路

后序遍历，我们需要先计算出 左右子树的高度

在当前节点的时候判断 ，左右子树高度是否相差较大 如果很大 那么返回 -1 

## Code 

```go
func dfs(root *TreeNode) int {
    if root == nil {
        return 0 
    }
    left := dfs(root.Left)
    if left == -1 {
        return -1
    }

    right := dfs(root.Right)
    if right == -1  {
        return -1 
    }

    if left - right > 1 || right - left > 1 {
        return -1
    }
    if left > right {
        return left + 1
    }
    return right  + 1
}


func isBalanced(root *TreeNode) bool {
    return dfs(root) != -1
}
```
# 257. 二叉树的所有路径

力扣链接：  https://leetcode.cn/problems/binary-tree-paths/

题目： 返回根节点到叶子节点的所有路径
     
## 思路

我们先序遍历

1. 对于当前节点，如果左右节点都等于 nil  我们计算答案
2. 否则我们递归左右子树，并且下传答案

## Code

```go
var (
    res []string 
)

func dfs(node *TreeNode, path string)  {
    if node == nil {
        return 
    }
    if path == "" {
        path = strconv.Itoa(node.Val)
    }else {
        path = path + "->" +  strconv.Itoa(node.Val)
    }
    if node.Left == nil && node.Right == nil {
        res = append(res, path)
        return 
    }
    dfs(node.Left, path)
    dfs(node.Right,path)
    
}

func binaryTreePaths(root *TreeNode) []string {
    res = make([]string,0)
    dfs(root, "")
    return res 
}
```

# 404.左叶子之和

力扣链接：  https://leetcode.cn/problems/sum-of-left-leaves/

题目：  计算左叶子的和

## 思路

直接递归

1. 对于当前节点考虑 , 左节点是否是叶子结点 如果是叶子结点 那么计算
2. 否则的话 进行递归

## Code

```go
func dfs(root *TreeNode) int {
    if root == nil {
        return 0 
    }
    res := 0

    if root.Left != nil && root.Left.Left == nil && root.Left.Right == nil {
        res += root.Left.Val
    }

    if root != nil {
        res += dfs(root.Left)
        res += dfs(root.Right)
    }

    return res 
}

func sumOfLeftLeaves(root *TreeNode) int {
    return dfs(root)
}
```

# 513.找树左下角的值

力扣链接：  https://leetcode.cn/problems/find-bottom-left-tree-value/

题目： 就找最后一层的最左的值

## 思路

1. 直接强制进行层序遍历

2. 每一层都更新结果，那么最后一层的第一个就是最左下脚

## Code

```go
func bfs(root *TreeNode) int {
    if root == nil {
        return 0
    }
    q := list.New()
    q.PushBack(root)

    last := 0 
    for q.Len() > 0 {
        sz := q.Len() 
        for i := 0 ; i < sz ; i ++ {
            front := q.Front() 
            q.Remove(front)

            node := front.Value.(*TreeNode)
            if i == 0 {
                last = node.Val
            }
            if node.Left != nil {
                q.PushBack(node.Left)
            }
            if node.Right != nil {
                q.PushBack(node.Right)
            }
        }
    }
    return last 
}

func findBottomLeftValue(root *TreeNode) int {
    return bfs(root)
}
```