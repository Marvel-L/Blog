---
id: cam-summary-prompts
title: CAM Summary Prompts
excerpt: 寻找出最优解
category: prompts
tags:
  - cam
author: Marvel-L
rank: 白银
featured: true
featured-top: 1
series: false
draft: false
---

# Prompts

你现在是 @CAM 项目的 CTO 技术总负责人

**问题 :**

我想要知道 @cam 中有没有什么模块或者是内容可以用来丰富我的简历

**背景 :**
我在 CEFI组工作，主要负责 cefiacc/, tradeaccbiz/, tradeacc/, exg/, custody/, histoytradev2/ 这几个模块

我工作了2年之后被裁员了，我复盘我整个2年过程，我发现我的工作大多都是重复的，在 exg/和custody/对接交易所和托管行，然后在historytradev2/处理记录

然后我总结了一下我下面的这个简历

**简历如下 :**
```md
负责 CAM 交易所资产管理平台后端：覆盖多交易所账户快照、流水记录、对账与数据修复，支撑资产展示、投组配置与风控告警。

- **异步补齐链路（asyncFlow）**：从 0 到 1 搭建两套高可用流程（申请 → 轮询 → 下载 → 入库），兼容 REST 抓取与交易所 Async 下载，并与账户回溯打通，支撑历史缺口补齐与对账前数据治理
- **Auth 核心表平滑迁移**：针对历史库表设计缺陷，采用双写兼容 + 平滑迁移 + 降级回退，配合灰度发布，一季度内完成核心模块重构并上线
- **用户状态机重构**：改造库表与组内核心逻辑，分迭代推进后台任务，并通过 MQ 同步其他业务组，在兼容旧状态的前提下完成快速上线
- **存储与性能优化**：基于 I/O、Memory 监控定位窄表膨胀，引入 blob + slim 压缩与 blob_format 零停机迁移，一季度内关键路径性能提升约 40%，显著降低存储增长斜率
- **对账与修复工程化**：维护通用快照 / 记录修复 Job 框架，支持按交易所扩展订正逻辑；优化账户状态维护、限流与鉴权；支持 Excel / 大文件导入补齐，并兼容对账模块
```

**面试情况 :**

但是我在一轮面试周期下来，我发现每个任务单独拆并不是一个模块，可以说是一次任务。并不像大厂一样 一个人负责多个模块，导致对于问题“你负责过什么模块，流程是什么样的，难点xx"这种问题很难答上来

同时对于一些C端岗位又会问你这几个项目中是否有并发的需求，怎么处理的，但是实际上工作中也没有

其次面对现有Ai的发展，我们公司也没有主动推进AI的相关需求，所以也没有相关的需求

**目标 :**

我想要提高我的竞争力，增加我面试通过概率，希望能够优化我简历的内容，补充一些高可用的模块或者是内容

# CC

结论先说：**你的问题不是没有内容，而是你把一个平台讲成了一堆任务，而且把最值钱的那块完全漏掉了。**

我用 git 数据核了一遍你的真实产出：1923 次提交，后端净增约 38.3 万行，时间跨度 2023-05 到 2026-07。你现在这份简历，严重低估了自己。

---

## 一、诊断：为什么面试官觉得你"没负责过模块"

你那 5 条 bullet，全部是**动词开头的任务描述**：搭建、迁移、重构、优化、维护。没有一条告诉面试官"我负责的系统长什么样、边界在哪、谁依赖我"。

面试官问"你负责什么模块"，本质是在问三件事：**这个系统的边界是什么 / 它的架构是你定的吗 / 别人怎么接入你**。你答不上来，不是因为没做过，是因为你自己也没把它当成模块看。

有一个数据能直接推翻你的自我认知：你改动 `back/ec/`（整个交易所接入层的**核心接口定义层**）达 265 次。`ec.IAccService` 这个 40+ 方法的接口、`ExgErrorProcessor` 限流器、统一签名抽象都在这里。**改接口定义的人是平台 owner，只实现接口的人才是干体力活的。** 你是前者，但你的简历把自己写成了后者。

---

## 二、你实际拥有的三个模块（按 git footprint 划分）

