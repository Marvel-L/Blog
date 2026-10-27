---
id: flatten-binary-tree-to-linked-list-0x01
title: "[待定]114. 二叉树展开为链表"
excerpt: "[待定]114. 二叉树展开为链表"
category: 算法
tags:
  - 树
  - dfs
author: Marvel-L
rank: 星耀
series: false
draft: false
tbd: true
coverImage: /posts-img/算法/二叉树展开为链表.png
---

## Code

```go
func dfs(node *TreeNode, isRight bool) *TreeNode {
if node == nil {
return nil
}
if node != nil && node.Left == nil && node.Right == nil  {
return node
} // 返回叶子节点

var temp *TreeNode
if !isRight {
temp = node.Left.Left
node.Left.Left = node.Right
}else  {
temp = node.Right.Right
node.Right.Right = node.Left
}
dfs(temp, isRight)
return nil
}

func flatten(root *TreeNode)  {
if root == nil || (root.Left == nil && root.Right == nil){
return
}
dfs(root.Left, false)
dfs(root.Right, true)
dummy := root.Left
for dummy.Left  != nil && dummy.Right != nil  {
dummy = dummy.Left
}
dummy.Left = root.Right
return
}
```