---
id: golang-stl-sort-0x01
title: Golang 中的排序方法
excerpt: Golang 的排序方法
category: Golang
tags:
  - Go
  - STL
  - 排序
  - Golang 标准库
author: Marvel-L
rank: 王者
tbd: true
featured: false
series: false
coverImage: /posts-img/golang/golang.png
draft: false
---

# Sort

## 基本类型切片

对于 ==基本类型== 的切片 例如 `[]int`, `[]float`, `[]string` , `sort` 包提供基本函数进行排序

`sort.Ints`, `sort.Float64s`, `sort.Strings`

```go
func sortBasic() {
	sort.Ints(intValue)
	sort.Float64s(floatValue)
	sort.Strings(stringValue)
}
```

## 自定义比较器进行排序

对于 ==自定义类型== 的切片，例如 `[]struct`, `[]int` 等等，`sort` 包提供 `sort.Slice` 函数进行排序 

同时还有一个 `sort.SliceStable` 支持稳定排序

```go
family      = []Person{
{"Alice", 23},
{"Eve", 2},
{"David", 2},
{"Bob", 25},
}

func sortSlice() {
	sort.Slice(family, func(i, j int) bool { return family[i].Age < family[j].Age })
}
```

## 任意类型的比较

官方包 `sort.Sort()` 提供了任意类型的比较

```go
type Interface interface {
    Len() int
    Less(i, j int) bool
    Swap(i, j int)
}
func Sort(data Interface) {
	n := data.Len()
	if n <= 1 {
		return
	}
	limit := bits.Len(uint(n))
	pdqsort(data, 0, n, limit)
}
```

如果想要支持自己想要的排序方式，可以通过==实现 Interface==  来进行

## Reverse 

`Sort` 提供对数组的 `Reverse` 操作，当我们需要对数组进行逆序排序时，可以使用 `Reverse` 函数

不过 `Reverse` 函数需要和 `sort.Sort` 一起使用，因为 `Reverse` 返回的是一个 `Interface` 类型，需要和 `sort.Sort` 一起使用

对于基本类型 Sort 包提供了 ==sort.Float64Slice{}== 等类型 进行使用

```go
func reverseSlice() {
	sort.Sort(sort.Reverse(sort.Float64Slice(floatValue)))
}

```


## 参考 

主要 根据 下面这两篇文章 结合 Golang 中的标准库实现 

- https://golang.xiniushu.com/%E8%AF%AD%E8%A8%80%E5%85%A5%E9%97%A8/%E6%A0%87%E5%87%86%E5%BA%93/sort.html#%E8%87%AA%E5%AE%9A%E4%B9%89%E6%8E%92%E5%BA%8F

- https://learnku.com/articles/38269