| 模块 | 你的文件改动数 | 平台量级 |
|---|---|---|
| 交易所/托管统一接入平台（`exg/` + `ec/` + `exgv2/`） | 5195 + 265 + 60 | 你碰过 **166 个**交易所目录，平台注册 **255 种**账户类型 |
| 实时数据同步链路（`exgws_v1/` + `exgws_processor/`） | 300 + 26 | Binance / Coinbase Prime / Panthertrade 等长连接 |
| 历史流水与数据治理（`historytradev2/` + `historytrade_business/` + `tradeacc_reconciliation/` + `globalsnapshot_fix/`） | 1291 + 482 + 245 + 220 | 13 状态任务状态机，S3 冷归档，对账引擎 |

这三块任何一块单拎出来，在大厂都是一个正经模块。你欠缺的只是**用架构语言把它们描述出来**。

---

## 三、你漏掉的最强素材：实时链路与并发

你说"工作中没有并发需求"——这是本次分析里最大的误判。

### 素材 A：`balance_update_processor.go`（441 行，你写的）

这是一份教科书级别的并发面试素材，几乎覆盖了所有八股考点，而且全是真实生产代码：

```67:93:back/exgws_v1/binance/balance_update_processor.go
func (p *balanceUpdateProcessorImpl) Process(account string, clearTime int64, balanceDelta string) {
	p.once.Do(p.start)
	p.accountMu.RLock()
	events, exists := p.accountMap[account]
	p.accountMu.RUnlock()
	if !exists {
		p.accountMu.Lock()                     // 如果不存在，需要创建新的 accountEvents
		events, exists = p.accountMap[account] // 再次检查，避免重复创建
		if !exists {
			events = &accountEvents{...}
			p.accountMap[account] = events
		}
		p.accountMu.Unlock()
	}
	events.mu.Lock() // 现在可以安全地操作 events
	defer events.mu.Unlock()
```

能讲的点，每一个都是面试高频题：

- **两级锁降低粒度**：全局 `accountMu` 只保护 map 结构本身，每个账户有独立的 `events.mu` 保护自己的事件队列。账户之间完全无锁竞争。
- **Double-check locking**：先读锁查、未命中再升级写锁、拿到写锁后二次确认。
- **削峰聚合**：2 分钟聚合窗口 + 50 秒 tick，把同一账户的 N 次 WebSocket 余额变动事件合并成 1 次 REST 查询。这是限流场景下最有效的手段。
- **信号量控制并发**：`concurrencySem chan struct{}` 容量 10，防止瞬时打爆交易所 API 配额。
- **临界区最小化**：第 164-167 行复制切片后立即释放锁，再做耗时的网络请求。
- **指数退避**：1s / 2s / 4s 三次重试。
- **内存泄漏防护**：24 小时不活跃的账户从 map 中清理——这点尤其加分，说明你考虑过长期运行的内存增长。

### 素材 B：你此刻正在写的 `asyn_download_worker.go`——背压设计

```61:76:back/historytradev2/asyn/publisher/asyn_download_worker.go
// enqueueAsynDownload 将已 completed 的任务交给下载 worker；队列满则回灌 Redis，避免丢任务。
func enqueueAsynDownload(detail common.DownLoadIdDetail) {
	startAsynDownloadWorkers()
	job := asynDownloadJob{detail: detail}
	select {
	case asynDownloadJobCh <- job:
		...
	default:
		asyn.Logger.Warn(...)
		store(detail, cam.JsonMarshal(detail), "DownloadQueueFull")
	}
}
```

有界队列（32）+ 固定 worker（3）+ **队列满时回灌 Redis 而不是阻塞或丢弃**。这是标准的背压（backpressure）设计，面试时展开讲"为什么不用无界 channel"、"为什么不阻塞"，非常能体现工程判断力。

### 素材 C：Binance WebSocket API 强制迁移

这是**高可用变更管理**的完整案例。Binance 公告 2025-11-10 停用 listenKey 鉴权方式，这是一个不可协商的外部硬 deadline，迁移失败意味着所有 Binance 账户实时数据全部中断。

