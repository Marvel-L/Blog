---
id: climbing-stairs-ii-0x01
title: "3693.爬楼梯 II"
excerpt: 爬楼梯 II
category: 算法
tags:
  - 动态规划
  - 递推
  - 线性dp 
author: Marvel-L
rank: 白银
series: false
draft: false
tbd: true
coverImage: /posts-img/算法/小林_冲刺weekly/leetcode.png
---

# 3693.爬楼梯 II

题目链接 : https://leetcode.cn/problems/climbing-stairs-ii/description/

你正在爬一个有 n + 1 级台阶的楼梯，台阶编号从 0 到 n。

你还得到了一个长度为 n 的 下标从 1 开始 的整数数组 costs，其中 costs[i] 是第 i 级台阶的成本。

从第 i 级台阶，你 只能 跳到第 i + 1、i + 2 或 i + 3 级台阶。从第 i 级台阶跳到第 j 级台阶的成本定义为： costs[j] + (j - i)2

你从第 0 级台阶开始，初始 cost = 0。

返回到达第 n 级台阶所需的 最小 总成本。

## 难点

1. 状态转移方程需要进行变换

## 思路

1. 我们可以很简单的想到一个 方程 `dp[i] = min(dp[i-1], dp[i-2], dp[i-3]) + costs[i] + (j-i)^2`

2. 但是这个方程在枚举的时候不太好处理，即我们如下面这么处理的时候 

我们发现 `dp[0]` 肯定是默认有值的 所以我们应该从 `dp[j+i]` 进行转移，即所有内容都 `+j` 

因此方程变成 `dp[i] = min(dp[i-1], dp[i-2], dp[i-3]) + costs[i] + (j-i)^2` -> `dp[i] = min(dp[i-1], dp[i-2], dp[i-3]) + costs[i] + (j-i)^2`

```go
for i := 0 ; i <= n ; i ++ {
    for j := 1; j <= 3 ; j ++ {
    
    }
}
```



## Code 

```go
func climbStairs(n int, costs []int) int {
    // dp[i] = Min [for{cost[j] + (j - i ) ^ 2}] + dp[j - i]
    
    dp := make([]int, n+1) 
    for i := 1 ; i <= n ; i ++ {
        dp[i] = 0x3f3f3f3f
    }
    dp[0] = 0 

    for i := 0 ; i <= n ; i ++ {
        for j := 1 ; j <= 3 && j + i <= n  ; j ++ {
                dp[j + i] = min(dp[j + i] , costs[j + i - 1] + j * j + dp[i])
        }
    }
    return dp[n]
}
```