---
id: xiaolin_algo_week1_day3
title: 算法打卡冲刺 day3
excerpt: 我能复刻的路吗
category: 算法
tags:
  - 日常
  - 我的来时路
author: Marvel-L
rank: 青铜
featured: false
series: false
draft: false
---

# 02.07 链表相交

**力扣链接**: https://leetcode.cn/problems/intersection-of-two-linked-lists-lcci/

**题目**: 给你两个链表，让你返回两个链表的交点，如果相交则输出，否则返回 Nil 


## 过程

一开始以为是个暴力的做法 

我们遍历链表 A，对于每个节点都额外走一遍链表 B. 当我们 Value 相等的时候 我们额外判断一下 两个节点的 Next 是否相等

如果相等则说明相交

这个思路有很大的问题

1. 整个时间复杂度过高
2. ==代码很复杂 ，这个 dummy 我还是根据习惯写出来的==

```go
func getIntersectionNode(headA, headB *ListNode) *ListNode {
    
    dummyA := &ListNode{Next: headA}
    dummyB := &ListNode{Next: headB}

    prevA := dummyA 
    for prevA != nil {
        if prevA.Next == nil {
            break 
        }
        prevB := dummyB
        for prevB != nil {
            if prevA.Next != prevB.Next{  // 当前节点相等
                prevB = prevB.Next
                continue 
            }
            if prevA.Next.Next == prevB.Next.Next {
                return prevA.Next.Next
            }
            prevB = prevB.Next
        }
    
        prevA = prevA.Next 
    }
    return nil 
}
```

## 正确思路

我们考虑 PA 和 PB 两个指针， 当我们 PA 遍历完成之后尝试 从 headB 进行遍历

保证两个指针都走 M+N 个步长, 那么如果他们相交的话，就一定会存在相等的情况

```go
func getIntersectionNode(headA, headB *ListNode) *ListNode {
    if headA == nil || headB == nil {
        return nil
    }

    pA, pB := headA, headB
    for pA != pB {
        if pA == nil {
            pA = headB
        } else {
            pA = pA.Next
        }

        if pB == nil {
            pB = headA
        } else {
            pB = pB.Next
        }
    }
    return pA
}
```