---
id: golang-sort
title: sort：排序与比较器
order: 10
relatedPostIds:
  - golang-stl-sort-0x01
---

# sort：排序与比较器

`sort` 包负责按照指定规则排列数据。基本类型切片可以直接调用现成函数；结构体切片可以传入比较函数；需要复用排序规则，或者数据并非普通切片时，可以实现 `sort.Interface`。

这些排序函数都会**直接修改传入数据的顺序**，不会返回一个新的切片。

## 如何选择排序方法

| 场景                                  | 方法                                         | 说明                             |
| ------------------------------------- | -------------------------------------------- | -------------------------------- |
| `[]int`、`[]float64`、`[]string` 升序 | `sort.Ints`、`sort.Float64s`、`sort.Strings` | 不需要手写比较器                 |
| 切片按自定义规则排序                  | `sort.Slice`                                 | 比较函数接收两个下标             |
| 切片需要保留等价元素的原顺序          | `sort.SliceStable`                           | 稳定排序                         |
| 数据类型实现了排序接口                | `sort.Sort`、`sort.Stable`                   | 分别对应非稳定排序和稳定排序     |
| 对已有排序规则改为降序                | `sort.Sort(sort.Reverse(data))`              | `data` 必须实现 `sort.Interface` |

> 本章沿用 `sort` 包的接口。Go 1.21 起也可以使用泛型 `slices` 包；新代码中的普通切片排序可以优先考虑 `slices.Sort`、`slices.SortFunc` 和 `slices.SortStableFunc`。

## 基本类型切片

`sort` 包为三类常用切片提供了升序排序函数：

```go
package main

import (
	"fmt"
	"sort"
)

func main() {
	ints := []int{3, 1, 2}
	floats := []float64{3.5, 1.2, 2.4}
	strings := []string{"Go", "Alice", "Bob"}

	sort.Ints(ints)
	sort.Float64s(floats)
	sort.Strings(strings)

	fmt.Println(ints)    // [1 2 3]
	fmt.Println(floats)  // [1.2 2.4 3.5]
	fmt.Println(strings) // [Alice Bob Go]
}
```

注意类型和排序规则：

- 整数函数接收 `[]int`，不能直接接收 `[]int64`。
- 浮点数函数接收 `[]float64`，Go 中没有 `[]float` 这种类型。`sort.Float64s` 会把 `NaN` 排在其他值之前。
- 字符串按照 Go 的字符串比较规则排序，即按字节进行字典序比较，不是拼音或自然语言排序。
- 数组需要先转换为切片，例如 `sort.Ints(arr[:])`。

## 自定义比较器：sort.Slice

`sort.Slice` 接收一个切片和一个比较函数：

```go
sort.Slice(data, func(i, j int) bool {
	return data[i] < data[j]
})
```

比较函数返回 `true`，表示**当前下标 `i` 的元素应该排在当前下标 `j` 的元素前面**。`i`、`j` 是排序过程中切片的下标，不是元素值，也不是固定的原始位置。

虽然 `sort.Slice` 的第一个参数类型是 `any`，实际传入的值仍然必须是切片，传入其他类型会引发 panic。

下面将人员按照年龄升序排列：

```go
package main

import (
	"fmt"
	"sort"
)

type Person struct {
	Name string
	Age  int
}

func main() {
	family := []Person{
		{Name: "Alice", Age: 23},
		{Name: "Eve", Age: 2},
		{Name: "David", Age: 2},
		{Name: "Bob", Age: 25},
	}

	sort.Slice(family, func(i, j int) bool {
		return family[i].Age < family[j].Age
	})

	for _, person := range family {
		fmt.Println(person.Name, person.Age)
	}
}
```

结果中年龄依次是 `2、2、23、25`。`sort.Slice` **不保证稳定性**，因此不能依赖 Eve 和 David 排序后的相对顺序。

对于年龄降序，把比较符号改为 `>`：

