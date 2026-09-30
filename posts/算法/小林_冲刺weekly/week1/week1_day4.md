---
id: xiaolin_algo_week1_day4
title: 算法打卡冲刺 day4
excerpt: 我能复刻的路吗
category: 算法
tags:
  - 日常
  - 我的来时路
author: Marvel-L
rank: 青铜
series: false
draft: false
---

# 两数之和

力扣链接 : https://leetcode.cn/problems/two-sum/description/

题目 : 给定一个数组 和 Target, 询问数组里面哪两个元素之和等于 target, 如果等于则返回下标

## 思路

顺序遍历数组, 把元素存入到 Map 中 。每次访问的时候 判断 Map 中是否存在对应的 Target - cur 的 Key

如果存在则说明出现过

## Code

```go
func twoSum(nums []int, target int) []int {
    mp := make(map[int]int)
    res := make([]int, 0, len(nums))

    for i , v := range nums {
        if mp[target - v] != 0 {
            res = append(res, mp[target - v] - 1, i)
        }
        mp[v] = i + 1
    }
    return res 
}
```

# 454 四数相加

力扣链接 : https://leetcode.cn/problems/4sum-ii/description/

题目 : 给你四个整数数组 nums1、nums2、nums3 和 nums4 ，数组长度都是 n ，请你计算有多少个元组 (i, j, k, l) 能满足：

- 0 <= i, j, k, l < n
- nums1[i] + nums2[j] + nums3[k] + nums4[l] == 0

## 思路

1. 一开始没什么思路， 直接暴力的做法 是  200^4 = 1e8 的 肯定会超时

2. 考虑使用两数之和的思路来优化， 前两个数组相加 和 后两个数组相加 然后跑一边两数之和

    - 这里会遇到 ==多计算== 多情况, 因为最后我们跑循环的时候，会额外计算一部分 一半数组的情况

1. 因此考虑优化，我们维护两个 Map, ==在处理计算的时候 我们就统计对应的 和数量==

2. 最后在 Match 的时候就是一个 乘法交换 的过程



## 历程

```go
func fourSumCount(nums1 []int, nums2 []int, nums3 []int, nums4 []int) int {

    m1 := make([]int, 0, len(nums1) * len(nums2) + len(nums3) * len(nums4))
    for _ ,v1 := range nums1 {
        for _, v2 := range nums2 {
            m1 = append(m1, v1 + v2)
        } 
    }
    
    for _ ,v1 := range nums3 {
        for _, v2 := range nums4 {
            m1 = append(m1, v1 + v2)
        } 
    }
    

    mp := make(map[int]int)
    cnt := 0 
    for _ ,v := range m1 {
        if v, ok := mp[-v] ; ok {
            cnt += v
        }
        mp[v] ++
    }
    return cnt 
}
```

## Code 

```go
func fourSumCount(nums1 []int, nums2 []int, nums3 []int, nums4 []int) int {

    m1 := make(map[int]int)
    m2 := make(map[int]int)
    for _ ,v1 := range nums1 {
        for _, v2 := range nums2 {
            m1[v1 + v2] ++ 
        } 
    }
    
    for _ ,v1 := range nums3 {
        for _, v2 := range nums4 {
            m2[v1 + v2] ++ 
        } 
    }
    
    cnt := 0 

    for k, v := range m1 {
        if _ , ok := m2[-k] ; ok {
            cnt += v * m2[-k]
        }
    }
    return cnt 
}
```