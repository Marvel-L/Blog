---
id: lcsaf-add-two-numbers-ii-0x01
title: 灵茶山艾府 - 两数相加
excerpt: 走向灭亡
category: 算法
tags:
  - 日常
  - 链表
  - 合并链表
author: Marvel-L
rank: 钻石
series: false
draft: false
coverImage: /posts-img/算法/两数相加.png
---

# 两数相加 II

题目链接 : https://leetcode.cn/problems/add-two-numbers-ii/

## 错误思路

看到要求 ==不能反转原有链表== , 所以一开始想到的 Reverse 后相加的思路不可用

所以打算顺序进行相加

1. 求两个链表的长度
2. 然后根据长度进行对应的错位枚举
3. 进行相加，并且引入一个 ==map== 进行记录当前位置的进位
4. 在输出结果前，进行一次进位的计算

我想着 ==lazy-进位== ， 但是在输出的时候想到对于 ==999999== 在末尾有进位的话, 那么其实要 ==循环处理 N 轮== 

1. 所以对于 两数相加相关的内容 看着都不能够考虑 ==顺序相加==

## Error - Code 

```go
func addTwoNumbers(l1 *ListNode, l2 *ListNode) *ListNode {
        mp := make(map[int]int)
        
        cur :=  l1
        LenL1, LenL2 :=  0, 0 
        for cur != nil {
            LenL1 ++ 
            cur = cur.Next
        }

        cur = l2 
        for cur != nil {
            LenL2 ++ 
            cur = cur.Next
        }

        if LenL1 < LenL2 {
            l1, l2 = l2, l1
            LenL1, LenL2 = LenL2, LenL1 
        }

        cur = l1 
        cur2 := l2 
        idx := 0 

        res := &ListNode{}
        dummy := res 
        for cur != nil {
            idx ++ 
            temp := cur.Val
            if idx > (LenL1 - LenL2) && cur2 != nil  {
                temp += cur2.Val
                cur2 = cur2.Next
            }
            cur = cur.Next
            if temp > 10 {
                mp[idx] = 1
                temp %= 10 
            }
            dummy.Next = &ListNode{Val: temp}
            dummy = dummy.Next
        }

        pre := res 
        dummy = res.Next
        for i := 1 ; i <= idx ; i ++ {
            if _, ok := mp[idx] ; ok {
                if idx == 1 {
                    node := &ListNode{Val: 1}
                    pre.Next = node 
                    node.Next = dummy
                }else {
                    pre.Val += 1 // 这里可能还遇到进位
                }
            }
        }

        return res.Next
}
```

## 正确思路

我们想要实现倒序相加

1. 直接反转链表

2. 使用 `LIFO` 后进先出的机制，因此引入`栈` 进行解决

## Code

```go
func addTwoNumbers(l1 *ListNode, l2 *ListNode) *ListNode {
    res := (*ListNode)(nil)
    
    s1, s2 := make([]int,0), make([]int,0)
    for ; l1 != nil ; l1 = l1.Next {
        s1 = append(s1, l1.Val)
    }
    for ; l2 != nil ; l2 = l2.Next {
        s2 = append(s2, l2.Val)
    }

    carry := 0
    for len(s1) > 0 || len(s2) > 0  || carry > 0 {
        sum := carry 
        if len(s1) > 0 {
            sum += s1[len(s1) - 1]
            s1 = s1[:len(s1) - 1]
        }
        if len(s2) > 0 {
            sum += s2[len(s2) - 1]
            s2 = s2[:len(s2) - 1]
        }
        res = &ListNode{Val: sum%10, Next: res}
        carry = sum / 10 
    }
    return res
}
```