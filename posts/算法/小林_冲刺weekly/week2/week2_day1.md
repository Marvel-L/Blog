---
id: xiaolin_algo_week2_day1
title: 算法打卡冲刺 week2 day1
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

# 459.重复的子字符串

力扣链接： https://leetcode.cn/problems/repeated-substring-pattern/

题目：给你一个字符串 s，判断它是否能由某个子串重复多次（至少两次）构成。例如 `abab` 是 `ab` 重复两次，`aba` 则不行。

## 思路

核心结论：

==`s` 是重复子串构成 ⟺ `s` 会出现在 `(s+s)` 去掉首尾各一个字符后的串里==

为什么要掐头去尾：`s+s` 里一定能在「中间拼缝」找到整段 `s`（第二个 `s` 的开头），这不能说明有重复模式。去掉首尾后，合法起点只剩 `1 .. n-1`，这时还能找到完整的 `s`，才说明存在周期。

等价写法：

```go
ss := s[1:] + s[:len(s)-1]   // 就是 (s+s)[1 : 2n-1]
strings.Contains(ss, s)
```

### 小例子

`s = "abab"`，`n = 4`

- `s[1:]` → `"bab"`
- `s[:3]` → `"aba"`
- `ss = "bababa"`，包含 `"abab"` → true

`s = "aba"`，`n = 3`

- `ss = "ba" + "ab" = "baab"`，不包含 `"aba"` → false

## 问题：切片为什么是 `len(str)-1`

一开始会想：是不是因为「左开右闭」才写成 `len(str)-1`？

其实 Go / 多数语言切片是 ==左闭右开==：

```text
s[a:b]  ⟺  a ≤ i < b
```

所以：

| 写法 | 实际下标 | 效果 |
|------|----------|------|
| `s[1:]` | `[1, n)` | 去掉**第一个**字符 |
| `s[:n-1]` | `[0, n-1)` → `0..n-2` | 去掉**最后一个**字符 |

==`end` 写成 `n-1`，正是因为右端点不包含；想排除下标 `n-1`，就要把开区间右端停在 `n-1`==

## Code

少一次 `[]byte` 来回转换，直接切片即可：

```go
func repeatedSubstringPattern(s string) bool {
	n := len(s)
	if n == 0 {
		return false
	}
	return strings.Contains((s + s)[1:2*n-1], s)
}
```

也可以写成掐头去尾再拼：

```go
func repeatedSubstringPattern(s string) bool {
	str := []byte(s)
	ss := string(str[1:]) + string(str[:len(str)-1])
	return strings.Contains(ss, s)
}
```

第二种多了 `[]byte` / `string(...)` 分配，逻辑一样，常数更差一点。

## 问题：Contains 和手写暴力性能为什么不一样

搜索范围其实一样。手写版等价于在 `dummy = s+s` 上从 `i = 1` 扫到 `i < n`：

```go
func repeatedSubstringPattern(s string) bool {
	dummy := s + s

	for i := 1; i < len(dummy)-len(s); i++ {
		isEqual := true
		for j := 0; j < len(s); j++ {
			if dummy[i+j] != s[j] {
				isEqual = false
				break
			}
		}
		if isEqual {
			return true
		}
	}
	return false
}
```

### 时间复杂度怎么记

| 写法 | 常见 / 实践 | 最坏 |
|------|-------------|------|
| `strings.Contains` | **可认为 O(n)**（相对 `\|s\|`） | 标准库用特化 / Rabin-Karp / Two-Way，目标避开朴素平方 |
| 手写双重循环 | 首字符常对不上，`break` 后接近 **O(n)**（感觉像几个 n、甚至 ≈2n） | 外层约 n、内层最多 n → **O(n²)** |

容易踩的坑：

1. 觉得暴力「应该是 2n」——那是 ==早退时的实际比较次数==，不是最坏复杂度。
2. `dummy` 长度是 `2n`，只说明串长，==不等于比较次数是 2n==。
3. benchmark 里两者有时都像线性，差在常数；难匹配输入上暴力才可能突然变慢。

## 一句话收束

- 判定：`(s+s)` 掐头去尾后是否 `Contains(s)`
- 切片：==左闭右开==，所以去尾写 `[:n-1]`
- 复杂度：`Contains` 按 **O(n)** 记；暴力最坏 **O(n²)**，常见因早退接近 O(n)
