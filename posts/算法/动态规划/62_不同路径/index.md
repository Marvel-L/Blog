---
id: unique-paths-0x01
title: "62.不同路径"
excerpt: 不同路径
category: 算法
tags:
  - 动态规划
  - 递推
author: Marvel-L
rank: 白银
series: false
draft: false
tbd: true
coverImage: /posts-img/算法/动态规划/不同路径.png
---

# 62. 不同路径

题目链接: https://leetcode.cn/problems/unique-paths/description/?envType=study-plan-v2&envId=top-100-liked

一个机器人位于一个 `m x n` 网格的左上角 （起始点在下图中标记为 “Start” ）。

机器人每次只能向下或者向右移动一步。机器人试图达到网格的右下角（在下图中标记为 “Finish” ）。

问总共有多少条不同的路径？

## 难点

1. 状态的定义，以及 ==狗屎初始化==

## 思路

1. 我们可以考虑一个最简单的思路就是 `dp[i][j] = dp[i-1][j] + dp[i][j-1]` 

    - 表示当前节点 只能从上和左边递推过来，并且==路径等于这两个的和== 

2. 初始化 `dp[0][0] = 1` 即可

3. 需要 `Golang` 中的初始化过程，需要先初始化 外层循环 然后初始化内层

## Code 

```go
func uniquePaths(m int, n int) int {
	// f[i][j] = f[i - 1][j] + f[i][j - 1]

	dp := make([][]int, m, m)
	for i := 0; i < m; i++ {
		dp[i] = make([]int, n, n)
	}

	dp[0][0] = 1
	for i := 0; i < m; i++ {
		for j := 0; j < n; j++ {
			if i-1 >= 0 {
				dp[i][j] += dp[i-1][j]
			}
			if j-1 >= 0 {
				dp[i][j] += dp[i][j-1]
			}
		}
	}
	return dp[m-1][n-1]
}
```

## 优化思路

观察 ==`f[i][j] = f[i - 1][j] + f[i][j - 1]`== 

1. 对于 当前的 `dp[j]` 我们从 `dp[j]` 向 `dp[j-1]` 递推 

怎么理解

1. 因为我们的 ==循环是从左往右的==，因此我们 `dp[j]` 的值，其实是上一个 `dp[i-1][j]` 的值

2. 同时我们 `dp[j-1]` 已经被前面的更新了，表示的是 当前`[j-1]`的值 

3. 因此就可以表示从左边和从上面递推

## Code


```go
func uniquePaths(m int, n int) int {
    //f[i][j] = f[i - 1][j] + f[i][j - 1]

    dp := make([]int, n)
    dp[0] = 1
    for range m {
        for j := range n {
            if j - 1 >=  0 {
                dp[j] += dp[j - 1]
            }
        }
    }
    return dp[n - 1]
}

// f[i][j] = f[i-1][j] + f[i][j-1]
```


