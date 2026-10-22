---
id: number-theory
title: 数论：最大公约数
group: 数学基础
relatedPostIds:
  - gcd_learning_0x01
---

# 数论：最大公约数

欧几里得算法利用 `gcd(a, b) = gcd(b, a mod b)` 不断缩小问题规模，直到余数为零。

## 实现

```cpp
int gcd(int a, int b) {
  while (b != 0) {
    int next = a % b;
    a = b;
    b = next;
  }
  return a;
}
```

它也是理解“用不变量缩小状态空间”的一个好例子。
