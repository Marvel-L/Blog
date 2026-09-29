---
id: xiaolin_algo_week1_day2
title: 算法打卡冲刺 day2
excerpt: 我能复刻的路吗
category: 算法
tags:
  - 日常
  - 我的来时路
author: Marvel-L
rank: 青铜
featured: false
series: false
draft: false
---

# 203.移除链表元素

力扣链接： https://leetcode.cn/problems/remove-linked-list-elements/submissions/

题目： 给你一个链表和一个val，删除所有节点值等于val的节点，返回链表

### 第一次

```go
func removeElements(head *ListNode, val int) *ListNode {
    cur := head 
    for  ; cur != nil ; cur = cur.Next {
        if cur.Val == val {
            if cur.Next != nil  {
                cur.Next = cur.Next.Next
            }else {
                cur = nil 
            }
        }
    }
    return cur  
}
```

第一次 fail , 因为我们在 cur = nil 处理空的时候，当前的 cur.Next 会判断 Nil

然后我想着，我们是不是不需要这么额外处理 只需要处理 cur.Next = Cur.Next.Next 即可

```shell 
panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x1 addr=0x8 pc=0x4c398b]
main.removeElements(...)
solution.go, line 10
main.__helper__(...)
solution.go, line 25
main.main()
solution.go, line 66
```

### 第二次

第二次更改的时候 发现返回的结果都是 空

是因为 ==我返回的是Cur, 循环里 Cur != nil, 循环结束 Cur == nil==

```go
func removeElements(head *ListNode, val int) *ListNode {
    cur := head 
    for  ; cur != nil ; cur = cur.Next {
        if cur.Val == val {
            if cur.Next != nil  {
                cur.Next = cur.Next.Next
            }
        }    
    }
    return cur  
}
```

## 正确思路

所以我们需要考虑 额外创建一个 结果 ListNode，然后通过 temp 指针进行处理

思路如下

==1. 创建一个 dummy 输出， 创建一个 prev 用于移动==
==2. 判断前驱节点 即 pre.next 是否为空, 判断是否到尾节点==
==3. 如果前驱节点 == val, 那么前驱节点指向下一个==
==4. 否则的话 保留当前节点，往前走动一个格==

```go
func removeElements(head *ListNode, val int) *ListNode {
	dummy := &ListNode{Next: head}
	prev := dummy
	for prev.Next != nil {
		if prev.Next.Val == val {
			prev.Next = prev.Next.Next
		} else {
			prev = prev.Next
		}
	}
	return dummy.Next
}
```

# 707.设计链表 

感觉有点困难 TBD

# 206.反转链表

力扣链接： https://leetcode.cn/problems/reverse-linked-list/

题目： 给你一个链表，翻转一下，返回头节点

## 思路

对于链表操作不太熟悉，遍历的时候 喜欢使用 ==cur = cur.Next 进行遍历==

导致我尝试使用 ==cur.Next = prev== 操作的时候不太好进行操作

这里我们可以尝试将 ==`next = cur.next`== 记录下来，然后再将节点更改，然后再移动到下一个节点

```go
func reverseList(head *ListNode) *ListNode {
    var prev *ListNode 
    cur := head 

    for cur != nil {
        next := cur.Next
        cur.Next = prev
        prev = cur
        cur = next
    }
    return prev
}
```


# 24. 两两交换链表中的节点

力扣链接：https://leetcode.cn/problems/swap-nodes-in-pairs/

题目：给你一个链表，每两个节点，进行交换。比如 1-2-3-4。 改为 2-1-4-3

## 第一次

```go
func swapPairs(head *ListNode) *ListNode {
    cnt := 0 

    cur :=  head 
    var last *ListNode
    for cur != nil {
        cnt ++ 
        next := cur.Next // 记录一下一次操作

        if cnt % 2 == 0 {
            cur.Next = last 
            last.Next = next
        }
        last = cur 
        cur = next 
    }
    
    return head 
}
```


