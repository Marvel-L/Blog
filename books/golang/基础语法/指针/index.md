---
id: golang-pointer-interface
title: 指针：interface 类型断言与原地修改
order: 10
---

# 指针：interface 类型断言与原地修改

从 `interface` 中断言得到一个结构体指针后，修改它的字段，是否需要再赋回 `interface`？

**如果 interface 中保存的本来就是该对象的指针，修改指针指向的字段会直接修改那个对象，不需要回写。类型断言不会创建新的结构体，也不存在修改后自动同步的过程。**

判断这类代码时，要区分两件事：**修改指针指向的对象**，还是**让局部指针变量指向另一个对象**。

> 本章使用 `any` 表示空接口，它是 `interface{}` 的别名，适用于 Go 1.18 及以上版本。对于其他接口，下面的指针与复制规则也成立，但存入的类型必须实现该接口。

## 指针也是值，传递时复制的是地址

`*Param` 表示指向 `Param` 的指针类型；`&original` 取得变量的地址；`*param` 访问指针指向的值。

Go 的赋值和函数传参都采用值复制。传递指针时，复制的是指针值，不是它指向的结构体。两个指针变量可以保存同一个地址，因此通过任意一个指针修改对象，另一个指针也能读到变化。

```go
package main

import "fmt"

type Param struct {
	Name string
}

func rename(param *Param) {
	param.Name = "新值"
}

func main() {
	original := Param{Name: "旧值"}
	rename(&original)

	fmt.Println(original.Name) // 新值
}
```

这里的 `param.Name` 可以理解为 `(*param).Name`。函数虽然没有返回修改后的参数，但它直接修改了调用方的 `original`。

因此，不宜把这种行为称为“Go 使用引用传递”。更准确的描述是：**Go 使用值传递，但传入的指针与调用方的指针可以指向同一个对象。**

## 类型断言：取出已有指针，不是把值转换成指针

下面的表达式是类型断言：

```go
param, ok := ext.(*Param)
```

它检查 `ext` 中保存的动态类型是否为 `*Param`：

- 匹配时，`ok` 为 `true`，`param` 得到其中保存的指针值。
- 不匹配时，`ok` 为 `false`，`param` 为 `nil`，不会发生 panic。
- 如果使用单返回值形式 `param := ext.(*Param)`，类型不匹配会发生 panic。

**类型断言不会把 `Param` 自动变成 `*Param`，也不会为结构体重新分配一个对象。**

```go
package main

import "fmt"

type Param struct {
	Name string
}

func main() {
	original := &Param{Name: "旧值"}
	var ext any = original

	param, ok := ext.(*Param)
	fmt.Println(ok)                // true
	fmt.Println(param == original) // true

	param.Name = "新值"

	fmt.Println(original.Name)     // 新值
	fmt.Println(ext.(*Param).Name) // 新值
}
```

这个例子中，`original`、`ext` 中保存的指针和 `param` 都指向同一个结构体。`param.Name = "新值"` 改的就是那个结构体，而不是一份待回写的副本。

如果 `ext` 保存的是 `Param` 值，执行 `ext.(*Param)` 不会成功。要取出该结构体值，应使用 `ext.(Param)`，但取出后得到的是副本。

## 修改字段与更换指针，是两种不同的操作

### 修改字段：不需要回写

```go
param.Name = "新值"
```

这条语句沿着 `param` 保存的地址修改对象。只要其他地方仍指向这个对象，就能读到变化。

即使赋值的是一个指针类型字段，例如 `param.Child = &Child{}`，修改的仍然是原结构体的字段，其他持有原结构体指针的地方也能看到这个新字段值。

### 更换局部指针：不会更换 interface 中保存的指针

```go
param = &Param{Name: "另一个对象"}
```

这条语句只改变局部变量 `param` 保存的地址。`ext` 中保存的指针仍然指向旧对象，除非显式执行 `ext = param`。

```go
package main

import "fmt"

type Param struct {
	Name string
}

func main() {
	original := &Param{Name: "旧对象"}
	var ext any = original
	param := ext.(*Param)

	param = &Param{Name: "新对象"}

	fmt.Println(param.Name)        // 新对象
	fmt.Println(ext.(*Param).Name) // 旧对象

	ext = param
	fmt.Println(ext.(*Param).Name) // 新对象
	fmt.Println(original.Name)    // 旧对象
}
```

