---
id: iteration-dp-0x01
title: 线性dp
---

# 线性 Dp

以 ==递推== 的形式 求解对应的问题

## 不同路径

一个机器人位于一个 `m x n `网格的左上角 （起始点在下图中标记为 “Start” ）。

机器人每次只能向下或者向右移动一步。机器人试图达到网格的右下角（在下图中标记为 “Finish” ）。

问总共有多少条不同的路径？

[62.不同路径题目链接](https://leetcode.cn/problems/unique-paths/description/)

![png](/posts-img/算法/动态规划/不同路径.png)

### 思路

对于 向右走 和 向下走的 状态 , 我们可以简单的想到一个方程

`dp[i][j] = dp[i-1][j] + dp[i][j-1]` 即 ==当前的值 等于上面的值+左边的值==

因此这题的一个简单版本就出来了，我们只需要设置 `dp[0][0] = 1` 即可

### 优化思路

由于我们考虑当前的 `dp[i][j]` 我们发现 ==我们永远只用了上一层的状态 即 dp[i-1]==

因此我们考虑 `dp[j]`, 当我们枚举到 `j` 的时候, `dp[j] = dp[j-1] + dp[j]`

因为 `dp[j-1]` 已经被更新过了相当于是 `dp[i][j-1]` 而 `dp[j]` 还没有更新相当于是 `dp[i-1][j-1]`

### Code

```go
func uniquePaths(m int, n int) int {
    dp := make([]int, n)
    dp[0] = 1
    for range m {
        for  j  := 1 ; j < n; j ++ {
            dp[j] = dp[j-1] + dp[j]
        }
    }
    return dp[n-1]
}
```

## 最小路径和

给定一个包含非负整数的 `m x n` 网格 `grid` ，请找出一条从左上角到右下角的路径，使得路径上的数字总和为最小。

说明：每次只能向下或者向右移动一步。

[64.最小路径和](https://leetcode.cn/problems/minimum-path-sum/description/)

![img.png](img.png){.small}

### 思路

同样的，我们无非是把状态方程 从==原来的单纯累加变成了 计算权重==

`dp[i][j] = min(dp[i-1][j], dp[i][j-1]) + a[i][j]`

这里 ==优化到一维== 需要注意 初始化

1. 初始化 `dp[0] = a[0][0]`

2. 从 `[0,0]` 开始转移, 先初始化第一行 `dp[i] = dp[i-1] + a[0][i]`

3. 然后枚举计算的时候 ，分别初始第一列 `dp[0] += a[i][0]`

### Code

```go
func minPathSum(grid [][]int) int {
    // dp[i][j] = min(dp[i-1][j], dp[i][j - 1]) + grid[i][j]
    m := len(grid[0])

    dp := make([]int , m)
    dp[0] = grid[0][0]

    for j := 1; j < m; j++ {
        dp[j] = dp[j-1] + grid[0][j]
    }

    for i := 1 ; i < len(grid) ; i ++ {
        dp[0] += grid[i][0]
        for j := 1 ; j < len(grid[i]) ; j ++ {
            dp[j] = min(dp[j], dp[j - 1]) + grid[i][j]
        }
    }
    return dp[m - 1]
}
```

## 爬楼梯

假设你正在爬楼梯。需要 `n` 阶你才能到达楼顶。

每次你可以爬 `1` 或 `2` 个台阶。你有多少种不同的方法可以爬到楼顶呢？

[70.爬楼梯题目链接](https://leetcode.cn/problems/climbing-stairs/description/)

### 思路

同样我们根据上面几个题的惯性思考，也能很简单的想到

`dp[n] = dp[n-1] + dp[n-2]`

我们初始化 `dp[0],dp[1] = 1,1`即可

### Code

```go
func climbStairs(n int) int {
    if n <= 1 {
        return 1
    }
    dp := make([]int, n + 1)
    dp[0], dp[1] = 1,1
    for i := 2  ; i <= n ; i ++ {
        dp[i] = dp[i-1] + dp[i-2]
    }
    return dp[n]
}
```

## 完全平方数

[279.完全平方数](https://leetcode.cn/problems/perfect-squares/description/)

给你一个整数 `n` ，返回 和为 `n` 的完全平方数的最少数量 。

完全平方数 是一个整数，其值等于另一个整数的平方；换句话说，其值等于一个整数自乘的积。例如，`1、4、9` 和 `16` 都是完全平方数，而 `3` 和 `11` 不是。

### 思路

1. 预处理出 值域范围内的 完全平方数

2. 那么完全平方数 就可以代表对应的 走楼梯的步数 ， 即 `dp[i] = min(dp[i - a[j] + 1)`

3. 初始化 `dp[i] = i` 即所有数 最多需要 `i` 个 `1` 组成

### Code

```go
var sq []int

const N = 10000 + 10

func init() {
    sq = make([]int, 0)
    for i := 1; i <= N/i; i++ {
        sq = append(sq, i*i)
    }
}

func numSquares(n int) int {
    dp := make([]int, n+1)
    for i := 1; i <= n; i++ {
        dp[i] = i // 最坏情况：全部使用 1
        for j := 0; j < len(sq) && sq[j] <= i; j++ {
            dp[i] = min(dp[i], dp[i-sq[j]] + 1)
        }
    }

    return dp[n]
}
```

## 打家劫舍

[198.打家劫舍](https://leetcode.cn/problems/house-robber/description/)

你是一个专业的小偷，计划偷窃沿街的房屋。每间房内都藏有一定的现金，影响你偷窃的唯一制约因素就是相邻的房屋装有相互连通的防盗系统，如果两间相邻的房屋在同一晚上被小偷闯入，系统会自动报警。

给定一个代表每个房屋存放金额的非负整数数组，计算你 不触动警报装置的情况下 ，一夜之内能够偷窃到的最高金额。

### 思路

1. 将类型转化为 `i-1` 和 `i-2` 的情况

2. 因此同样我们可以推出递推方程 `dp[i] = max(dp[i-1], dp[i-2] + a[i])`

3. 注意一下对应的初始化

### Code

```go
func rob(nums []int) int {
    dp := make([]int ,len(nums))
    dp[0] = nums[0]
    if len(nums) >= 2 {
        dp[1] = max(dp[0] , nums[1])
    }

    for i := 2 ; i < len(nums) ; i ++ {
        dp[i] = max(dp[i - 1], dp[i-2] + nums[i])
    }
    if len(nums) == 1 {
        return dp[0]
    }
    return dp[len(nums) - 1]
}
```