```go
sort.Slice(family, func(i, j int) bool {
	return family[i].Age > family[j].Age
})
```

### 比较器必须满足的规则

比较函数需要形成**严格弱序**。对于按年龄排序的例子：

- 自己不能排在自己前面：`less(i, i)` 必须为 `false`。
- 如果 `less(i, j)` 为 `true`，那么 `less(j, i)` 必须为 `false`。
- 顺序需要具有传递性：A 排在 B 前面、B 排在 C 前面时，A 也应排在 C 前面。
- 当两个方向的比较都为 `false` 时，两个元素在当前排序规则下等价；这种等价关系也必须具有传递性。

因此升序应使用 `<`，不能使用 `<=`；降序应使用 `>`，不能使用 `>=`。对于年龄相同的人，`<=` 会让两个方向的比较都返回 `true`，破坏排序规则。

比较器应该只读取当前元素并判断顺序，不要在其中交换元素或修改用于排序的字段。交换由排序函数完成。

## 稳定排序：sort.SliceStable

稳定排序会保留**比较规则下等价元素**的原始相对顺序。按年龄排序时，只要年龄相同就视为等价，名字是否相同并不影响这一判断。

```go
package main

import (
	"fmt"
	"sort"
)

type Person struct {
	Name string
	Age  int
}

func main() {
	family := []Person{
		{Name: "Alice", Age: 23},
		{Name: "Eve", Age: 2},
		{Name: "David", Age: 2},
		{Name: "Bob", Age: 25},
	}

	sort.SliceStable(family, func(i, j int) bool {
		return family[i].Age < family[j].Age
	})
	fmt.Println(family) // [{Eve 2} {David 2} {Alice 23} {Bob 25}]

	// 年龄相同时再按名字升序，得到明确的多字段排序规则。
	sort.Slice(family, func(i, j int) bool {
		if family[i].Age != family[j].Age {
			return family[i].Age < family[j].Age
		}
		return family[i].Name < family[j].Name
	})
	fmt.Println(family) // [{David 2} {Eve 2} {Alice 23} {Bob 25}]
}
```

这里有两个不同的需求：

- 希望年龄相同的人保留录入顺序，使用 `sort.SliceStable`，只比较年龄。
- 希望年龄相同的人继续按名字排列，在比较器中明确第二个排序字段。

稳定排序不会自动添加第二排序字段。如果采用年龄、名字两个字段，两人只有在这两个字段都相同时才在此规则下等价。

## 实现 sort.Interface

当排序规则需要在多处复用，或者数据由自定义容器管理时，可以通过实现接口交给 `sort.Sort`：

```go
type Interface interface {
	Len() int
	Less(i, j int) bool
	Swap(i, j int)
}
```

| 方法         | 职责                                             |
| ------------ | ------------------------------------------------ |
| `Len()`      | 返回可排序的元素数量                             |
| `Less(i, j)` | 判断下标 `i` 的元素是否应排在下标 `j` 的元素前面 |
| `Swap(i, j)` | 交换两个下标上的元素                             |

`sort.Sort` 通过这三个方法操作数据，不需要知道元素的具体类型。这里的“任意类型”有前提：**传入的类型必须实现接口，并且三个方法需要操作同一组数据**。

```go
package main

import (
	"fmt"
	"sort"
)

type Person struct {
	Name string
	Age  int
}

type ByAge []Person

func (people ByAge) Len() int {
	return len(people)
}

func (people ByAge) Less(i, j int) bool {
	return people[i].Age < people[j].Age
}

func (people ByAge) Swap(i, j int) {
	people[i], people[j] = people[j], people[i]
}

func main() {
	family := []Person{
		{Name: "Bob", Age: 25},
		{Name: "Alice", Age: 23},
		{Name: "Eve", Age: 2},
		{Name: "David", Age: 2},
	}

	// 使用稳定排序，年龄相同时保留原始顺序。
	sort.Stable(ByAge(family))
	fmt.Println(family) // [{Eve 2} {David 2} {Alice 23} {Bob 25}]
}
```

