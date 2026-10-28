---
id: leetCode-hot-100
title: LeetCode Hot 100 
excerpt: hot 100 
category: 算法
tags:
  - 日常
  - LeetCode
  - LeetCode-hot100
author: Marvel-L
rank: 王者
series: false
draft: false
coverImage: /posts-img/算法/hot100.png
---

# 136. 只出现一次的数字

题目链接 : https://leetcode.cn/problems/single-number/description/?envType=study-plan-v2&envId=top-100-liked

题意 :
给你一个 非空 整数数组 nums ，除了某个元素只出现一次以外，其余每个元素均出现两次。找出那个只出现了一次的元素。

你必须设计并实现线性时间复杂度的算法来解决此问题，且该算法只使用常量额外空间。

Tag : `位运算`

## 难点

题目要求 ==线形时间复杂度==, ==常量额外空间==

1. 因此不能进行排序
2. 不能使用 Map

## 思路

1. 引入 ==异或== , 异或 对于 2 进制不同数字才会 变成 1 

2. 否则都是 0 

![img.png](img.png){.inline}

## Code

```go
func singleNumber(nums []int) int {
    ans := 0
    for _ , v := range nums {
        ans ^= v
    }
    return ans 
}
```

# 169. 多数元素

题目链接 :

题意 :

给定一个大小为 `n` 的数组 `nums` ，返回其中的多数元素。多数元素是指在数组中出现次数 大于 `⌊ n/2 ⌋` 的元素。

你可以假设数组是非空的，并且给定的数组总是存在多数元素。

Tag : `map`, `投票`

## 难点

1. 无，直接使用 `map`

## 思路

1. 直接使用 Map 进行统计，然后再对 map 进行一次遍历

## Code

```go
func majorityElement(nums []int) int {
    mp := make(map[int]int)
    for _ ,num := range nums {
        mp[num] ++ 
    }
    for k , v := range mp {
        if v > len(nums) / 2  {
            return k
        }
    }
    return -1
}
```

## 另外一种思路

`摩尔投票法` 对于超过半数投票的情况, 我们可以引入 `heap` 并且初始化 `1`

对于超过半数的投票，那么当前 `ans` 肯定会存活

## Code

```go
func majorityElement(nums []int) (ans int) {
    hp := 0
    for _, x := range nums {
        if hp == 0 { // x 是初始擂主，生命值为 1
            ans, hp = x, 1
        } else if x == ans { // 比武，同门加血，否则扣血
            hp++
        } else {
            hp--
        }
    }
    return
}

```

# 543. 二叉树的直径

给你一棵二叉树的根节点，返回该树的 直径 。

二叉树的 直径 是指树中任意两个节点之间最长路径的 长度 。这条路径可能经过也可能不经过根节点 root 。

两节点之间路径的 长度 由它们之间边数表示。

[详情可看](https://marvel-l.github.io/Blog/post/diameter-of-binary-tree-0x01/)

# 108. 将有序数组转换为二叉搜索树

给你一个整数数组 nums ，其中元素已经按 升序 排列，请你将其转换为一棵 平衡 二叉搜索树。


# 230. 二叉搜索树中第 K 小的元素

题目链接 : https://leetcode.cn/problems/kth-smallest-element-in-a-bst/description/?envType=study-plan-v2&envId=top-100-liked

给定一个二叉搜索树的根节点 `root` ，和一个整数 `k` ，请你设计一个算法查找其中第 `k` 小的元素（k 从 1 开始计数）。


# 二叉树的右视图

题目链接 : https://leetcode.cn/problems/binary-tree-right-side-view/description/?envType=study-plan-v2&envId=top-100-liked

给定一个二叉树的 根节点 root，想象自己站在它的右侧，按照从顶部到底部的顺序，返回从右侧所能看到的节点值。

# 56.合并区间

题目链接 : https://leetcode.cn/problems/merge-intervals/description/?envType=study-plan-v2&envId=top-100-liked

以数组 intervals 表示若干个区间的集合，其中单个区间为 intervals[i] = [starti, endi] 。请你合并所有重叠的区间，并返回 一个不重叠的区间数组，该数组需恰好覆盖输入中的所有区间 。
