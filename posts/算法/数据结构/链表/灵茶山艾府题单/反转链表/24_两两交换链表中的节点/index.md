---
id: lcsaf-swap-nodes-in-pairs
title: 灵茶山艾府 - 两两交换链表中的节点
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
coverImage: /posts-img/算法/两两交换链表中的节点.png
---


```go
/**
 * Definition for singly-linked list.
 * type ListNode struct {
 *     Val int
 *     Next *ListNode
 * }
 */
func swapPairs(head *ListNode) *ListNode {
    dummy := &ListNode {
        Next: head,
    }
    var pre , cur *ListNode = nil , dummy
    
    for cur.Next != nil {
        nxt := cur.Next
        if pre != nil  {
            pre.Next = cur.Next
            cur.Next.Next = cur
        }

        pre = cur 
        cur = nxt
    }
    // new -> 1 2 3

    // pre = new
    // cur = 1
    // new -> cur.Next , new -> 2, 
    // 

    return head 
}
```


```go
func swapPairs(head *ListNode) *ListNode {
    dummy := &ListNode {
        Next: head,
    }
    pre := dummy
    cur := head
    // 1->2->3
    // 2->1->3
    for cur != nil && cur.Next != nil {
        nxt := cur.Next

        cur.Next = nxt.Next // 1-> 3
        nxt.Next = cur // 2 -> 1
        pre.Next = nxt // dummy -> 2

        pre = cur 
        cur = cur.Next
    }
    return dummy.Next
}
```