---
id: mysql-postgresql-conflict-0x01
title: MySQL 和 PostgreSQL 如何处理插入冲突
excerpt: 区分唯一约束、数据库原生冲突语法与 GORM OnConflict，理解重复插入和并发创建的处理方式。
category: 项目
tags:
  - MySQL
  - PostgreSQL
  - GORM
  - 幂等
author: Marvel-L
rank: 黄金
series: false
draft: false
---

# MySQL 和 PostgreSQL 如何处理插入冲突

阅读 Go 项目的创建逻辑时，经常会看到：

```go
err := db.Create(entity).Error
```

这段代码能保证同一个业务只创建一次吗？如果 PostgreSQL 可以用 `INSERT ... ON CONFLICT DO NOTHING`，MySQL 应该怎么处理？

**MySQL 和 PostgreSQL 都能处理重复插入，但真正保证唯一的是主键或唯一索引。冲突语法负责决定：发生重复时，是报错、跳过，还是更新已有记录。**

## 先区分：主键唯一与业务唯一

假设一张表只有自增主键：

```sql
CREATE TABLE request_record (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    biz_key VARCHAR(100) NOT NULL,
    payload TEXT,
    PRIMARY KEY (id),
    KEY idx_biz_key (biz_key)
);
```

这里的 `KEY idx_biz_key` 是普通索引，只帮助查询，不限制重复。连续执行两次：

```sql
INSERT INTO request_record (biz_key, payload)
VALUES ('order-1001', 'first');

INSERT INTO request_record (biz_key, payload)
VALUES ('order-1001', 'second');
```

两条记录可以同时存在。它们的 `id` 不同，但 `biz_key` 相同。

如果业务规则要求一个 `biz_key` 只能对应一条记录，就需要真正的唯一约束：

```sql
-- MySQL 示例：已有重复数据时，添加唯一约束会失败。
ALTER TABLE request_record
ADD CONSTRAINT uk_biz_key UNIQUE (biz_key);
```

添加之后，数据库才会阻止第二条相同业务键的记录写入。PostgreSQL 同样可以使用 `UNIQUE (biz_key)`；上面的自增建表语法是 MySQL 语法，不能原样复制给 PostgreSQL。

因此，**只有自增 ID 唯一，并不代表业务数据不会重复。没有对应的唯一约束，添加冲突处理语法也无法防止业务重复。**

## PostgreSQL：ON CONFLICT DO NOTHING

当 `biz_key` 已有唯一约束时，可以指定冲突目标：

```sql
INSERT INTO request_record (biz_key, payload)
VALUES ('order-1001', 'first')
ON CONFLICT (biz_key) DO NOTHING;
```

没有冲突就插入；如果与 `biz_key` 的唯一约束冲突，就不新增记录，也不更新已有记录。

也可以省略冲突目标：

```sql
INSERT INTO request_record (biz_key, payload)
VALUES ('order-1001', 'first')
ON CONFLICT DO NOTHING;
```

对本文这种普通主键和唯一约束场景，省略目标后，不再仅针对 `biz_key` 的冲突。显式写出 `(biz_key)` 能更清楚地表达业务意图，其他唯一约束发生冲突时仍可能报错。

`DO NOTHING` 不等于“忽略所有错误”。例如非空约束、检查约束或外键校验失败，仍需要正常处理。

## MySQL：三种常见处理方式

MySQL 不支持原样执行 `ON CONFLICT DO NOTHING`，可以选择以下方式：

| 方式 | 唯一键冲突时的行为 | 适用考虑 |
| --- | --- | --- |
| 普通 `INSERT` | 返回 1062 `Duplicate entry` | 由应用明确识别重复，再报错或返回已有记录 |
| `INSERT IGNORE` | 跳过重复记录，产生 warning | 使用简单，但忽略范围不只重复键 |
| `ON DUPLICATE KEY UPDATE` | 更新冲突的已有记录 | 可以更新业务字段，也可以设置字段为自身值 |

### 普通 INSERT：应用识别重复键

```sql
INSERT INTO request_record (biz_key, payload)
VALUES ('order-1001', 'first');
```

如果违反主键或唯一索引，MySQL 会返回错误码 `1062`。应用可以识别这个错误，再按业务需要返回“已存在”，或者查询并返回已有记录。

需要只处理重复键、保留其他错误时，这种方式通常更明确。不要将所有插入错误都当作重复成功；还要确认冲突确实对应预期的业务键。

### INSERT IGNORE：重复时跳过

```sql
INSERT IGNORE INTO request_record (biz_key, payload)
VALUES ('order-1001', 'first');
```

它可以实现重复时不新增，但不能直接理解为 PostgreSQL `DO NOTHING` 的完全等价替代。`IGNORE` 还可能将某些数据截断、非法值等问题降级为 warning，并调整后写入数据。

因此，使用它时需要接受这种错误处理范围，并关注 warnings。

### ON DUPLICATE KEY UPDATE：冲突时更新自身

如果希望重复时保持已有字段值，可以写：

```sql
INSERT INTO request_record (biz_key, payload)
VALUES ('order-1001', 'first')
ON DUPLICATE KEY UPDATE id = id;
```