```golang
type MyLinkedList struct { 
 	 Val int 
 	 Next *MyLinkedList 
 	 Len int 
 } 
 
 
 func Constructor() MyLinkedList { 
 	 return MyLinkedList{ 
 	 	 Val: 0, 
 	 	 Next: nil, 
 	 } 
 } 
 
 
 func (this *MyLinkedList) Get(index int) int { 
 	 if index  + 1  > this.Len { 
 	 	 return -1 
 	 } 
 	 cnt := 0 
 
 	 for  cur := this ; cur != nil ; cur = cur.Next { 
 	 	 if cnt == index { 
 	 	 	 return cur.Val 
 	 	 } 
 	 	 cnt ++ 
 	 } 
 	 return 0 
 } 
 
 
 func (this *MyLinkedList) AddAtHead(val int)  { 
 	 newLinkedList := &MyLinkedList{ 
 	 	 Val: val, 
 	 } 
 	 newLinkedList.Next = this 
 	 newLinkedList.Len = this.Len + 1 
 	 this = newLinkedList 
 } 
 
 
 func (this *MyLinkedList) AddAtTail(val int)  { 
 	 tail := this.Get(this.Len - 1) // 获取末尾 
 	 this.AddAtIndex(this.Len - 1, val) // 插入在末尾前 
 	 this.DeleteAtIndex(this.Len - 1) // 删除末尾 
 	 this.AddAtIndex(this.Len - 1, tail) // 插入在末尾前 
 } 
 
 
 func (this *MyLinkedList) AddAtIndex(index int, val int)  { 
 	 if index > this.Len { 
 	 	 return 
 	 } 
 	 if index == 0 { 
 	 	 this.AddAtHead(val) 
 	 } 
 	 dummy := &MyLinkedList{Next:this} 
 	 prev := dummy 
 	 cnt := 0 
 	 for prev.Next != nil { 
 	 	 if cnt - 1 == index { 
 	 	 	 new := &MyLinkedList{Val:val} 
 	 	 	 new.Next = prev.Next 
 	 	 	 prev.Next = new 
 	 	 } 
 	 	 prev = prev.Next // 1->2 
 	 	 cnt ++ 
 	 } 
 	 this = dummy.Next 
 } 
 
 
 func (this *MyLinkedList) DeleteAtIndex(index int)  { 
 	 if index > this.Len { 
 	 	 return 
 	 } 
 	 if index == 0 { 
 	 	 this = this.Next 
 	 } 
 
 	 cur := this 
 	 cnt := 0 
 	 for cur != nil { 
 	 	 cur  = cur.Next 
 	 	 cnt ++ 
 	 	 if cnt == index { // 上一个 
 	 	 	 cur.Next = cur.Next.Next 
 	 	 } 
 	 } 
 } 
 

```

修正后 

```go
type Node struct {
	Val  int
	Next *Node
}

type MyLinkedList struct {
	head *Node
	size int
}

func Constructor() MyLinkedList {
	return MyLinkedList{}
}

func (this *MyLinkedList) Get(index int) int {
	if index < 0 || index >= this.size {
		return -1
	}
	cur := this.head
	for i := 0; i < index; i++ {
		cur = cur.Next
	}
	return cur.Val
}

func (this *MyLinkedList) AddAtHead(val int) {
	this.head = &Node{
		Val:  val,
		Next: this.head,
	}
	this.size++
}

func (this *MyLinkedList) AddAtTail(val int) {
	this.AddAtIndex(this.size, val)
}

func (this *MyLinkedList) AddAtIndex(index int, val int) {
	if index < 0 {
		index = 0
	}
	if index > this.size {
		return
	}
	if index == 0 {
		this.AddAtHead(val)
		return
	}

	prev := this.head
	for i := 0; i < index-1; i++ {
		prev = prev.Next
	}
	prev.Next = &Node{
		Val:  val,
		Next: prev.Next,
	}
	this.size++
}

func (this *MyLinkedList) DeleteAtIndex(index int) {
	if index < 0 || index >= this.size {
		return
	}
	if index == 0 {
		this.head = this.head.Next
		this.size--
		return
	}

	prev := this.head
	for i := 0; i < index-1; i++ {
		prev = prev.Next
	}
	prev.Next = prev.Next.Next
	this.size--
}
```
