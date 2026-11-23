---
id: redis_string_0x01
title: String
order: 1
---

# 常用指令

```shell
SET KEY VALUE

GET KEY

MSET KEY1 VALUE1 KEY2 VALUE2

MGET KEY1 KEY2

INCR NUMBER

DECR NUMBER

# 不存在 就插入
SETNX KEY VALUE
```

# 应用场景

1. 缓存对象, 例如缓存 Info
2. 常规计数
3. 分布式锁
