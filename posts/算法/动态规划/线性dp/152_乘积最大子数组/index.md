---
id: maximum-product-subarray-0x01
title: "152.乘积最大子数组"
excerpt: 乘积最大子数组
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

# 152.乘积最大子数组

题目链接 : https://leetcode.cn/problems/maximum-product-subarray/description/

给你一个整数数组 nums ，请你找出数组中乘积最大的非空连续 子数组（该子数组中至少包含一个数字），并返回该子数组所对应的乘积。

测试用例的答案是一个 32-位 整数。

请注意，一个只包含一个元素的数组的乘积是这个元素的值。 

## 难点

1. ==乘积是一个负负得正的内容== 

## 思路

1. 一开始我们可以得到一个简单方程 `dp[i] = max(dp[i-1] * nums[i], nums[i])` 

即当前我们的数有 ==选和不选== 两个状态

2. 但是会出现 `-2, 3, -4` 负负得正的转移

3. 因此我们可以得出 ==最大值 = 最小值*nums, 最大值*nums, nums== 这几个选项

因此我们需要额外维护一层状态

## Code

```go
func maxProduct(nums []int) int {
    //dp[i] = max(dp[i], dp[i-1] * nums[i])
    // -2, 3, -4  负数怎么处理, 
    // 最小值 和 最大值 ,最大值 可能由最小值转换

    n := len(nums)
    dp := make([][2]int, n)
    dp[0][0], dp[0][1] = nums[0], nums[0]
    for i := 1; i < n ; i ++ {
      dp[i][0] = max(dp[i-1][0] * nums[i], dp[i-1][1] * nums[i], nums[i])
      dp[i][1] = min(dp[i-1][0] * nums[i], dp[i-1][1] * nums[i], nums[i])
    }
    
    ans := -0x3f3f3f3f
    for i := 0 ;  i < n ; i ++ {
        ans = max(ans, dp[i][0])
    }
    return ans 
}
```



