---
id: lcsaf-seek-link-list-0x01
title: 灵茶山艾府 - 遍历链表训练
excerpt: 遍历链表
category: 算法
tags:
  - 日常
  - 链表
  - 遍历链表
author: Marvel-L
rank: 黄金
series: false
draft: false
coverImage: /posts-img/算法/芝麻凛学链表.jpeg
---

# 1290. 二进制链表转整数

题目连接 : https://leetcode.cn/problems/convert-binary-number-in-a-linked-list-to-integer/description/

给你一个单链表的引用结点 head。链表中每个结点的值不是 0 就是 1。已知此链表是一个整数数字的二进制表示形式。

请你返回该链表所表示数字的 十进制值 。

最高位 在链表的头部。

## 思路

1. 注意的是 ==我们最高位在链表头==

2. 因此我们首先遍历一遍 ==求一次链表出长度==， 这里需要注意使用 `dummy` 防止原链表被破坏

3. 我们再次遍历原链表，使用 `<<` 进行按位处理

## Code 

```go
func getDecimalValue(head *ListNode) int {
    val := 0 
    idx := -1

    dummy := head 
    for dummy != nil {
        idx  ++ 
        dummy = dummy.Next
    }

    for head != nil {
        val += (head.Val << idx)
        idx -- 
        head = head.Next
    }
    return val 
}
```

# 2058. 找出临界点之间的最小和最大距离

题目链接 : https://leetcode.cn/problems/find-the-minimum-and-maximum-number-of-nodes-between-critical-points/

链表中的 临界点 定义为一个 局部极大值点 或 局部极小值点 。

如果当前节点的值 严格大于 前一个节点和后一个节点，那么这个节点就是一个  局部极大值点 。

如果当前节点的值 严格小于 前一个节点和后一个节点，那么这个节点就是一个  局部极小值点 。

注意：节点只有在同时存在前一个节点和后一个节点的情况下，才能成为一个 局部极大值点 / 极小值点 。

给你一个链表 head ，返回一个长度为 2 的数组`[minDistance, maxDistance]` ，其中 minDistance 是任意两个不同临界点之间的最小距离，maxDistance 是任意两个不同临界点之间的最大距离。如果临界点少于两个，则返回 [-1，-1] 。

## 思路

这个题屁话有点多

1. 让我们拆解出 ==波峰和波谷==, 我们可以引入 ==`pre`== ，来表示前一个节点

2. 按照题意找出 波峰和波谷 放入我们的 辅助数组中

3. 求解输出

## Code

```go
func nodesBetweenCriticalPoints(head *ListNode) []int {
    var pre *ListNode = nil 
    
    idx := 0 
    sp := make([]int, 0 )
    for head != nil {
        idx ++ 
        if pre != nil && head.Next != nil  {
            if pre.Val  > head.Val && head.Val < head.Next.Val{
                sp = append(sp, idx)
            }
            if pre.Val  < head.Val && head.Val > head.Next.Val{
                sp = append(sp, idx)
            }
        }
        pre = head 
        head = head.Next
    }
    if len(sp) < 2 {
        return []int{-1,-1}
    }
    minDistance := 0x3f3f3f3f

    for i := 1 ; i < len(sp) ; i ++ {
        minDistance = min(minDistance, sp[i] - sp[i - 1])
    }

    return []int{minDistance, sp[len(sp) - 1] - sp[0]}
}
```

# 2181. 合并零之间的节点

题目链接 : https://leetcode.cn/problems/merge-nodes-in-between-zeros/description/

给你一个链表的头节点 head ，该链表包含由 0 分隔开的一连串整数。链表的 开端 和 末尾 的节点都满足 Node.val == 0 。

对于每两个相邻的 0 ，请你将它们之间的所有节点合并成一个节点，其值是所有已合并节点的值之和。然后将所有 0 移除，修改后的链表不应该含有任何 0 。

返回修改后链表的头节点 head 。

## 思路

1. 没什么好思路 看着直接暴力即可

2. 创建一个==新链表== , 使用 `dummy` 来进行移动

3. 对于遇到 0 的时候，我们进行一次结果计算


## Code 

```go
func mergeNodes(head *ListNode) *ListNode {
    newList := &ListNode{Next: nil}
    dummy := newList
    tVal := 0 

    for head != nil {
        if head.Val == 0 && tVal != 0 {
            dummy.Next = &ListNode{Val: tVal}
            dummy = dummy.Next
            tVal = 0 
        }else {
            tVal += head.Val
        }
        head = head.Next
    }
    return newList.Next
}
```


# 725. 分隔链表

题目链接 : https://leetcode.cn/problems/split-linked-list-in-parts/description/


给你一个头结点为 head 的单链表和一个整数 k ，请你设计一个算法将链表分隔为 k 个连续的部分。

每部分的长度应该尽可能的相等：任意两部分的长度差距不能超过 1 。这可能会导致有些部分为 null 。

这 k 个部分应该按照在链表中出现的顺序排列，并且排在前面的部分的长度应该大于或等于排在后面的长度。

返回一个由上述 k 部分组成的数组。

## 思路

直接 ==模拟== 的题目

1. 先计算出每一个 chunk , 同时计算出每一个余数

2. 定义 ==临时结果变量，需要注意的是需要额外定义 dummy== 

3. 每次跑完一个切片的时候 额外开一个新切片

4. 记录数据

5. 额外处理一下 k > n  的情况

## Code 

```go
func splitListToParts(head *ListNode, k int) []*ListNode {
    lenDummdy := head

    n := 0
    for lenDummdy != nil {
        n++
        lenDummdy = lenDummdy.Next
    }

    base := n / k
    extr := n % k

    ans := make([]*ListNode, 0)

    idx := 0
    var node *ListNode = nil
    var dummyNode *ListNode
    for head != nil {
        idx++
        if node == nil {
            node = &ListNode{
                Val: head.Val,
            }
            dummyNode = node
        } else {
            dummyNode.Next = &ListNode{
                Val: head.Val,
            }
            dummyNode = dummyNode.Next
        }

        if extr != 0 && idx%(base+1) == 0 {
            ans = append(ans, node)
            extr--
            idx = 0
            node = nil
        } else if extr == 0 && idx%base == 0 {
            ans = append(ans, node)
            idx = 0
            node = nil
        }
        head = head.Next
    }
    if k > n {
        for i := k - n; i > 0; i-- {
            ans = append(ans, nil)
        }
    }
    return ans
}
```