注意，`ext = param` 只是更换了 `ext` 保存的指针，不会改变 `original` 指向的对象。

另一个容易混淆的写法是：

```go
*param = Param{Name: "整体替换"}
```

这里赋值的目标是 `*param`，即原指针指向的结构体，而不是指针变量本身。因此，共享这个地址的其他指针也能读到整体替换后的字段。

## interface 保存结构体值时，取出的是浅拷贝

如果保存的是结构体值而不是指针，断言后修改普通字段，不会改变 `interface` 中保存的值。

```go
package main

import "fmt"

type Param struct {
	Name string
}

func main() {
	original := Param{Name: "旧值"}
	var ext any = original
	param := ext.(Param)

	param.Name = "新值"

	fmt.Println(original.Name)   // 旧值
	fmt.Println(ext.(Param).Name) // 旧值

	ext = param
	fmt.Println(ext.(Param).Name) // 新值
	fmt.Println(original.Name)   // 旧值
}
```

这里有两次复制：把 `original` 存入 `ext` 时复制结构体值，从 `ext` 断言取出 `param` 时再次复制。把 `param` 赋回 `ext`，也不会把变化同步到 `original`。

**结构体复制是浅拷贝，不是深拷贝。** 如果结构体包含 map、slice 或指针字段，复制后仍可能共享 map 数据、slice 的底层数组或指针指向的对象。例如，修改共享 map 中的键值或共享 slice 中已有的元素，可能影响其他副本；重新给副本的这些字段赋值，则不会替换原结构体的对应字段。

所以，不能笼统地说“结构体值复制后，任何修改都与原对象无关”。应继续判断修改的是副本自己的字段，还是字段引用的共享数据。

## 读业务代码时：格式化和校验要看实际操作

遇到下面这样的上下文处理代码时：

```go
param, ok := eventCtx.EventExtInfo.(*Param)
if !ok || param == nil {
	// 返回参数错误。
	return
}

param.Name = normalize(param.Name)
validate(param)
```

这是示意片段，`normalize` 和 `validate` 代表业务中的格式化与校验逻辑。

- `normalize` 的返回值被赋给了 `param.Name`，因此参数已被原地修改。
- `validate(param)` 是否修改参数，取决于它内部的实现，不能仅凭函数名判断。
- 后续步骤如果从同一个 `EventExtInfo` 中取出该指针，会读取到前面修改后的字段。
- 只有需要让上下文保存另一个对象，或者另一种动态类型时，才需要重新给 `eventCtx.EventExtInfo` 赋值。

这里的“修改可见”仅指内存中的共享对象，**不等于已经写入数据库、文件或其他外部存储**。

## 类型断言成功，不代表指针一定非 nil

`interface` 中可以保存一个类型为 `*Param`、值为 `nil` 的指针。此时接口本身不是 `nil`，类型断言也能成功，但不能访问指针指向的字段。

```go
package main

import "fmt"

type Param struct {
	Name string
}

func main() {
	var original *Param
	var ext any = original

	param, ok := ext.(*Param)

	fmt.Println(ext == nil)   // false
	fmt.Println(ok)           // true
	fmt.Println(param == nil) // true

	// param.Name = "新值" // 执行会发生 panic。
}
```

因此，在无法保证输入一定是非 nil 指针时，应同时检查类型是否匹配和指针是否为 nil：

```go
param, ok := ext.(*Param)
if !ok || param == nil {
	// 拒绝无效输入，不继续访问字段。
	return
}
```

## 判断是否需要回写

阅读代码时，按下面的顺序判断：

1. **interface 中存的是什么？** `Param` 值，还是 `*Param` 指针？类型断言只检查并取出对应类型，不会自动改变它。
2. **赋值的目标是什么？** `param.Field` 或 `*param` 修改指向的对象；`param = ...` 只更换局部指针；`ext = ...` 才更换 interface 中保存的值。
3. **需要影响谁？** 修改原对象、替换上下文中的对象、更新调用方变量，以及写入外部存储，是不同的目标。

**核心结论：是否需要回写，不由 interface 决定，而由它保存的动态类型和实际赋值目标决定。**
