---
id: minimum-window-substring-0x01
title: 76. 最小覆盖子串
excerpt: 第一次手撕 hard
category: 算法
tags:
  - string
  - 子串
author: Marvel-L
rank: 白银
series: false
draft: false
coverImage: /posts-img/算法/小林_冲刺weekly/leetcode.png
---

# 76. 最小覆盖子串

题目链接 : https://leetcode.cn/problems/minimum-window-substring/description/?envType=study-plan-v2&envId=top-100-liked

给定两个字符串 s 和 t，长度分别是 m 和 n，返回 s 中的 最短窗口 子串，使得该子串包含 t 中的每一个字符（包括重复字符）。如果没有这样的子串，返回空字符串 ""。

## 难点

1. check 函数

2. 指针移动

## 思路

1. 由于只有字符，因此我们可以通过枚举来判断相等，即顶多==52个字母==

2. 那么我们可以考虑 ==在移动区间的时候，判断相等== ，如果==出现相等的情况，可以尝试移动左区间==

3. 即 这只是一个普通的 无固定长度的 滑动窗口

总时间复杂度 `O(N + M + N·K)`

## Code 

```go
func minWindow(s string, t string) string {
	if illeageInvalid(s,t) == false {
		return ""
	}
	// 怎么判断相等 , 统计每个单词 & 数量 。 这里顶多 52 
	// 每次移动的时候区间的时候，判断相等
	// 如果想等则尝试移动左区间，左区间最多移动 (n / m) 次， 所以时间 N + N/M 

	bucket := make(map[rune]int)
	for _ ,  v := range t {
		bucket[v] ++
	}
	cnt := make(map[rune]int)

	lft := 0
    l, r := -1, -1
	for i , v := range s {
		cnt[v] ++
		if check(bucket, cnt) {
			for lft <= i &&  check(bucket, cnt)   {
				cnt[rune(s[lft])] --
				lft ++
			}
			if l == -1 && r == -1 || (r - l ) > ( i - lft ){
                l = lft - 1
                r = i 
            }
		}
	}
    if l < 0 {
        return ""
    }
	return s[l:r + 1]
}

func illeageInvalid(s string, t string) bool {
	length := 0
	for  range s {
		length ++
	}
	for  range t {
		length --
	}
	return length >= 0
}

func check(bucket , cnt map[rune]int) bool {
	for k, v := range bucket {
		if cnt[k] < v {
			return false
		}
	}
	return true
}
```