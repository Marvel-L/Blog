---
id: xiaolin_algo_week2_day5
title: 算法打卡冲刺 week2 day5
excerpt: 树的遍历
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

## 110. 平衡二叉树

力扣链接： https://leetcode.cn/problems/balanced-binary-tree/

题目：判断是不是平衡，左右子树高度差不超过 1。

## 思路

后序遍历，先计算左右子树高度。

到了当前节点时，如果左右子树高度差大于 1，直接返回 `-1` 表示不平衡。

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
    if right == -1 {
        return -1
    }

    if left-right > 1 || right-left > 1 {
        return -1
    }
    if left > right {
        return left + 1
    }
    return right + 1
}

func isBalanced(root *TreeNode) bool {
    return dfs(root) != -1
}
```

# 257. 二叉树的所有路径

力扣链接： https://leetcode.cn/problems/binary-tree-paths/

题目：返回根节点到叶子节点的所有路径。

## 思路

先序遍历。

1. 对于当前节点，如果左右节点都等于 `nil`，就把当前路径加入答案。
2. 否则继续递归左右子树，并把路径下传。

## Code

```go
var (
    res []string
)

func dfs(node *TreeNode, path string) {
    if node == nil {
        return
    }
    if path == "" {
        path = strconv.Itoa(node.Val)
    } else {
        path = path + "->" + strconv.Itoa(node.Val)
    }
    if node.Left == nil && node.Right == nil {
        res = append(res, path)
        return
    }
    dfs(node.Left, path)
    dfs(node.Right, path)
}

func binaryTreePaths(root *TreeNode) []string {
    res = make([]string, 0)
    dfs(root, "")
    return res
}
```

# 404. 左叶子之和

力扣链接： https://leetcode.cn/problems/sum-of-left-leaves/

题目：计算左叶子的和。

## 思路

直接递归。

1. 对当前节点判断左节点是否是叶子节点，如果是叶子节点就累加。
2. 否则继续递归左右子树。

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

    res += dfs(root.Left)
    res += dfs(root.Right)

    return res
}

func sumOfLeftLeaves(root *TreeNode) int {
    return dfs(root)
}
```

# 513. 找树左下角的值

力扣链接： https://leetcode.cn/problems/find-bottom-left-tree-value/

题目：找最后一层最左边的值。

## 思路

直接进行层序遍历。

1. 每层开始时记录第一个节点。
2. 每一层都更新结果，最后一层的第一个节点就是答案。

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
        for i := 0; i < sz; i++ {
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
