---
id: longest-valid-parentheses-0x01
title: 32 最长有效括号
excerpt: 最长有效括号
category: 算法
tags:
  - 算法打卡日常
  - 括号匹配
author: Marvel-L
rank: 青铜
series: false
draft: false
coverImage: /posts-img/算法/小林_冲刺weekly/leetcode.png
---

# 32. 最长有效括号

给你一个只包含 '(' 和 ')' 的字符串，找出最长有效（格式正确且连续）括号 子串 的长度。

左右括号匹配，即每个左括号都有对应的右括号将其闭合的字符串是格式正确的，比如 "(()())"。

示例 1：

输入：

s := "(()"

输出：2

解释：最长有效括号子串是 "()"

示例 2：

输入：
s := ")()())"

输出：4

解释：最长有效括号子串是 "()()"

示例 3：

输入：

s := ""

输出：0

## 难点

1. 整个思路很难想，或者说容易跑偏 认为是 DP ，或者说是其他内容

## 思路

1. 一开始是想着 Dp 的思路，枚举每一个 '(' 然后进行递推

2. 但是实际 只是一个模拟的过程

我们考虑使用 `栈` 进行统计 `(` , 我们对于 `(` 当前的情况 只有 `()`和 `(()` 这两种情况 

因此我们在括号匹配的时候 永远匹配的是 ==最后的一个 (== , 当我们匹配成功后 记录对应的==成功下标==

3. 然后顺序的遍历每一个下标 求解一段连续下标的最大值即可

## Code

```go
func longestValidParentheses(s string) int {
    n := len(s)
    stk := make([]int, 0)
    validate := make([]bool, n)

    for i, v := range s {
        if v == '(' {
            stk = append(stk, i)
        }else if len(stk) > 0 {
            validate[i] = true 
            validate[stk[len(stk) - 1]] = true 
            stk = stk[:len(stk) - 1]
        }
    }
    cnt := 0 
    ans := 0 
    for _ , v := range validate {
        if v {
            cnt ++ 
            ans = max(ans, cnt )
        }else {
            cnt = 0
        }
    }
    return ans 
}
```