你的做法（从你写的 `WSAPI_MIGRATION.md` 和 `BUGFIX_20251104.md` 里复原）：
- `UseWSAPI` 开关让新旧两套鉴权路径并存，默认关闭，改一个布尔值即可全量回滚
- 旧路径：REST 取 listenKey → 连 `stream.binance.com/ws/{listenKey}` → 定期 renew
- 新路径：直连 `ws-api.binance.com` → 发送带签名的 `userDataStream.subscribe.signature` 订阅请求 → 无需 keepalive
- 消息处理要新增分流逻辑：响应消息（`status` 字段）不能透传给业务层，错误消息（`-2015` API key 失效）要触发自动重连
- 附带收益：逐仓杠杆（binancem）从"每个 symbol 一条连接"变成"一条连接收全部 symbol"，**连接数大幅下降**

这条线你踩过的两个坑（方法名要用 `.signature` 后缀才支持 HMAC/RSA；签名串必须按字母序包含 `apiKey` 和 `timestamp`）本身就是很好的面试细节——面试官最喜欢听真实踩坑。

---

## 四、"没有并发需求"这个问题，你的话术要换框架

你被问并发时答不上来，是因为你默认"并发 = 高 QPS 扛流量"。但你做的是**另一类并发问题，而且更难**：

> C 端的并发是"入口流量不可控，我要扛住"；
> 我们的并发是"出口配额被外部硬限制，我要在不被封禁的前提下最大化吞吐"。
> 前者可以加机器水平扩展，后者加机器反而会更快触发限流和 IP 封禁。

围绕这个框架，你有一整套真实答案：

- **配额感知的预判式限流**：`bnutil/blockip.go` 解析 Binance 响应头 `X-Mbx-Used-Weight-1m`，到达 95% 阈值就主动禁用 IP 10 秒，而不是等 429 再被动退避
- **多维度限流**：按 API key / 账户 / 代理 IP 三个维度独立计数（`ec/exgerrorprocessor.go`）
- **请求合并**：上面说的 2 分钟聚合窗口
- **有界并发**：120 goroutine 的抓取请求池（`exg_loop/single_call_job.go`）、信号量限 10、下载 worker 限 3
- **背压**：队列满回灌而非丢弃

把这套讲清楚，比背一遍"如何设计秒杀系统"更能证明你的工程能力。

---

## 五、AI 这块，我要给你一个诚实的提醒

我查了仓库里唯一的生产级 LLM 应用（`cefiacc` 里用 DeepSeek 做账户信息校验，`check_account_info.go`）——**作者是 zhongtaoliu，不是你，不能写进简历**。面试官如果追问实现细节你会当场露馅。

但你有两件真实的事可以讲：

1. **你本人就是重度 AI 编码实践者**。你写的 `WSAPI_MIGRATION.md` 结尾明确写着"实现人员：Claude AI"。仓库里 `AGENTS.md` / `CLAUDE.md` / `back/*/AGENTS.md` 的分层规范体系、`.github/workflows/scheduled_claude_bug_finder.yml` 这个定时 AI Code Review workflow 都是现成的工程实践。
2. **与其编造 AI 业务需求，不如把"AI 辅助研发的方法论"讲成你的差异化**。比如：如何用分层 AGENTS.md 约束 AI 在百万行 monorepo 里的输出质量、如何让 AI 处理 166 个交易所这种高度重复但细节各异的适配工作、AI 生成代码的 review 门禁怎么设。这个话题在 2026 年的面试里，比硬凑一个"AI 需求"可信得多。

---

## 六、改写后的简历