这里的 `id = id` 使用已有记录的 ID，不会将它改成新生成的 ID，也不会覆盖已有的 `payload`。

不过，它仍然走数据库的更新分支，可能触发更新触发器，也会涉及锁和受影响行数的处理。所以它与 PG 的 `DO NOTHING` 在“重复时不新增”这个结果上相近，完整语义并不完全一致。

另外，MySQL 的这个语法会响应主键或任意唯一索引上的冲突，不能像 PG 的 `(biz_key)` 那样指定唯一冲突目标。表上存在多个唯一索引时，需要确认每一种冲突都符合预期。

## GORM：统一 API，不代表统一 SQL

Go 代码里的 `clause.OnConflict` 是 GORM 的统一接口，不是某个数据库专属的 SQL：

```go
type RequestRecord struct {
    ID      uint64 `gorm:"column:id;primaryKey"`
    BizKey  string `gorm:"column:biz_key"`
    Payload string `gorm:"column:payload"`
}

record := &RequestRecord{
    BizKey:  "order-1001",
    Payload: "first",
}

result := db.WithContext(ctx).
    Table("request_record").
    Clauses(clause.OnConflict{DoNothing: true}).
    Create(record)

if result.Error != nil {
    return result.Error
}
```

示例使用 `gorm.io/gorm/clause`，并假设数据库已经存在前文的 `uk_biz_key` 唯一约束。

同一段 `DoNothing: true`，GORM 会根据数据库驱动生成不同 SQL：

| 数据库 | 生成的冲突处理片段 |
| --- | --- |
| PostgreSQL | `ON CONFLICT DO NOTHING` |
| MySQL | 对上述有主键的模型，生成 `ON DUPLICATE KEY UPDATE id = id` |

MySQL 的行为依据 `gorm.io/driver/mysql v1.5.2` 的 `ClauseBuilders()`：没有更新赋值时，优先选择模型主键，将该列赋值为自身。

因此，**“冲突时不新增”这个能力不是 PG 独有的；`ON CONFLICT DO NOTHING` 这段原生语法也被 SQLite 支持，但 MySQL 使用不同语法。**

还要注意，普通的 `db.Create()` 不会自动采用 `DoNothing`。即使模型写了 `uniqueIndex` 标签，也需要实际执行迁移或建表操作，才能让数据库拥有唯一索引；一次 `Create()` 不会自动创建它。

### 不要仅凭执行成功判断是否新增

`result.Error == nil` 只说明语句没有返回错误，不代表一定创建了新记录。

PG 的 `DO NOTHING` 跳过时，受影响行数为 0。MySQL 的 `id = id` 在不改变已有值时通常也是 0，但开启 `clientFoundRows` 后可能返回 1，不能跨数据库只凭这个值判断“是否新建”。

冲突时也不要假设传入对象已经得到已有记录的 ID。如果接口需要返回已有记录，应按业务唯一键查询。唯一键相同但请求内容不同的情况，还需要决定是复用、拒绝还是更新。

## 并发创建：先查再插仍可能重复

普通事务中，下面的顺序仍然可能发生：

```text
请求 A：查询 biz_key，未找到
请求 B：查询 biz_key，未找到
请求 A：插入记录
请求 B：插入记录
```

没有业务唯一约束时，两次插入都可能成功。**将查询和插入放进普通事务，本身不会自动让业务键变得唯一。**

当存在唯一约束时，数据库会协调同一键的并发写入。以 InnoDB 下普通 `INSERT` 为例，B 可能等待 A 的事务结束：A 提交后，B 因重复键返回 1062；如果 A 回滚，B 则可能继续插入。添加冲突处理语法后，重复分支可以改为跳过或更新。

Redis 锁可以减少同一业务的并发进入，但还依赖锁键范围、有效期和释放逻辑。对能够明确表达为唯一键的业务规则，数据库唯一约束可以覆盖所有写入入口。

唯一约束保护的是表内记录，不能单独保证通知、RPC 或消息发送等外部副作用只执行一次。

## 唯一键需要符合业务规则

以合同表为例，同一 `contract_no` 可能有多个版本，因此不能直接认为合同号应该全表唯一。

需要先明确约束对象：是合同号与版本的组合、上游请求编号，还是“同一业务只允许一条在途合同”。终态重提和软删除也可能影响这个定义，不能机械地把所有字段拼成联合唯一索引。

业务键确定后，再选择重复时的行为。如果目标是“重复请求返回第一次创建的结果”，通常需要数据库唯一约束、明确的冲突识别，以及查询已有记录这几个步骤共同完成。

## 参考

- [PostgreSQL：INSERT 与 ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html)
- [MySQL：INSERT 与 IGNORE](https://dev.mysql.com/doc/refman/8.4/en/insert.html)
- [MySQL：INSERT ... ON DUPLICATE KEY UPDATE](https://dev.mysql.com/doc/refman/8.4/en/insert-on-duplicate.html)
- [GORM：Upsert / On Conflict](https://gorm.io/docs/create.html#Upsert-On-Conflict)
- [GORM MySQL 驱动 v1.5.2：冲突语法转换源码](https://github.com/go-gorm/mysql/blob/v1.5.2/mysql.go#L195-L240)
