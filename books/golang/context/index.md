---
id: context-index-0x01
title: 'context: 基础介绍'
order: 10
---

# Context 是什么

`Context` 可以认为是一个标准库的 ==接口==

```go
type Context interface {
   Deadline() (deadline time.Time, ok bool)
   Done() <-chan struct{}
   Err() error
   Value(key interface{}) interface{}
}
```

这个接口定义了四个方法

- `Deadline`： 返回 `context.Context` 截止时间

- `Done`： 返回一个 只读 `Channel`，当 `Context` ==被取消或者到达截止时间，这个 `Channel` 就会被关闭==，表示 `Context` 的链路结束，多次调用 `Done` 方法会返回同一个 `Channel`

- `Err`： 返回 `context.Context` 结束的原因，它只会在 `Done` 返回的 `Channel` 被关闭时才会返回非空的值，返回值有以下两种情况；

  - 如果 是 `context.Context` 被取消，返回 `Canceled`

  - 如果 是 `context.Context` 超时，返回 `DeadlineExceeded`

- `Value`: 从 `context.Context` 中获取键对应的值，类似于 `map` 的`get` 方法，对于同一个 `context`，多次调用 `Value` 并传入相同的 `Key` 会返回相同的结果，如果没有对应的 `key`,则返回nil，键值对是通过 `WithValue`方法写入的

# Context 的 创建

主要有以下两种方式创建根 `context`

- `context.Background()`

- `context.TODO()`

从源代码分析 `context.Background` 和 `context.TODO` 并没有太多的区别，都是用于创建根`context，根context是一个空的context，不具备任何功能。但是一般情况下，如果当前函数没有上下文作为入参，我们都会使用 context.Background创建一个根context 作为起始的上下文向下传递。

## 根 Context 创建

## Context 派生