如果不要求稳定性，可以替换为 `sort.Sort(ByAge(family))`。

`ByAge` 是以 `[]Person` 为底层类型的命名类型。`ByAge(family)` 只是类型转换，不会复制底层数组。虽然这些方法采用值接收者，`Swap` 仍然修改了共享底层数组中的元素，所以调用方可以看到排序结果。

## 降序排序：sort.Reverse

`sort.Reverse` 的作用是**反转比较规则**。它返回一个实现了 `sort.Interface` 的包装值，本身不会执行排序，也不会直接把现有元素倒过来。

基本类型也有对应的接口类型：`sort.IntSlice`、`sort.Float64Slice`、`sort.StringSlice`。它们都实现了 `Len`、`Less`、`Swap`，可以配合 `sort.Reverse` 使用。

```go
package main

import (
	"fmt"
	"sort"
)

func main() {
	ints := []int{3, 1, 2}
	floats := []float64{3.5, 1.2, 2.4}
	strings := []string{"Go", "Alice", "Bob"}

	sort.Sort(sort.Reverse(sort.IntSlice(ints)))
	sort.Sort(sort.Reverse(sort.Float64Slice(floats)))
	sort.Sort(sort.Reverse(sort.StringSlice(strings)))

	fmt.Println(ints)    // [3 2 1]
	fmt.Println(floats)  // [3.5 2.4 1.2]
	fmt.Println(strings) // [Go Bob Alice]
}
```

使用上一节的 `ByAge` 类型时，可以写：

```go
sort.Sort(sort.Reverse(ByAge(family)))   // 年龄降序，不保证稳定性
sort.Stable(sort.Reverse(ByAge(family))) // 年龄降序，保留同龄人的原顺序
```

包装后的比较会调用原来的 `Less(j, i)`，而不是对 `Less(i, j)` 取反。对于等价元素，原比较的两个方向都返回 `false`；直接取反会得到 `true`，从而破坏严格比较规则。

“降序排序”和“反转现有顺序”也不同：`[3, 1, 2]` 降序排序得到 `[3, 2, 1]`，直接反转则得到 `[2, 1, 3]`。Go 1.21 起，直接反转切片可以使用 `slices.Reverse`。

## 原地修改与切片共享

`sort.Ints(nums)` 和 `sort.Slice(nums, less)` 都会修改 `nums` 的底层数组。因此，把切片传入函数后进行排序，调用方仍然能看到元素顺序的变化。

如果只想获得一个排序后的副本，需要先复制元素：

```go
package main

import (
	"fmt"
	"sort"
)

func main() {
	nums := []int{3, 1, 2}
	sorted := append([]int(nil), nums...)
	sort.Ints(sorted)

	fmt.Println(nums)   // [3 1 2]
	fmt.Println(sorted) // [1 2 3]
}
```

直接写 `sorted := nums` 只会复制切片头，两者仍共享底层数组；`sorted := nums[:]` 也一样。对于结构体指针切片，复制切片后可以独立调整顺序，但元素指向的对象仍然共享，这不是对象的深拷贝。

## 参考

- [原排序笔记：Golang 中的排序方法](/post/golang-stl-sort-0x01)
- [Go 官方文档：sort](https://pkg.go.dev/sort)
- [Go 官方文档：slices](https://pkg.go.dev/slices)
- [Go 语言入门：sort](https://golang.xiniushu.com/%E8%AF%AD%E8%A8%80%E5%85%A5%E9%97%A8/%E6%A0%87%E5%87%86%E5%BA%93/sort.html#%E8%87%AA%E5%AE%9A%E4%B9%89%E6%8E%92%E5%BA%8F)
- [LearnKu：Go 排序](https://learnku.com/articles/38269)
