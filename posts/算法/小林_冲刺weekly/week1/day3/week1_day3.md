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

#  142.环形链表II
 
见 [环形链表专题](https://marvel-l.github.io/Blog/post/xiaolin_algo_week1_day3_0x01)

# 242.有效的字母异位词

力扣链接：https://leetcode.cn/problems/valid-anagram/

题目：给你两个字符串，如果这两个字符串的每个字符出现的次数都一样，返回true

## 思路

因为只有 ==26个字母== 使用标记数组进行统计，然后在进行删除

```go
func isAnagram(s string, t string) bool {
    st := make([]int,27)
    for _ , v := range s {
        st[v - 'a'] ++ 
    }        

    for _, v := range t {
        st[v - 'a'] -- 
    }
    for i := 0 ; i <= 26; i ++ {
        if st[i] != 0 {
            return false 
        }
    }
    return true 
}
```

#   349. 两个数组的交集

力扣链接：https://leetcode.cn/problems/intersection-of-two-arrays/

题目：求两个数组的交集

## 思路

1. 同样使用 一个 ==Map 进行统计== 
2. 不过需要注意的是，==对于第一个数组需要判断是否为0 防止重复计算==，==对于第二个数组需要判断不等于0 防止重复计算==

## Code 

```go
func intersection(nums1 []int, nums2 []int) []int {
    mp := make(map[int]int)
    for _ ,v := range nums1 {
        if mp[v] == 0 {
            mp[v] ++ 
        }
    }
    for _, v := range nums2 {
        if mp[v] != 0 {
            mp[v] -- 
        }
    }

    res := make([]int,0,len(nums1))
    for k ,v := range mp {
        if v != 1 {
            res = append(res, k)
        }
    }
    return res 
}
```
#  第202题. 快乐数

力扣链接： https://leetcode.cn/problems/happy-number/

题目： 重复计算：数字各个位 的 平方 的 和 ，直到和为1，则返回true，如果不可能为1，返回false

## 思路

模拟即可

## code 

```go
func isHappy(n int) bool {
    mp := make(map[int]bool)
    for  {
       res :=  calc(n)
       if res == 1 {
            return true 
       }else if mp[res] == true {
            return false 
       }
       mp[res] =true 
       n = res 
    }
    return false 
}

func calc(n int) int {
    res := 0 
    for n != 0  {
        wv := n % 10
        res += wv * wv 
        n /= 10 
    }
    return res 
}

// 111 , 3 , 9 
// 222 , 12 , 5, 25
```