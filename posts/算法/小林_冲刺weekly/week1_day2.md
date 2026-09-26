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
featured: true
featured-top: 1
series: false
draft: false
---

## 

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

### 第三次

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