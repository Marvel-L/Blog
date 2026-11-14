---
id: go-lock-unlock-timing-0x01
title: Lock 和 Unlock 的时机
excerpt: 从 gcache 的 LRU 实现理解手动 Unlock 与 defer Unlock 的区别：临界区范围、分支返回和并发统计。
category: 项目
tags:
  - Go
  - 并发
  - 缓存
author: Marvel-L
rank: 黄金
series: false
draft: false
---

# Lock 和 Unlock 的时机

阅读 `github.com/bluele/gcache@v0.0.2` 的 LRU 实现时，会发现一个区别：`Set` 使用 `Lock()` 配合 `defer Unlock()`，而读取缓存的 `getValue` 在不同分支里手动调用 `Unlock()`。

两种写法看起来差不多，为什么不统一使用 `defer`？

**如果把 `getValue` 中两处手动解锁删除，改为加锁后立即注册 `defer Unlock()`，正常执行时同样能保证缓存内部操作的并发安全。当前写法的直接效果，是提前释放缓存锁，把命中和未命中统计放到锁外。**

本文依据上述版本的 `lru.go` 和 `stats.go` 分析。

## Set：执行完缓存操作就返回

`lru.go:70–75` 的实现很短：

```go
func (c *LRUCache) Set(key, value interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_, err := c.set(key, value)
	return err
}
```

`defer c.mu.Unlock()` 会先登记解锁操作，在当前函数退出时执行，并不会在登记时立即释放锁。

这里的 `c.set()` 会更新缓存 map、调整 LRU 链表、设置过期时间等。它自己不加锁，由外层 `Set` 负责保护这些操作。调用结束后，`Set` 直接返回，没有额外的统计步骤需要移到锁外，所以使用 `defer` 很自然。

同文件的 `SetWithExpire` 还需要在 `c.set()` 之后修改过期时间，并处理错误返回。使用 `defer` 可以让不同返回路径共用一次解锁逻辑。

## getValue：缓存操作结束后，先解锁再统计

手动解锁实际出现在内部的 `getValue`，其实现位于 `lru.go:124–145`：

```go
func (c *LRUCache) getValue(key interface{}, onLoad bool) (interface{}, error) {
	c.mu.Lock()
	item, ok := c.items[key]
	if ok {
		it := item.Value.(*lruItem)
		if !it.IsExpired(nil) {
			c.evictList.MoveToFront(item)
			v := it.value
			c.mu.Unlock()
			if !onLoad {
				c.stats.IncrHitCount()
			}
			return v, nil
		}
		c.removeElement(item)
	}
	c.mu.Unlock()
	if !onLoad {
		c.stats.IncrMissCount()
	}
	return nil, KeyNotFoundError
}
```

两条执行路径都在完成缓存内部操作后释放锁：

- **命中且未过期**：查询 map、调整 LRU 顺序、取出值，然后解锁，再按 `onLoad` 决定是否增加命中次数。
- **不存在或已过期**：不存在时直接走未命中路径；已过期时先删除元素。随后解锁，再按 `onLoad` 决定是否增加未命中次数。

虽然源码里有两处 `Unlock()`，**一次调用只会执行其中一处**。命中分支解锁后会直接 `return`，不会继续执行下面的解锁。

## 为什么统计可以放在锁外

`stats.go:20–28` 使用原子操作更新计数：

```go
func (st *stats) IncrHitCount() uint64 {
	return atomic.AddUint64(&st.hitCount, 1)
}

func (st *stats) IncrMissCount() uint64 {
	return atomic.AddUint64(&st.missCount, 1)
}
```

这两个计数器通过 `sync/atomic` 保证各自更新的并发安全，不依赖缓存的 `c.mu`。因此，缓存 map 和 LRU 链表处理完成后，就可以先释放缓存锁，再更新计数。

以需要记录统计的命中路径为例，两种写法的持锁范围如下。方括号表示持有 `c.mu` 的阶段，长度不表示实际耗时：

```text
手动解锁：[查询、调整 LRU、取值] → 解锁 → 统计 → 返回
defer：  [查询、调整 LRU、取值、统计] → 解锁 → 返回
```

提前解锁后，其他 goroutine 就有机会在本次调用统计期间进入缓存临界区。这里可以确认的是持锁范围缩小了；具体吞吐或延迟改善多少，需要基准测试，不能仅凭这段代码认定手动解锁会快很多，也不能据此断言作者是为了避免 `defer` 的执行开销。

## 能不能把 getValue 改成 defer

可以，调整后的完整形式如下。这是说明两种写法差别的改写示例，并非原库实现：

```go
func (c *LRUCache) getValue(key interface{}, onLoad bool) (interface{}, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	item, ok := c.items[key]
	if ok {
		it := item.Value.(*lruItem)
		if !it.IsExpired(nil) {
			c.evictList.MoveToFront(item)
			v := it.value
			if !onLoad {
				c.stats.IncrHitCount()
			}
			return v, nil
		}
		c.removeElement(item)
	}
	if !onLoad {
		c.stats.IncrMissCount()
	}
	return nil, KeyNotFoundError
}
```

这个版本仍然保护了共享 map 和链表，只是将统计也纳入了缓存锁的保护范围。**添加 `defer` 时必须同时移除原来的两处 `Unlock()`，否则会重复解锁。**

还要区分函数层级：这里讨论的是在 `getValue` 内使用 `defer`。上层 `get` 的反序列化、`Get` 的缓存加载逻辑，仍在 `getValue` 返回并解锁后执行。不能直接给最外层 `Get` 再套同一把锁，否则内部 `getValue` 再次申请这把锁时会阻塞，形成自锁死锁。

## 选择时还需要考虑什么

| 关注点 | 手动 Unlock | defer Unlock |
| --- | --- | --- |
| 解锁时机 | 执行到指定位置就解锁 | 当前函数退出时解锁 |
| 后续存在不需要锁的工作 | 可以直接将这部分工作移到锁外 | 同一函数内的后续工作仍在锁内 |
| 多个返回分支 | 需要逐条保证解锁路径正确 | 通常可以共用一个解锁点 |
| 持锁期间发生 panic | 尚未执行的手动解锁不会自动执行 | 已注册的解锁会在 panic 栈展开时执行 |

`defer` 在 panic 时释放锁，并不代表被中断的操作已经完成，也不保证共享状态仍然满足业务约束；它只负责执行登记好的解锁动作。

另外，LRU 的 `Get` 不能因为名称是“读取”就换成 `RLock()`。这个版本读取时还会调用 `MoveToFront()` 调整链表，并可能删除过期元素，因此需要写锁。

实践中，如果加锁后一直操作共享状态，处理完便返回，优先使用 `defer` 往往更清晰。如果共享状态已经处理完，后面还有可以独立执行的统计或其他工作，则可以明确划定临界区，提前解锁。判断依据是共享状态需要保护到哪里，而不是函数叫 `Set` 还是 `Get`。

## 源码位置

以下位置均对应 `github.com/bluele/gcache@v0.0.2`：

- `lru.go:70–75`：`Set` 使用 `Lock` 和 `defer Unlock`。
- `lru.go:78–89`：`SetWithExpire` 的错误返回与过期时间更新。
- `lru.go:94–121`：`Get`、`get` 与内部读取函数的调用关系。
- `lru.go:124–145`：`getValue` 的命中、过期和未命中路径。
- `stats.go:20–28`：命中和未命中计数使用原子更新。
