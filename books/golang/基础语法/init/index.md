---
id: golang-init
title: Init
order: 0
---

Golang 的初始化时在 Main 函数启动之前进行的

```go
package main

import "fmt"

func init() {
    fmt.Println("1. 加载配置")
}

func main() {
    fmt.Println("2. 开始业务")
    go func() {
        fmt.Println("3. 抓取数据")
    }()
    // 这里只是示意启动顺序
}
```

输出

```go
init() 执行完
      ↓
main() 开始执行
      ↓
main() 里面启动 goroutine
```
