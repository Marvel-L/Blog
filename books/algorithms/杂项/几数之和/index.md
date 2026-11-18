---
id: sum-of-x-numbers-0x01
title: 几数之和
---

## 1. 两数之和

[题目链接](https://leetcode.cn/problems/two-sum/description/)

### 题目

给定一个整数数组 `nums` 和一个整数目标值 `target`，找出数组中和为 `target` 的两个整数，并返回它们的数组下标。

- 每种输入只对应一个答案。
- 不能重复使用同一个元素。
- 可以按任意顺序返回答案。

**示例：**

```text
输入：nums = [2, 7, 11, 15], target = 9
输出：[0, 1]
解释：nums[0] + nums[1] == 9，因此返回 [0, 1]。
```

### 我的分析

数组是乱序的，一定有答案，也没有要求常数级的额外空间，因此可以直接用 `map`。

我的做法是：**记录前面元素还需要哪个数才能凑出 `target`，遍历到这个数时直接返回。**

- `map` 的键是待匹配的数字 `target - nums[i]`，值是当前元素的下标 `i`。
- 每遍历到一个数字，先检查它是不是前面元素正在等待的数字。
- 如果是，返回之前记录的下标和当前下标；否则，记录当前元素需要的数字。

例如，遍历到 `2` 时，记录 `7 → 0`；随后遍历到 `7` 时，就能找到下标 `0`，返回 `[0, 1]`。

**注意：先查询，再记录。** 这样 `map` 中只包含前面元素的信息，不会把当前元素使用两次。

### 代码

```go
func twoSum(nums []int, target int) []int {
    mp := make(map[int]int)
    for i := 0; i < len(nums); i++ {
        if index, ok := mp[nums[i]]; ok {
            return []int{index, i}
        }
        mp[target-nums[i]] = i
    }
    return nil
}
```

### 复杂度

- **时间复杂度：** 平均为 `O(n)`，遍历一次数组，哈希表查询和写入平均为 `O(1)`。
- **空间复杂度：** `O(n)`，用于保存待匹配的数字及对应下标。

## 167. 两数之和 II - 输入有序数组

[题目链接](https://leetcode.cn/problems/two-sum-ii-input-array-is-sorted/description/)

### 题目

给定一个按非递减顺序排列的整数数组 `numbers`，找出其中和为 `target` 的两个数，并返回它们的下标 `[index1, index2]`。

- 返回的下标从 **1** 开始，且 `index1 < index2`。
- 每种输入只对应一个答案，不能重复使用同一个元素。
- 解决方案必须只使用 **常数级的额外空间**。

**示例：**

```text
输入：numbers = [2, 7, 11, 15], target = 9
输出：[1, 2]
解释：2 + 7 == 9，返回它们从 1 开始的下标 [1, 2]。
```

### 我的分析

数组是有序的，并且要求常数级的额外空间，因此不能沿用上一题的 `map` 方案。

从有序的角度考虑，可以用左右两个指针 `i`、`j`，分别指向数组的开头和结尾，计算 `sum = numbers[i] + numbers[j]`：

- `sum == target`：找到答案，返回 `[i + 1, j + 1]`。
- `sum > target`：当前和太大，左移右指针 `j`，尝试减小和。
- `sum < target`：当前和太小，右移左指针 `i`，尝试增大和。

**为什么这样移动不会漏掉答案？**

- 当 `sum > target` 时，`numbers[i]` 已经是当前区间最小的数，它与 `numbers[j]` 相加仍然太大；换成区间内其他数与 `numbers[j]` 配对，只会更大或不变，因此可以排除当前 `j`。
- 当 `sum < target` 时，`numbers[j]` 已经是当前区间最大的数，它与 `numbers[i]` 相加仍然太小；换成区间内其他数与 `numbers[i]` 配对，只会更小或不变，因此可以排除当前 `i`。

循环条件使用 `i < j`，避免重复使用同一个元素。数组访问仍使用从 `0` 开始的下标，只在返回时加 `1`。

### 代码

```go
func twoSum(numbers []int, target int) []int {
    i, j := 0, len(numbers)-1
    for i < j {
        sum := numbers[i] + numbers[j]
        if sum == target {
            return []int{i + 1, j + 1}
        }
        if sum > target {
            j--
        } else {
            i++
        }
    }
    return nil
}
```

### 复杂度

- **时间复杂度：** `O(n)`，每次移动一个指针，两个指针总共最多移动 `n - 1` 次。
- **空间复杂度：** `O(1)`，只使用固定数量的变量。

> 两段代码是各自题目的独立解答，函数名都保留为 `twoSum`。
