---
id: xiaolin_algo_week1_day5
title: 算法打卡冲刺 day5
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

# 344.反转字符串

力扣链接：https://leetcode.cn/problems/reverse-string/

题目：给你一个字符串，字符串存在数组里面，翻转字符串，不能用额外空间

## 思路

题目要求很简单

1. ==不能使用额外空间==
2. ==反转字符串==

因此我们直接进行首尾交换即可


## Code

```go
func reverseString(s []byte)  {
    for i :=0 ; i < len(s) / 2 ; i ++ {
        s[i] , s[len(s) - i - 1] = s[len(s) - i - 1] , s[i]
    }
}
```

#  541. 反转字符串II

力扣链接：https://leetcode.cn/problems/reverse-string-ii/ 

题目：给你一个字符串和k，每到2k个字符，就翻转前k个字符。如果剩余字符少于k个则全部翻转，如果小于2k但大于等于k，则翻转前k个

## 思路

根据题意进行模拟即可

1. 每次走 `2*k` 个步长

2. 使用 l,r 进行区间交换 。 如果当前区间的 右区间 > n 那么缩小区间到可交换的地方即可

```go
func reverseStr(s string, k int) string {
	b := []byte(s)
	n := len(b)
	for i := 0; i < n; i += 2 * k {
		l, r := i, i+k-1
		if r >= n {
			r = n - 1
		}
		for l < r {
			b[l], b[r] = b[r], b[l]
			l++
			r--
		}
	}
	return string(b)
}
```

# 2.   541. 反转字符串II

力扣链接：https://leetcode.cn/problems/reverse-string-ii/

题目：给你一个字符串和k，每到2k个字符，就翻转前k个字符。如果剩余字符少于k个则全部翻转，如果小于2k但大于等于k，则翻转前k个

## 思路

很无聊的一个题，使用 `strings.ReplaceAll` 即可 

## Code 

```go
func pathEncryption(path string) string {
    return strings.ReplaceAll(path, ".", " ")
}
```

## 剑指Offer58-II.左旋转字符串

力扣链接： https://leetcode.cn/problems/zuo-xuan-zhuan-zi-fu-chuan-lcof/

题目：给你一个字符串和一个k，把字符串前k个字符截取放到字符串末尾。abcd 2.-----cdab

## 思路

1. 我这里引用了 ==额外的空间== 来进行解决

2. 另外一种思路 是直接进行切片操作

## Code

```go
func dynamicPassword(password string, target int) string {
    dummy := make([]byte, 0 , len(password))
    for i := target ; i < len(password) ; i ++  {
        dummy = append(dummy, password[i])
    }

    for i := 0 ; i < target ; i ++ {
        dummy = append(dummy, password[i])
    }
    return string(dummy)
}
```


```go
func reverseLeftWords(s string, n int) string {
    return s[n:]+s[:n]
}
```

