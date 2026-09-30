---
id: xiaolin_algo_week1_day4
title: 算法打卡冲刺 day4
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

# 两数之和

力扣链接 : https://leetcode.cn/problems/two-sum/description/

题目 : 给定一个数组 和 Target, 询问数组里面哪两个元素之和等于 target, 如果等于则返回下标

## 思路

顺序遍历数组, 把元素存入到 Map 中 。每次访问的时候 判断 Map 中是否存在对应的 Target - cur 的 Key

如果存在则说明出现过

## Code

```go
func twoSum(nums []int, target int) []int {
    mp := make(map[int]int)
    res := make([]int, 0, len(nums))

    for i , v := range nums {
        if mp[target - v] != 0 {
            res = append(res, mp[target - v] - 1, i)
        }
        mp[v] = i + 1
    }
    return res 
}
```

# 454 四数相加

力扣链接 : https://leetcode.cn/problems/4sum-ii/description/

题目 : 给你四个整数数组 nums1、nums2、nums3 和 nums4 ，数组长度都是 n ，请你计算有多少个元组 (i, j, k, l) 能满足：

- 0 <= i, j, k, l < n
- nums1[i] + nums2[j] + nums3[k] + nums4[l] == 0

## 思路

1. 一开始没什么思路， 直接暴力的做法 是  200^4 = 1e8 的 肯定会超时

2. 考虑使用两数之和的思路来优化， 前两个数组相加 和 后两个数组相加 然后跑一边两数之和

    - 这里会遇到 ==多计算== 多情况, 因为最后我们跑循环的时候，会额外计算一部分 一半数组的情况

1. 因此考虑优化，我们维护两个 Map, ==在处理计算的时候 我们就统计对应的 和数量==

2. 最后在 Match 的时候就是一个 乘法交换 的过程



## 历程

```go
func fourSumCount(nums1 []int, nums2 []int, nums3 []int, nums4 []int) int {

    m1 := make([]int, 0, len(nums1) * len(nums2) + len(nums3) * len(nums4))
    for _ ,v1 := range nums1 {
        for _, v2 := range nums2 {
            m1 = append(m1, v1 + v2)
        } 
    }
    
    for _ ,v1 := range nums3 {
        for _, v2 := range nums4 {
            m1 = append(m1, v1 + v2)
        } 
    }
    

    mp := make(map[int]int)
    cnt := 0 
    for _ ,v := range m1 {
        if v, ok := mp[-v] ; ok {
            cnt += v
        }
        mp[v] ++
    }
    return cnt 
}
```

## Code 

```go
func fourSumCount(nums1 []int, nums2 []int, nums3 []int, nums4 []int) int {

    m1 := make(map[int]int)
    m2 := make(map[int]int)
    for _ ,v1 := range nums1 {
        for _, v2 := range nums2 {
            m1[v1 + v2] ++ 
        } 
    }
    
    for _ ,v1 := range nums3 {
        for _, v2 := range nums4 {
            m2[v1 + v2] ++ 
        } 
    }
    
    cnt := 0 

    for k, v := range m1 {
        if _ , ok := m2[-k] ; ok {
            cnt += v * m2[-k]
        }
    }
    return cnt 
}
```

# 383.赎金信

力扣链接 : https://leetcode.cn/problems/ransom-note/description/

题目 : 给你两个字符串 ransomNote 和 magazine ，如果 ransomNote 能由 magazine 里面的字符构成，则返回 true ；否则返回 false 。

## 思路

这个和之前做过的的 字符串匹配 不是很像 。 因为这个允许 ==不规则数量匹配== 

无非是代码上需要额外处理一下

## Code 

```go
func canConstruct(ransomNote string, magazine string) bool {
    st := make(map[rune]int)
    for _ ,  v := range magazine {
        st[v - 'a'] ++ 
    }

    for _, v := range ransomNote {
        if _ , ok := st[v - 'a'] ; ok {
            st[v - 'a']  -- 
        }
    }

    for _, v := range ransomNote {
        if _, ok := st[v - 'a'] ; !ok {
            return false 
        }
        if st[v - 'a'] < 0 {
            return false 
        }
    }
    return true 
}
```

# 15.三数之和

题目链接 : https://leetcode.cn/problems/3sum/description/

给你一个整数数组 nums ，判断是否存在三元组 [nums[i], nums[j], nums[k]] 满足 i != j、i != k 且 j != k ，同时还满足 nums[i] + nums[j] + nums[k] == 0 。请你返回所有和为 0 且不重复的三元组。

注意：答案中不可以包含重复的三元组。

## 思路

1. 考虑枚举 i , ==那么题目就变成了 nums[j] + nums[k]  = nums[i]== , 即两数之和的版本

2. 因为我们题目给出的数组是无序的，所以我们可以考虑排序优化一下，这样子对于

   - nums[i] + nums[k1] + nums[k2] > 0 或者 nums[i] + nums[k1] + nums[k2] < 0 的时候可以更好的进行移动

## Code

```go
func threeSum(nums []int) [][]int {
    slices.Sort(nums)
    n := len(nums)
    ans := make([][]int,0)
    for i := 0 ; i <  len(nums) - 2 ; i ++ {
        x := nums[i]
        if i > 0 && x == nums[i-1] {
            continue 
        }
        if x + nums[i + 1] + nums[i+2] > 0 {
            break 
        }
        if x + nums[n - 2] + nums[n - 1] < 0 {
            continue 
        }

        l , r := i + 1, n - 1
        for l < r {
            s := x + nums[l] + nums[r]
            if s > 0 {
                r -- 
            }else if s < 0 {
                l ++ 
            }else {
                ans = append(ans, []int{x,nums[l],nums[r]})
                for l ++ ; l < r && nums[l] == nums[l-1] ; l ++ {} 
                for r -- ; l < r && nums[r] == nums[r+1] ; r -- {}
            }
        }
    }
    return ans 
}
```


# 18. 四数之和

题目链接 : https://leetcode.cn/problems/4sum/description/

给你一个由 n 个整数组成的数组 nums ，和一个目标值 target 。请你找出并返回满足下述全部条件且不重复的四元组 [nums[a], nums[b], nums[c], nums[d]] （若两个四元组元素一一对应，则认为两个四元组重复）：

0 <= a, b, c, d < n
a、b、c 和 d 互不相同
nums[a] + nums[b] + nums[c] + nums[d] == target
你可以按 任意顺序 返回答案 。

## 思路

1. 根据三数之和的步骤， 我们可以尝试==固定 a,b== 那么就变成了 `c + d = target - a - b` 即是我们的两数之和模板
2. 那么就是去重的问题，无非就是 Continue 一下相等的数据



## Code 

```go
func fourSum(nums []int, target int) [][]int {
    res := make([][]int, 0)
    n := len(nums)
    if n < 4 {
        return res
    }

    slices.Sort(nums)

    for i := 0; i < n-3; i++ {
        if i > 0 && nums[i] == nums[i-1] {
            continue
        }

        for j := i + 1; j < n-2; j++ {
            if j > i+1 && nums[j] == nums[j-1] {
                continue
            }

            l, r := j+1, n-1
            for l < r {
                sum := nums[i] + nums[j] + nums[l] + nums[r]
                if sum < target {
                    l++
                } else if sum > target {
                    r--
                } else {
                    res = append(res, []int{nums[i], nums[j], nums[l], nums[r]})
                    l++
                    r--

                    for l < r && nums[l] == nums[l-1] {
                        l++
                    }
                    for l < r && nums[r] == nums[r+1] {
                        r--
                    }
                }
            }
        }
    }

    return res
}
```

