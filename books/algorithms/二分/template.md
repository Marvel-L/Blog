---
id: binary-search-template-0x01
title: '二分模板'
draft: false
---

# 二分

说实话 Acwing 的模板有点==反直觉== 我这里进行一次 梳理

如果我们要找左区间 那么就是

```go
if (a[mid]  < target) {  // 找到第一个  >= 范围，因此答案应该在右边, 但是答案不包括 左边界
	l = mid + 1
}else {
	r = mid
}
```

否则如果我们要找右区间 那么就是

```go
if(a[mid] > target) { // 找到第一个 <= 的范围，因此答案应该在左边 但是答案不包括右边界
	r = mid - 1
}else {
	l = mid
}
```

同时防止 `l = mid` 和 下取整 冲突，因此需要 `mid = (l + r + 1) >> 1`

# 参考

1. [我自己的题解](https://ddlgitgzzhm.github.io/p/acwing-basic-0x02/)
