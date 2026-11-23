---
id: redis_list_0x01
title: List
order: 1
---

![img.png](img.png)

# 常用指令

```shell
# 将一个或多个值value插入到key列表的表头(最左边)，最后的值在最前面
LPUSH key value [value ...]
# 将一个或多个值value插入到key列表的表尾(最右边)
RPUSH key value [value ...]
# 移除并返回key列表的头元素
LPOP key
# 移除并返回key列表的尾元素
RPOP key

# 返回列表key中指定区间内的元素，区间以偏移量start和stop指定，从0开始
LRANGE key start stop

# 从key列表表头弹出一个元素，没有就阻塞timeout秒，如果timeout=0则一直阻塞
BLPOP key [key ...] timeout
# 从key列表表尾弹出一个元素，没有就阻塞timeout秒，如果timeout=0则一直阻塞
BRPOP key [key ...] timeout
```

# 应用场景

1. 消息队列

# 底层实现

底层实现分为 ZIPLIST + LINKEDLIST + QUICKLIST

![img_4.png](img_4.png)

## ZIPLIST

ZIPLIST 的本质是一个字节数组如下

![img_5.png](img_5.png)

## LINKEDLIST

LINKEDLIST 本质是一个双向链表

![img_6.png](img_6.png)

# QUICKLIST

QUICKLIST 本质是一个 双向链表 同时双向链表的 节点中存储的是一个 字节数组 即 LINKEDLIST + ZIPLIST

![img_7.png](img_7.png)
