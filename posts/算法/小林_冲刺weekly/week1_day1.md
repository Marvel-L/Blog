---
id: xiaolin_algo_week1_day1
title: 算法打卡冲刺 day1
excerpt: 我能复刻的路吗
category: 算法
tags:
  - 日常
  - 我的来时路
author: Marvel-L
rank: 青铜
featured: true
featured-top: 1
series: false
draft: false
---


# 704.二分查找

力扣链接：https://leetcode.cn/problems/binary-search/

题目：给你一个升序数组 nums 和一个目标值 target ，返回目标值 target 在数组 nums 中的下标，如果不存在则返回-1

## 思路

标准的二分查找，可以直接通过 左区间 或者是 右区间的方式找出来 

## 问题

一开始 Code 写错了，我在区间移动的时候 认为 如果答案在 `nums[mid] >= target` 的时候 那么答案肯定在 左边，因为左边有相等

所以这时候 我就直接 `l = mid` 但是有一个问题就是，如果 ==第一次计算出来的答案比他小，那么 r = mid - 1== 永远也计算不出来答案

所以我尝试把思路转变成 ，求 小于等于的第一个数， 保证在区间第一次缩小的时候能够正确缩小

```go
func search(nums []int, target int) int {
    l := 0 
    r := len(nums) - 1
    for l < r {
        mid := (l+r+1)>>1 
        if nums[mid] >= target {
            l = mid 
        }else {
            r = mid - 1; 
        }
    } 
    if nums[l] == target {
        return l ;
    }else {
        return -1;
    }
} 
```

## Code

```go
  for l < r {
        mid := (l+r+1)>>1 
        if nums[mid] <= target {
            l = mid 
        }else {
            r = mid - 1; 
        }
    } 
```

# 27. 移除元素

力扣链接：https://leetcode.cn/problems/remove-element/​

题目：给你一个数组 nums 和一个值 val，要求你把数组中值为 val 的元素全部删掉，而且不允许你使用额外的数组来辅助解决这题，返回移除 val 后数组的长度

## 问题

一开始思路便 ，我以为是移动元素到后面，而且我还一直在纠结 ==如何不使用额外空间进行移动== ,所以一直在纠结 `[val,val , 1,2,3]` 的情况

但是题目要求并不是移动到后面，而是只需要保证前 `k` 个不包含几个

## 思路

使用快慢指针，对于慢指针，当快指针扫过`val`的时候 慢指针停止移动，下次快指针进行更新

## Code 

```go
func removeElement(nums []int, val int) int {
    fi := 0 
    n := len(nums)
    for i := 0 ; i < n ; i ++  {
        if nums[i] != val {
            nums[fi] = nums[i]
            fi ++ 
        }
    }
    return fi 
}
```

# 977.有序数组的平方

力扣链接： https://leetcode.cn/problems/squares-of-a-sorted-array/

题目： 给你一个递增数组 nums（包含负数），返回一个数组，且数组要求里面的元素是给定数组 nums 里面元素的平方，还要求递增

## 思路

这题之前做过有印象，因为原数组就是排序之后的数组，所以我们通过 左右指针，即可保证 正负的最大值判断

但是在插入的时候有问题，因为我们要求是从小到大的输出的。 因为 ==如果我们顺序插入会导致乱序== ，因为我们并不能保证当前的两个极大值一定是最小值

因此需要考虑反向插入

## Code

```go
func sortedSquares(nums []int) []int {
    l , r := 0, len(nums) - 1
    
    res := make([]int ,len(nums))

    k := 0 
    for ; l <= r ; {
        lv := nums[l] * nums[l]
        lr := nums[r] * nums[r] 
        if lv < lr {
            res[k] = lv 
            l ++ 
         }else {
            res[k] = lr
            r -- 
         }
         k ++ 
    }
    return res 
} 
```
# 209.长度最小的子数组

力扣链接：https://leetcode.cn/problems/minimum-size-subarray-sum/

题目：给你一个数组和 target，求出一个连续子数组，并且这个子数组相加要大于 target，返回子数组最短的长度

## 思路

一眼就能看出解法的题目，需要使用滑动窗口，或者说每次能够 >= target 的时候 需要维护一个左指针 保证最小区间

但是这里有一个问题就是我们是 `ans >= target` 的时候需要计算 而不是 `ans > target` 一开始写这个题目的时候 还是有很多卡点

## Code

```go
func minSubArrayLen(target int, nums []int) int {
    n := len(nums)

    ans := 0 
    l := 0 
    res := n 
    find := false 
    for i := 0 ; i < n ; i ++ {
        ans += nums[i]
        // 1 ->
        // 1 + 4 -> (5 - 1) -> (l = 1, i = 1)
        for ans - nums[l] >= target {
            ans -= nums[l]
            l ++ 
        }

        if ans >= target {
            res = min(res, i - l + 1)
            find = true 
        }
    }

    if !find {
        return 0
    }

    return res 

```

## 5. 螺旋矩阵II

力扣链接： https://leetcode.cn/problems/spiral-matrix-ii/

题目： 给你一个n，生成NxN的矩阵，并且要求你顺时针填入 1，2，3，4，5...

## 思路

单纯的模拟，没有什么优化空间， 一开始以为是构造，是个什么数学公式

但是发现就算数学公式，==你也需要 n^2 的时间复杂度== 进行补充数据

所以我们只能通过 模拟，模拟 n^2 次行为，当我们走到边界的时候尝试进行转向

## Code 

```go
func generateMatrix(n int) [][]int {
    dx := []int{0,1,0,-1}
    dy := []int{1,0,-1,0}

	res := make([][]int, n)
	for i := 0; i < n; i++ {
		res[i] = make([]int, n)
	}

    cur := 1 
    x , y := 0 , 0 
    k := 0
    for i := 0 ; i < n * n ; i ++  {
        res[x][y] = cur 
        cur ++ 
        tx , ty := x + dx[k],y + dy[k]
        if tx >= n ||tx < 0 ||  ty >= n || ty  < 0 ||  res[tx][ty] != 0 {
            k = (k  + 1) %4 // 顺时针
        }
        x += dx[k] 
        y += dy[k]
    }
    return res 
}
```