```md
CAM 加密资产管理平台 · 后端研发（CeFi 组）                        2023.05 - 2026.07

平台服务机构客户的多交易所资产管理，后端为 Go 模块化单体 + 94 个可独立部署进程，
Gin / PostgreSQL / Redis Stream MQ。个人累计提交 1900+，主导三个核心模块。

【模块一】交易所与托管机构统一接入平台（exg / ec，平台注册 255 种账户类型）
- 负责接入层核心抽象设计与演进：Acc（业务编排）/ SC（单次请求）双层模型，
  统一 IAccService 接口（40+ 方法）+ 默认实现基类，新交易所仅需覆写差异方法，
  将单家接入从"全量实现"降为"增量覆写"，累计支撑 160+ 家交易所与托管机构
- 设计多维度限流与熔断体系：按 API key / 账户 / 代理 IP 三维独立计数，
  解析交易所响应头权重实现"预判式限流"（阈值 95% 主动降级），
  替代被动 429 重试，显著降低 IP 封禁与账户风控触发率
- 统一密钥与签名：业务进程不持有 API Key，全部经独立 Auth 服务远程签名，
  支持 HMAC / RSA / Ed25519 多算法与母子（prop）账户签名降级回退

【模块二】交易所实时数据同步链路（exgws，WebSocket 长连接）
- 主导 Binance WebSocket API 鉴权迁移（官方 2025-11-10 停用 listenKey 硬 deadline）：
  设计新旧双路径并存 + 单开关灰度，支持秒级回滚；重构消息分流以区分
  订阅响应、鉴权错误（-2015 自动重连）与业务事件；
  逐仓杠杆由「每 symbol 一条连接」改为「单连接全量订阅」，连接数大幅下降
- 从 0 设计余额变动实时处理器（WS 事件驱动 + REST 补全）：
  两级锁（全局读写锁保护账户表 + 账户级独立锁保护事件队列）消除跨账户锁竞争；
  2 分钟聚合窗口将同账户 N 次事件合并为 1 次 API 查询；信号量限制并发账户数；
  指数退避重试 + 不活跃账户定期回收防止内存无界增长
- 扩展 Coinbase Prime、Panthertrade 等交易所 WS 成交与订单推送接入

【模块三】历史流水与数据治理（historytradev2 / 对账 / 快照修复）
- 负责双通路数据采集架构：实时轮询引擎（120 并发有界请求池 + Redis 进度游标 +
  重叠时间窗防漏）与交易所异步导出管线（申请 → 轮询 → 下载 → 解析 → 入库）
- 设计 13 态任务状态机，状态在 PG / Redis / MQ 三层冗余：
  发版重启自动恢复中断任务、下载 worker 有界队列满时回灌队列防丢任务、
  CSV 按文件序号断点续传、下载链接过期自动刷新重试，实现全链路可恢复
- 存储优化：基于 I/O 与内存监控定位宽表膨胀，引入 blob 压缩（zstd/xz，
  编解码器池化复用）+ 精简热表分离 + 180 天冷数据 S3 归档，
  关键路径性能提升约 40%，存储增长斜率显著下降
- 维护通用数据修复框架与对账引擎（期初快照 + 流水 = 期末快照），
  支持按交易所扩展订正逻辑、幂等重跑与历史快照反算

【其他】Auth 核心表双写平滑迁移与灰度上线；账户状态模型重构并经 MQ 同步下游业务方
```

改动要点：每个模块先给**边界和量级**，再给**架构决策**，最后给**结果**。并发和高可用从"没有"变成了贯穿全文的主线。

---

## 七、三个高频问题的应答骨架

**"你负责什么模块，架构是什么样的？"**
选模块一。先画三层（Acc / SC / Util）+ 注册表路由，说清楚"我定义接口、160 家交易所实现接口"的关系，然后主动抛出一个设计权衡：*为什么新增能力要开独立 interface + 类型断言，而不是往 `IAccService` 上加方法*——因为那个接口有 255 个实现，加一个方法全部编译失败。这个回答能立刻证明你是 owner 而不是使用者。

**"有并发场景吗？"**
先用第四节的框架重新定义问题，再用 `balance_update_processor` 展开：两级锁、double-check、聚合窗口、信号量、内存回收。这一个例子足够撑起 15 分钟深挖。

**"最有挑战的项目？"**
讲 Binance WS 迁移。它同时具备：不可协商的外部 deadline、全量账户受影响的爆炸半径、鉴权协议级改造、灰度与回滚设计、真实踩坑（签名串字段序）、以及意外收益（连接数下降）。这是你手上叙事完整度最高的一个故事。

---

最后一个提醒：你说"工作了 2 年"，但 git 记录显示你的提交从 2023 年 5 月延续到 2026 年 7 月，跨度 3 年 2 个月（2024 年 2-5 月有一段空档）。如果那段早期提交属于正式工作期，**你应该按 3 年写**——在简历筛选阶段这是实打实的差别，值得你自己核对一下。