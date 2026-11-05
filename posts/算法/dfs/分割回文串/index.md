---
id: palindrome-partitioning-0x01
title: 131. 分割回文串
excerpt: 回溯
category: 算法
tags:
  - dfs
  - 回溯
author: Marvel-L
rank: 星耀
series: false
draft: false
coverImage: /posts-img/算法/小林_冲刺weekly/leetcode.png
---

# 131. 分割回文串

[题目链接](https://leetcode.cn/problems/palindrome-partitioning/description/?envType=study-plan-v2&envId=top-100-liked)

给你一个字符串 s，请你将 s 分割成一些 子串，使每个子串都是 回文串 。返回 s 所有可能的分割方案。

## 难点

1. 回溯应该按照什么进行回溯 ，结束的状态

## 错思路

一开始我以为只是 ==查到对应的子回文串== 因此我们可以得出两个结论

1. 选到的数 不能被在选，因此肯定是涉及到 `i = index` 的形式

2. 那么答案怎么记录，我们发现中间状态也会产生答案，因此考虑在==每个节点进行记录== 不进行 Return

## Code

```go
func partition(s string) [][]string {
	res := make([][]string,0)
	var dfs func(string, int)
	dfs = func(temp string, index int) {
		if validate(temp) && temp != "" {
			res = append(res, []string{temp})
		}
		for i := index + 1 ; i < len(s) ; i ++ {
		    dfs(temp + string(s[i]), i )
		}
	}
	dfs("", -1)
	return res 
}
func validate(s string)  bool {
	i, j := 0, len(s) - 1
	for i  < j  {
		if s[i] != s[j] {
			return false
		}
		i ++
		j --
	}
	return true
}
// aba
```

## 正确思路

题目想要的是分割思路 ，因此我们考虑 

1. 对于当前节点，我们同样不能回头选，因此考虑 ==i = index + 1==  的形式

2. 对于当前节点 他有两种选择  继续往前直到找到回文串, 自己本身就是回文串


3. 因此对于当前节点，我们尝试拼接每一个字符，如果是==回文串则分割出来，继续进行递归==

4. 同理由于回溯的原因，就算我们拼接到了 =="a"的形式，他也会继续 "a""a"== 进行查找

## Code 

```go
func partition(s string) [][]string {
	res := make([][]string,0)
    path := make([]string, 0)

	var dfs  func(start int)
    dfs = func(start int) {
        if start == len(s) {
            res = append(res , append([]string(nil), path...))
            return 
        }

        for i := start ; i < len(s) ; i ++ {
            part := s[start : i + 1]
            if !validate(part) {
                continue 
            }
            path = append(path, part)
            dfs(i + 1)
            path = path[:len(path) - 1]
        }
    }
    dfs(0)
    return res 
}
func validate(s string)  bool {
	i, j := 0, len(s) - 1
	for i  < j  {
		if s[i] != s[j] {
			return false
		}
		i ++
		j --
	}
	return true
}
// aba
```