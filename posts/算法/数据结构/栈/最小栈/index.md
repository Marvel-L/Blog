---
id: min-stack-0x01
title: 最小栈
excerpt: 最小栈
category: 算法
tags:
  - 算法打卡日常
  - 栈
  - 最小栈
author: Marvel-L
rank: 黄金
series: false
draft: false
coverImage: /posts-img/算法/hot100.png
---

# 155. 最小栈

题目链接 : https://leetcode.cn/problems/min-stack/description/?envType=study-plan-v2&envId=top-100-liked

设计一个支持 `push` ，`pop` ，`top` 操作，并能在常数时间内检索到最小元素的栈。

实现 `MinStack` 类:

`MinStack() `初始化堆栈对象。
`void push(int value) `将元素 `value` 推入堆栈。
`void pop()` 删除堆栈顶部的元素。
`int top() `获取堆栈顶部的元素。
`int getMin()` 获取堆栈中的最小元素。
 

## 难点

1. 需要 ==明确使用两个栈==

2. Go 中使用 ==slices== 操作栈

## 思路

1. 使用一个栈，==维护栈的基本操作==

2. 同时使用另外一个栈，记录最小值

    - 如果存在值比当前栈顶还小，则入栈
    - 如果另外一个栈 弹出了栈，额外判断是否需要弹出当前栈

一个思考点 =="如果我弹出了最小的元素，我怎么确保我的最小栈顶，还是元素中最小的"==

1. 因为我们总是把最小的入栈，所以弹出一个元素之后，第二个元素肯定是==次小的==

## Code


```go
type MinStack struct {
	stk1 []int
	stk2 []int
}


func Constructor() MinStack {
	return MinStack{
		stk1: make([]int,0),
		stk2: make([]int,0),
	}
}


func (this *MinStack) Push(value int)  {
	if len(this.stk2) == 0 || ( this.stk2[len(this.stk2) - 1]  >= value ) {
		this.stk2 = append(this.stk2 , value)
	}
	this.stk1 = append(this.stk1,value)
}


func (this *MinStack) Pop()  {
	if this.stk1[len(this.stk1) - 1] == this.stk2[len(this.stk2) - 1] {
		this.stk2 = this.stk2[: len(this.stk2) - 1]
	}
	this.stk1 = this.stk1[:len(this.stk1) - 1]
}


func (this *MinStack) Top() int {
	return this.stk1[len(this.stk1) - 1]
}


func (this *MinStack) GetMin() int {
	return this.stk2[len(this.stk2) - 1]
}


/**
 * Your MinStack object will be instantiated and called as such:
 * obj := Constructor();
 * obj.Push(value);
 * obj.Pop();
 * param_3 := obj.Top();
 * param_4 := obj.GetMin();
 */
```



