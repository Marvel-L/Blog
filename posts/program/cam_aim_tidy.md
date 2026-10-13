---
id: cam-aim-tidy-0x01
title: 1Token Cam 工作整理
excerpt: 整理出发
category: 项目
tags:
  - 日常
  - 假期
author: Marvel-L
rank: 青铜
series: false
draft: false
coverImage: /posts-img/life/choose/北京工作切换Final/img.png
---


我会先用 `Gzm`、`gzm`、`DDLGitGzzhM` 等身份检索 CAM 仓库的提交，确认你真正主导过的模块和时间跨度；随后给你一套以简历、面试与能力证明为目标的拆分方案和现实工期。

身份已确认：`gzm <92099020+DDLGitGzzhM@users.noreply.github.com>`，另有 `gzm@1token.trade`。提交记录显示你的实际工作远不止“对接资产和数据”：交易所接入、账单/对账语义、异步抓取恢复、错误标准化、配置迁移、缓存与 API 检查都覆盖到了。接下来我会把这些提交归并成能用于 3 年经验叙事的能力块，而不是按交易所名字罗列。
**Gathering precise stats**

I realize we need more precise statistics, including authored date ranges, file path clusters, and commit subject groupings. I'm thinking about using Python, but it seems like the developer prefers a simpler shell approach, possibly with awk. It might require parsing the git log with numstat using a specific format marker. Dynamic visuals might not be necessary, but we should have a plan in place. Let's start with the data collection first.



**Considering git author regex**

I’m thinking about the author regex in git and how it doesn’t seem to work as expected. I should use `--author='gzm'` which catches both entries as output. Now, I want to avoid duplicates in the logs. Using `git log` to filter by author should work well since it includes both entries for gzm and likely no others. So, that seems like a useful approach!



整理范围可以控制，不需要试图把 3 年 CAM 全部复述。提交历史从 `2023-05-28` 到 `2026-07-09`，按 `gzm` 统计有 2567 条原始提交记录（包含合并与回填，不等于 2567 个独立需求）；高频修改集中在 `exg`、`historytradev2`、账户配置、对账、异步任务与错误治理。这足够支撑 3 年经验叙事，但必须压缩成少数可讲清的能力域。
**Evaluating project organization**

I'm considering the number of commits, which is 2567, but that includes branch duplicates, so it's not all independent. The file change counts show occurrences. The user is asking about breaking this into parts; I think we can say 6 blocks and estimate around 7-10 days of focused work, maybe up to two weeks overall. They probably want a complete project organization, so using a visual aid like a PureShow widget or Gantt chart would be helpful for clarity. I'll need to create compact stages, documenting each step effectively.

**Reviewing provided material**

I need to check the selected materials available from previous user messages, as they may not be in the latest tools. The full transcript should be inclusive. Regardless, I know what’s commonly available. I’m thinking about creating a simple node flow to clarify things. I might need to call a tool for this, but I should keep my commentary concise and to the point to maintain clarity and stay within the user's focus.



身份确认：你的提交身份是 `gzm <92099020+DDLGitGzzhM@users.noreply.github.com>`，另有 `gzm@1token.trade`。

CAM 历史从 `2023-05-28` 到 `2026-07-09`。按 `gzm` 搜索得到 2567 条原始记录，包含合并、回填和重复分支，不应直接当作工作量；但覆盖面已经足够支撑 3 年经验。

不要按模块或交易所整理。建议压成 **6 块能力域 + 3 条主案例**：

1. **交易所接入与账户模型**
    - `exg`、`tradeacc`、`cefiacc`、`custodyacc`
    - 重点：异构鉴权、账户层级、资产/持仓统一模型、API Check。
    - 证据：PantherTrade、Polymarket、Gate Earn、Kraken Earn 等接入提交。

2. **历史交易与异步抓取**
    - `historytradev2`、`exgws_v1`
    - 重点：分页与时间窗、异步任务状态、重启恢复、多任务处理、WebSocket 与 REST 协同。
    - 证据：`recover packaging_data tasks after restart`、OKX/Binance/Bybit 异步任务改造。

3. **账单语义、账务与对账**
    - `tradeacc_reconciliation`、`ledger`、`blotterservice`
    - 重点：把交易所原始流水映射为平台标准账单，处理理财、借贷、质押、划转、手续费和对账。
    - 这是你最有业务壁垒的一块，应作为第一主案例。

4. **数据质量与修复治理**
    - `globalsnapshot_fix`、`version`、脏数据修复任务
    - 重点：历史数据修复、迁移版本、补跑、幂等与回滚风险。
    - 证据：`v2.273 migration`、交易所配置迁移、账单脏数据处理。

5. **配置平台与客户交付**
    - `assets/configuration`、`tradeaccbiz`、`cefiacc`
    - 重点：交易所能力配置、账户类型开关、私有化环境差异、权限与可用性控制。
    - 这能把“做配置”提升为“多租户/多环境配置治理”。

6. **稳定性、可观测性与性能**
    - 错误码标准化、超时、缓存、告警、测试
    - 重点：`ExgExactError` 统一错误、`sync.Once` 缓存、API Check 误报、HTTP 错误治理、单测。
    - 这块不要独立讲成项目，而是嵌入前三条主案例，体现工程判断。

**主案例只选 3 条**

- **案例一：一个交易所或账户产品从接入到可用**
    - 例如 PantherTrade、Polymarket、Kraken Earn。
    - 讲清账户、资产、持仓、订单/流水、配置、测试如何接通。

- **案例二：异步历史抓取的可靠性治理**
    - 重点是异步状态、任务重启恢复、时间窗、Redis 状态、重试与降级。
    - 这是最符合 3 年 Go 后端“系统能力”的案例。

- **案例三：账单标准化与对账**
    - 选一个理财/质押/借贷/划转场景。
    - 讲清外部账单语义为什么复杂，如何映射、对账、修历史数据和验证。

**工期**

- **7 个有效工作日**：能产出面试可用初稿。
- **10-14 个有效工作日**：能完成项目地图、3 个 STAR 案例、简历项目描述、系统设计图和模拟问答。
- 不建议超过 2 周。两周后边整理边投递、边模拟面试，比继续考古更有产出。

**具体节奏**

1. 第 1-2 天：从提交按上述 6 块打标签，不读全部代码。
2. 第 3-6 天：每个主案例挑 5-10 个关键提交，反向还原需求、方案、数据流、测试和结果。
3. 第 7-9 天：补项目架构图、核心数据模型、异步链路、失败场景与权衡。
4. 第 10-14 天：写简历，录音口述三次，按“为什么这样设计”“失败怎么办”“规模和效果”做追问复盘。

最终交付物不应该是一本 CAM 全量文档，而是：

- 1 份 CAM 项目地图
- 3 个可深挖 STAR 案例
- 1 张架构/数据流图
- 1 页简历项目描述
- 20 个高频追问及答案

你现在最该避免的是把 5000 多处 `exg` 文件改动按交易所列成流水账。面试官真正关心的是：你如何把不稳定、异构的外部交易所数据，稳定地转换成内部可用、可对账、可修复的数据系统。