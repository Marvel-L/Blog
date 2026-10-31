---
id: permutations-0x01
title: 46. 全排列
excerpt: 全排列
category: 算法
tags:
  - dfs
  - 排列
author: Marvel-L
rank: 黄金
series: false
draft: false
coverImage: /posts-img/算法/小林_冲刺weekly/leetcode.png
---

# 46. 全排列

给定一个不含重复数字的数组 nums ，返回其 所有可能的全排列 。你可以 按任意顺序 返回答案。

## 难点

1. Golang 中的 ==切片会共享数组==

## 思路

1. 通过 ==递归 和 回溯== 进行排列

2. 通过 `st` 数组标记已经使用过的元素， 当我们的元素满的时候记录答案

但是 `Golang` 中有两个需要注意的

1. 如果使用 `append` 会导致不会回滚，需要==`temp = temp[:len(temp) - 1]`==

2. 并且会共享数组 ,所以需要 `copy(snapshot, temp)`

## Code

```go
func permute(nums []int) [][]int {
    res := make([][]int , 0)

    var dfs func([]int) 

    st := make([]bool , len(nums) , len(nums))
    dfs = func(temp []int) {
        if len(temp) == len(nums) {
            snapshot := make([]int, len(temp))
            copy(snapshot, temp)
            res = append(res, snapshot)
            return 
        }
        for i := 0 ; i < len(nums) ; i ++ {
            if st[i] == false {
                temp = append(temp, nums[i])
                st[i] = true 
                dfs(temp)
                st[i] = false 
                temp = temp[:len(temp) - 1]
            }
        }
    }
    temp := make([]int,0)
    dfs(temp)
    return res 
}
```

## 优化思路

主要是优化写法 

## Code

```go
func permute(nums []int) (ans [][]int) {
    n := len(nums)
    path := make([]int, n)
    onPath := make([]bool, n)

    var dfs func(int)
    dfs = func(i int) {
        if i == n {
            ans = append(ans, append([]int(nil), path...))
            return
        }
        for j, on := range onPath {
            if !on {
                path[i] = nums[j]
                onPath[j] = true
                dfs(i + 1)
                onPath[j] = false
            }
        }
    }

    dfs(0)
    return
}
```