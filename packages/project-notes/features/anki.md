# Anki — 功能范围与子任务进度

## 当前权威状态

### 2026-10-27 登录可见性、同步反馈与白色练习面（最新补充）

- **线上只读复现**：用户在浏览器亲自完成 GitHub 登录后，`/Blog/anki` 可显示卡片库，但顶部仍固定显示「账号登录」；进入 `/Blog/anki/login` 仍显示登录表单和「继续使用当前账号」。本次不修改生产卡片、练习记录或数据库。
- **本地登录修复**：通过既有 `/api/v1/me` 服务端会话取得 GitHub 用户名；已登录只显示用户名与退出，不再给登录入口。已登录进入 login 路由使用 replace 回到 `/anki`，basename 由 router 处理。退出调用既有 POST logout，服务端撤销成功才清理界面；失败保留用户并可重试。退出取消账号/卡片请求；dashboard 401 取消晚到身份响应，防旧用户名复活。
- **同步事实与反馈**：Anki 本来是 API 即时写入，不存在离线上传队列或定时同步任务。本次增加「云端同步」、本浏览器最近收到云端成功确认的时间、下一次事件触发条件及手动同步。手动同步只 GET 拉取库、卡片和统计，不重交失败的保存/评价；进行中的练习保留本轮队列。失败显示未确认，成功拉取不抹掉失败写入标记；退出清除确认时间。未增加定时上传、离线缓存或虚构倒计时。
- **白色练习面**：移除今日练习问答卡、自评、完成/错误状态残留的 `dark:` 样式；自定义天数输入保持白底和 light color-scheme；不修改 html.dark、博客主题、Love 或原型。浏览器测试条件 html.dark=true 时，真实卡片 computed background 为 rgb(255,255,255)，问答及自评可见。
- **最终相关验证**：Anki 34 项 + CloudAccount 8 项，共 42 项通过；前后端 typecheck 通过（使用本机已有 Go 工具链）；全仓 `npx eslint .` 0 errors，4 条原有 HeroQuote/RankFlash Fast Refresh warnings，修改范围无 warnings；git diff --check 通过。
- **全量门禁仍未绿**：本次完整 `npm test`（加最后一条账号竞态测试之前）140 文件、1126 项：1125 通过、1 项 `scripts/upload-cloud-release.test.mjs` 5000ms 超时并伴随 ENOTEMPTY 清理错误；Go 测试段因 && 未运行。后端未改，typecheck 中 go vet 已通过，不将它写成 SQL 测试通过。未调超时/worker、未 skip，也未修范围外发布脚本。
- **构建**：cloud 与 Pages 客户端 Vite 编译通过，cloud 有 Anki chunk，Pages 无 Anki chunk；保留已有 chunk-size 警告。最终 cloud 客户端 Vite 编译也已通过；不冒充完整 SSG/SEO 构建通过。
- **浏览器验证边界**：本地只读样例 `http://127.0.0.1:27421/anki`，标明不连接生产账号或数据库。真实组件已验证 login 路由回跳、用户名/退出按钮、手动同步、问答揭示、白色练习卡及自评；样例写入被禁止，不属于完整真实登录预览。线上控制台曾出现 React #418 水合告警，初始博客闪现的生产根因及其消除仍未验，不据本地 dev 无白屏宣称已修复生产闪现。
- **状态**：改动保留本地，根门禁失败故未 commit、未 push、未部署；用户文章/图片及压缩清单因 gen:data 产生的自动压缩副作用已恢复。原历史结论与备注保持不动。
- **本次提交与推送授权**：用户已知全量门禁有发布脚本超时后，明确要求 Commit & Push；本次仅提交 Anki 登录状态、同步反馈、白色练习面及测试/验证记录，普通推送至当前分支上游 `origin/custom`。提交前重跑 typecheck、全仓 ESLint 和相关 42 项测试；不绕过钩子、不强制推送、不部署。实际提交与推送结果以 Git 返回和最终答复为准。

### 2026-10-27 功能缺口修复（本轮最新，历史记录不改）

- 登录：增加显式 `/anki/login` 和 Anki 顶部「账号登录」入口；匿名 401 仍显示登录门，API 返回 HTML 明确报告服务/代理错误，不伪装成未登录。OAuth 回跳沿用 router basename，仅新增精确 `/anki`、`/Blog/anki` 白名单，保留原 Trend 回跳验证与默认博客回跳。
- 账号退出：取消在途 dashboard，generation 拒绝旧账号晚到响应；清空 toast/弹窗/视图；表单与复习请求卸载取消，不继续建库或回写 UI。
- 练习：全失败队列进入错误态并可重载；部分失败警告贯穿结束页；跨库统一先复习后新卡、合并各卡间隔预览；中途退出刷新统计；整轮完成后台刷新不卸载完成页；单卡重洗隐藏答案。
- 编辑：所属库默认取卡片原库，PATCH 可迁库，服务端校验目标库归属并保留排期；重学提示按实际动作区分。新增 `005_anki_review_snapshot.sql`，新评价保存原库快照，旧日志无来源不猜测回填。
- 建库：分类成功/库失败时复用已建分类；分类响应丢失可从权威列表恢复；取消表单后不继续后续写请求。
- 同范围附带修复：Anki 文本校验不再复用通用 200 UTF-16 长度限制，按 Anki 10000 字符上限校验，补长文本回归。
- 验证：Anki 24 项行为测试通过；相关 Layout/Home 回归通过；前后端 `npm run typecheck` 通过；产品 ESLint 0 errors、4 条既有 Fast Refresh warnings保留。真实本机隔离 PostgreSQL 下 Go 全包 `-race -count=1` 通过，无 SQL skip；迁库隔离/进度/原库历史与 OAuth 回跳已验。
- 构建：server 构建通过；cloud/Pages Vite 客户端编译通过，cloud 有 Anki chunk、Pages 无 Anki chunk。存在 chunk-size 提示；仅客户端编译，不冒充完整 SSG/SEO 构建通过。
- 全量门禁仍未绿：`npm test` 在 gen:data 阶段因用户正在编辑的「114. 二叉树展开为链表」缺少 id/title/excerpt/tags 阻断，未运行后续 Vitest/Go。独立最终 `vitest run` 为 140 文件、1117 项：1116 通过、1 项 `scripts/upload-cloud-release.test.mjs` 5000ms 超时；未改发布测试与超时配置。
- 真实页面：当前 3000/3001 实测都是 Pages Vite，3000 还发生既有依赖缓存 React hook 冲突；未改或停止用户进程。独立 cloud cache 预览 `http://127.0.0.1:27419/anki/login` 已通过浏览器文本和截图检查，可看到 GitHub 登录与服务故障提示。
- 本地无项目 `.env` / 数据库 / OAuth 配置；现有 3001 是 Pages 而不是 API，所以预览仅证明登录页可显示，不代表真实登录/录卡可用。真实 GitHub OAuth、本次生产迁移和线上登录未验；不创建假身份或连接生产数据库。
- 工作状态：修复完成时因根门禁阻断未 commit、未 push、未部署；用户文章和已有 index 状态保持不动。隔离测试 PostgreSQL 已停止，cloud 预览保留运行。
- 后续用户在获知上述门禁限制后明确要求 `commit & push`，本次授权仅提交 Anki 修复、迁移及验证记录并普通推送到 `origin/custom`，不包含用户暂存的文章/图片，不绕过提交钩子、不强制推送、不部署。提交前重新通过前后端 typecheck、修复范围 ESLint 与 Anki 24 项测试；全量门禁限制仍按上文记录。执行结果以实际 Git 返回为准，不提前声明已推送。

**HTML 原型 v3 已完成双端核心验证；2026-10-26 用户当面确认方向后，后端与前端实现已完成并经独立验收：后端 SM-2 标准、004 迁移、schema 隔离、用户隔离、并发幂等、服务端 due 守卫、custom review、编辑保留/历史不删均在真实隔离 PostgreSQL `-race` 下独验通过；前端 desktop 白 shell、topnav、连续列表、揭示/随机浏览、API 接入、登录保护、9 行为测试、编辑保留、账号切换、SSG/Pages 裁剪已通过；typecheck / 根 `npm test`（注入独立 DB，140 文件 1097 测试）/ Go 真 SQL 无 skip / Pages-cloud-server 构建通过。真实生产 OAuth、生产库迁移、公网验收、严格 390px 手机复验未做；无演示数据迁真实账号。**

- 原型：`anki-prototype/anki.html`，浏览器双击打开，无外部资源依赖；v1/v2 备份在 `anki-prototype/_backup/`（`anki-v1.html`、`anki-v2.html`）。
- 功能规则：`ai-rules/anki.md`。
- 本文记录子任务状态；不因原型可运行或前后端在写就把正式功能标为完成。

## 本轮新增导航与待验（2026-10-27）

> 本轮仅记录用户新确认的规则与边界，不追溯改写旧验收事实；checkbox 不动。

- **入口位置新确认**：共享头部品牌导航区在 Love 心形按钮左邻插入 Anki 入口；Pages 与 cloud 两个部署壳都要在共享头部出现；移动头部跟随 Love 当前位置，不强制抽屉重复放置（除非 Love 本身在抽屉里）。Love 按钮本身位置/样式/动效/切换不改。
- **链接形态**：cloud 壳同源 `<Link to="/anki">`（basename 路由注入）；Pages 壳外链 `https://43.138.216.53/Blog/anki` 跳转到受保护服务器上的真实学习页，跳转后账号与 API 在服务器同源完成，Pages 侧不发跨域 API、不引入新鉴权链路。「只读调查」仅为本轮我方核验动作边界，不是该链接对用户的功能定位。
- **Home 大入口移除**：原 Home 首屏 Anki 大入口移除；「继续阅读」及其余 Home 空间/功能原样保留。
- **几何视觉真值**：v3 原型 `anki-prototype/anki.html` 为几何真值；同 viewport 比对容器/边距/typography/buttons/指标/列间距/topbar/review/chart/heat；不反向重写原型。
- **端口与环境**：3000=cloud Vite；3001=用户 Pages Vite，曾被 cloud proxy 误当后端。保护用户进程与环境，不擅改端口/代理。
- **线上调查边界**：本轮我方对 `https://43.138.216.53/Blog/anki` 只读调查与代码/预览验证，不 push、不部署；未发布不标生产生效。
- **待验（本轮不勾）**：严格 390px 手机复验，等 writer 完成证据后再补状态。
- **授权文件范围（本轮扩为 3 个）**：`ai-rules/anki.md`、`ai-rules/layout-nav.md`、本进度文件；不改 Love/home/cloud-platform/AGENT/其他 rules 与源码；用户文章已自行提交，不可改。

### 本轮 F 段最终事实（2026-10-27）

> 本轮只追加事实，不改旧历史验收记录。

- **Nav 落地通过**：Pages 外链 `https://43.138.216.53/Blog/anki`、cloud 同源 `/anki`；品牌顺序 Anki→Love，Love 原 style/behavior 保留；Home 仅移除 Anki 大 section（约 -21 行），继续阅读 40% 回归通过。Nav 相关测试、Pages 外链、390 头部通过。
- **几何实测**（desktop 1440×900 / mobile 390×844，fullpage 高度不同）：main 1100px、边距 35×205、topbar 69、h1 44/620、圆角 24、metrics label/value/unit line-height 1.65、goal 行、deck 列宽 45/528/170/215、glyph 42×47、collection delta +3/-2。早期退修项（四指标/goal 行/单行 topbar/deck 左右 cols/outline/button radius 24/glyph/mobile 真 390）已按上述值修后实测；**仅记录实测项，不对全视图 review/chart/heat 几何做「全部完美」声明**。
- **作者行为 N=3 seen/3 covers**：随机浏览 `apiSet` 含 future 卡、`writes: []`、cuts 隐藏时 `scheduleUnchanged: true`；热力图 focus/tap 通过；独验 hover 未精确复现，保留限制。
- **第二指标**：以「已学」替换原型；不拆 new/streak；真实 history / description 留空，不伪造。
- **测试与构建**：11 Anki 测试 + 相关 67；typecheck 通过；产品 ESLint 0 errors（4 条既有 warnings）；Go 隔离全包通过；Pages/cloud 构建通过；单 worker 根测试 140 文件 1104 全过。
- **根门禁 blocked，不记通过**：默认根 `npm test` 在停本轮 fixture 后仍 29 失败 / 1104 通过，原因未定；本轮源码未 commit、未 push、未部署。
- **原型与线上**：`anki-prototype/anki.html` 未改；线上只读 HTTP 200（自签证书）+ 匿名 401（未登录），未做线上登录测试；production 未生效。
- **环境**：清自建 seed、停 5179/5180；不 drop DB、不动用户 3000/3001/环境。3000 cloud 现为入口故障态，非完整登录预览。
- **本文档不 commit**：因根门禁 blocked，等根门禁绿后再统一中文 commit；本 F 段未勾新 checkbox。

### 恢复阶段补充（2026-10-27 补）

- **真实默认基线**：隔离 commit `c14f5af`，默认 `gen` 1097 total，14 fail（无空格公平 path）；当前 +7 tests = 1104，15–42 不稳。早期 `%20` 装置误差剔除；首失败真实为 `timeout 5000`，与 Search 既有「call outside waitFor」机制分离。
- **fail → 机制 → fix → 默认复验**：
  - fail：Layout.test 4 个面板内容测试（非动画验证）在默认环境下 `timeout 5000`。
  - 机制：测试依赖动画真实时长 340ms，未走 reducedMotion。
  - fix：仅这 4 个测试用 `reducedMotion` `matchMedia` 参数 340→1，并 `fireEvent.mouseOver/open`；保留 2 个真实 340ms 状态/close guard、菜单导航 user click 与全部 assert；未调 workers、default timeout、未 skip。
  - 复验（默认 root blog）：Layout 46 / Home 10 / Anki 11 全绿。
- **根总仍 15 failed**：Rin / Mascot / Search / Trend / scripts，根因未全部解；未授权扩无关功能。不写「所有非回归失败 CPU 饥饿根因已定位」。
- 源码本轮未 commit、未 push、未部署。
- **最终持久验收报告**：主项目 `packages/project-notes/verification/anki-nav-v3-verification.html` 与 `evidence/` 目录，**已由验收 writer 创建并经用户 Read 确认**（evidence 含 `baseline-c14f5af-default-npmtest.log`、`current-default-vitest.log`、`root-after-fix.log`、`_render.png`）；旧 agent workspace 仅历史引用，非主交付。
- **待补（不提前宣称 root 通过）**：nav writer 正在跑最终完整默认根 `npm test`（含 Go `&&` 串联）；此前证据仅 `npx vitest` / `test:blog` 层。最终 default root + Go 是否 run、是否全绿，等该轮结果到再精确补。

### 最终完整 root `npm test` 结果（2026-10-27 收）

- **Full `npm test`（含 gen + blog）**：18 files，**46 fail / 1104 total，exit 1**；其中 **43 timeouts**；Go 段因 `&&` short-circuit **未 run**。
- **代码与上一 run 相同**，但时序范围变化；**不能据此判定外部 CPU 或无回归原因**——不写「本轮外部负载饥饿」。
- **历史 green 不可外推**：此前「Layout 46 / Home 10 / Anki 11 全绿」是 `test:blog` 层历史 run；最终完整 root 下 scope 内 timeout 为 **Layout 6 / Home 5 / Anki 1**，**不得宣称 latest all green**。
- **各自 config 通过项**：单 related 67、单 worker 1104、Go 独立跑——各自配置下结果，不等同默认根全绿。
- 本轮关联 test fix（Layout.test 4 面板 reducedMotion）保留未 commit；用户范围外既有 faults 与基线 14 证据分离。
- **标准 root 未 pass，仍 blocked**；是否修 scope 需 Main 判断，不继续凭重复 quiet window 赌博。
- 源码本轮未 commit、未 push、未部署。

## 本轮提交授权（2026-10-27）

- 用户在已明确获知默认根测试仍失败、改动尚未提交的情况下，明确要求 `commit & push`，本轮据此授权提交与普通推送；不扩展修改范围、不绕过提交钩子、不强制推送。
- 默认根测试最近证据仍为 46/1104 失败（43 项超时），并非通过；相关测试、单 worker 测试与构建的历史通过结果不替代它。
- 提交仅包含本轮 Anki 入口、v3 版式、相关行为测试及规则/进度；原型与范围外产品逻辑不改，验收证据保留于本地 verification 目录。
- 本轮提交前重新执行：`npm run typecheck` 通过；产品 ESLint 0 errors、4 条既有 Fast Refresh warnings；默认并发的相关测试 Layout 46 / Home 10 / Anki 11 共 67 项通过。jsdom Canvas/scrollTo 未实现提示仍存在，不作为浏览器渲染验收。未重新运行全量根测试，不把这次相关通过写为全量通过。
- 本轮推送目标为当前分支的上游 `origin/custom`。提交和推送执行结果以最后交付的实际 Git 返回为准，不在执行前记录“已推送”或“已上线”。

## 子任务与依赖

### A. 方向确认原型 — 已完成

- [x] 检查现有主页、Love 面、项目主题、账号/数据库架构规则。
- [x] 独立 Anki 内容空间，提供返回博客及主页入口示意，不改正式 Home/Love。
- [x] 按分类建库，查看/筛选自己的演示卡片库。
- [x] 录入与编辑 Q & A；练习与列表默认隐藏答案。
- [x] 揭示答案后才能自评；切下一张时自动重新隐藏答案。
- [x] 错误 / 模糊 / 正确、自定义天数、可选展示下一次间隔。
- [x] 原型排期持久化及到期队列；错误卡 10 分钟后下一轮重现，不提前复习。
- [x] 库进度（已学、熟练、待练）、每日去重卡片数、评价次数、目标、近 7 日折线与近 13 周热力图。
- [x] v2 清透浅色与白色毛玻璃替代旧纸色/深绿；仅原型变化，不改博客主题。
- [x] v2 所有非空库均有随机浏览，覆盖未来卡，切卡隐藏答案；浏览不修改排期、不记进度。
- [x] v2 GitHub 式周列/星期行热力色块，默认无数字；悬停/键盘聚焦/手机点击提示。
- [x] 明确标注本机存储、演示账号、示例数据与简化调度，不假装真实登录/数据库。
- [x] 桌面、手机截图检查及完整核心操作链验证。
- [x] 本地规则、阶段状态与复验脚本保留。

### B. 用户确认核心规则 — 已确认（2026-10-26）

- [x] 独立页面信息架构：`/anki`，沿用既有 basename；主页入口独立学习面，保护 Love/阅读模式、Pages-cloud 裁剪。
- [x] 默认三档语义评价（错误/模糊/正确），默认隐藏下次间隔；自定义天数独立提交，不与三档自评互相计入评分。
- [x] 首版调度算法：**SM-2 自适应（非完整 FSRS）**；三档 UI 到 SM-2 内部 EF/间隔的精确映射**以后端实现回报为准**，不在本文预设公式。原型「错误 10 分钟 / ×1.2 / ×2.5」仅为原型示意，不是正式 SM-2。
- [x] 熟练状态：间隔 ≥21 天仅作状态标记，非掌握率。
- [x] 日统计时区与跨日：**Asia/Shanghai 自然日，按服务端实际提交时间跨零点**；客户端时钟不决定调度。
- [x] 修改 Q/A：默认保留进度；用户显式选择才重学；历史评价日志作为不可变记录不删除，迁库保留原库快照。
- [x] 低影响参数沿用原型：每日目标默认 12、可调 1–500；近 7 日折线 + 近 13 周 GitHub 式热力图。

### C. 数据库与受保护 API — 独立 PG `-race` 独验通过；真实 OAuth / 生产迁移未做

> 2026-10-26 最终结论：后端在真实隔离 PostgreSQL 下经独立验收通过下列项；生产 OAuth 会话与生产库迁移未实施。

- [x] 复用既有 Go HTTP API、PostgreSQL 编号迁移（`004_anki.sql`）。
- [x] 分类、卡片库、Q/A 卡片、调度状态、不可变评价日志及必要索引 schema 落地。
- [x] 分类/库/卡片的创建与读取、内容修改按服务端会话用户限制（跨用户拒绝已验）。
- [x] 服务端权威调度与幂等评价事务；防双击、重放（重放键 `cardId/version/rating/custom`）、跨端并发重复入账；并发总数测试通过。
- [x] SM-2 标准公式：q=1/q=3/q=5 映射；`EF' = max(1.3, EF + 0.1 - (5-q)*(0.08+(5-q)*0.02))`；reps 1→1d、2→6d、之后 `ceil(interval_prev * EF_prev)`；q=1 时 EF-=0.54、reps/interval=0、10 分钟初学步。
- [x] 服务端 due 守卫：合法 replay 后再查 due，未到期拒绝、不计量。
- [x] custom review：保留 EF/reps、`reviewCount += 1`、计入当天 unique/reviews，调度侧不推断「正确」。
- [x] 编辑 Q/A 默认保留进度；显式重学才重置；历史评价日志不删，迁库保留原库快照。
- [x] 统计按 Asia/Shanghai 自然日（事务内 `clock_timestamp()` 锁后分桶）与日志聚合。
- [x] 隔离 PostgreSQL 集成测试（真实 PG `-race`，无 skip）：匿名访问失败、跨用户访问拒绝、真实持久化、重放、故障反馈。
- [ ] 真实生产 OAuth 会话接入与双账号端到端隔离验收。
- [ ] 生产库迁移执行与回滚记录。

### D. 正式前端入口与独立页面 — desktop fixture 与 9 行为测试通过；严格 390px 未验

> 2026-10-26 最终结论：当前仓库状态下 desktop 实际 fixture 通过；严格 390px 手机复验未做，不把手机项勾满。

- [x] 在现有前端 workspace 实施页面，不另建第二份博客。
- [x] 主页 Anki 入口（`/anki`，沿用既有 basename）及独立学习布局、返回路径；不影响 Love、阅读模式和原主题。
- [x] v3 视觉：统一白色阅读面、topnav、连续库列表、不堆叠白色统计面板、折线坐标正确（早期截图验收失败项已修复并 Read 通过）。
- [x] Q/A 揭示默认隐藏、切下一张自动隐藏；非空库随机浏览覆盖全卡、切卡隐藏答案。
- [x] 建库/录入/浏览、Q/A 揭示、评价与队列、库进度和每日统计接真实 API。
- [x] 登录保护与 API 错误反馈；退出/账号切换数据清理；编辑 Q/A 默认保留进度。
- [x] 9 项前端行为测试通过；SSG 水合确定性、Pages/cloud 能力裁剪、私有卡片不写入静态产物或 SW 缓存。
- [ ] 严格 390px 手机视口复验（含热力格点击、折线隔项日期、触摸交互）。
- [ ] 真实生产登录态下端到端验收（与 C 段真实 OAuth 项联动）。

### E. 正式验证与部署 — 门禁通过；真实 OAuth / 生产 / 公网未做

> 2026-10-26 门禁结论（独立验收）：
>
> - `npm run typecheck` 通过。
> - 根 `npm test` 注入独立 DB，140 文件 1097 测试通过。
> - Go 侧真 SQL 测试无 skip。
> - Pages / cloud / server 构建均 passed。
> - ESLint：裸 `npx eslint .` 会扫描原型 `anki-prototype/_check_deps/` 第三方依赖并报大量错误（这些错误**不是误报**，是第三方代码不符合本项目规则，但不属产品范围）；按原型 README 排除后，产品源码 **0 errors + 4 条既有 Fast Refresh warnings**（HeroQuote/RankFlash，与本次无关）。
> - 上海自然日日期函数与事务内 `clock_timestamp()` 锁后分桶已代码检查通过；**实际跨午夜端到端未跑**，保留为未验项。
> - 测试分层精确口径：SM-2 为纯函数单测；Q&A 揭示 / 随机浏览为前端行为测试与 fixture 截图；用户隔离 / 幂等 / due 守卫 / 统计聚合为真实 PG SQL 集成测试。不写「全部功能均真实 DB 验证」。

- [x] 类型检查、根 `npm test`（注入独立 DB）、Go 真 SQL 测试无 skip。
- [x] Pages / cloud / server 双目标构建通过。
- [x] ESLint 产品源码 0 errors（按原型 README 排除 `_check_deps/` 第三方依赖后；保留 4 条既有 warnings）。
- [ ] 两个真实账号端到端数据隔离（含生产 OAuth 会话）。
- [ ] 严格 390px 手机视口复验。
- [ ] 用户验收、生产库迁移、公网验收与回滚记录。
- [ ] 实际跨午夜端到端练习（上海自然日分桶）。

## 提交记录（2026-10-26）

- 实现侧串行提交：frontend `fc8fcc9`、server `2b625eb`。
- 本规则与进度文档由本 agent 中文 commit，注明「依据用户授权更新 Anki 规则」；提交后回报 hash 供 HTML 验收记录引用。
- 不 push、不部署；用户已 stage 的 `AM posts/prompts/Anki.md.blk` 保持不动。

## v1 验证结果（保留历史）

### 已执行

1. `npm run typecheck` 通过：前端 TypeScript 与 Go vet 通过。命令提示根 `.env` 未找到并继续；本轮不连接数据库，因此不创建配置、不读取密钥。
2. `npx eslint . --ignore-pattern 'anki-prototype/_check_deps/**'` 通过，**0 errors**。仅排除本地安装的 Python Playwright 验证工具，不排除产品源码；保留既有 HeroQuote/RankFlash 的 4 条 Fast Refresh warnings，未扩大范围修改既有组件。
3. html Skill `shot.py` + 本机 Chrome + 局部 Playwright 对 **1440×900 桌面**及 **390×844 手机**执行核心链：分类建库 → 录入 Q/A → 只显示 Q → 主动揭示 → 正确自评 → 本地排期 → 每日统计。
4. 两个视口的脚本均返回 `passed: true`；验证新卡正确后为 3 天间隔，due-last 与间隔一致，一条评价入账，统计为 1 张 / 1 次；验证 HTML 输入以纯文本呈现、不生成注入标签。
5. 两端报告 status=pass，0 blocker / error / warning；实际查看截图，统计与日期记录均有内容，无水平溢出。
6. 首次检查采用降级引擎，忽略交互脚本，**不作为交互通过证据**；补齐原型目录内的验证依赖后重跑，最终证据为 Playwright 报告。

### 覆盖限制

- 自动核心链只覆盖「正确」评价分支；错误、模糊、自定义、编辑、存储故障、演示退出分支做代码检查，未逐条浏览器自动验收。
- 未运行正式数据库隔离测试、真实 OAuth、多账号/跨设备测试、生产验收；未进行全仓业务回归或构建，因为没有修改正式源码、构建链路或数据库。
- 原型固定乘数与熟练阈值不是完整遗忘曲线算法，待 B 阶段确认。
- 原型日统计依赖本机日期；修改目标会按当前目标重算历史展示，页面已标口径；正式目标快照策略未确认。
- 预览容器可能禁用本地存储；应使用浏览器直接打开本地 `anki.html`。保存失败会留在当前卡片，不推进练习。

## v2 修改与验证

- 最新反馈覆盖旧的原型视觉和统计呈现约定：冷白浅色、半透明模糊、苹果蓝动作色；不修改原博客主题。
- 「随机浏览」与「到期练习」分开。保留到期队列和原调度规则；未到期卡也能随机浏览，无评价、无数据写入。
- 最近 7 日改折线。GitHub 式近 13 周热力：周列 / 星期行、未来隐藏、无单格常驻数字；提示使用真实去重统计，固定色阶；点击仍可选日期查看既有明细。视窗由旧 28 日改为 13 周用于呈现热力密度，是可调整的原型展示选择。
- 本地存储键和结构保持 v1，旧库/卡片/排期不迁移、不重置。
- `verify-flow.js` 扩展：原自评排期与每日统计链 + 折线实体/旧柱图消失 + 热力默认无文字/悬停显示/离开收起 + 无到期单卡库可浏览/重洗隐藏答案/数据快照不变 + 多卡库整轮无重复/覆盖所有卡/切卡隐藏答案。
- 最终多卡断言与折线标签修改后已复验：1440×900 桌面、390×844 手机均 passed=true；0 blocker/error/warning，无控制台错误和横向溢出。已查看最终统计两端截图及卡片库桌面截图。
- ESLint 已通过（0 errors，既有 HeroQuote/RankFlash 4 条 Fast Refresh warnings 保留），类型检查已通过；根 `.env` 缺失提示与 v1 相同，不接数据库。
- 不做真实登录、数据库、多账号或生产测试；不发布/推送。

## v3 整体重设计与验证

- 用户否定 v2 的独立分块布局，v3 完全重写 CSS、导航、卡片库和统计页面；不是给 v2 追加样式覆盖。
- 取消侧栏、卡片网格、四格统计容器和右侧多个面板；顶部三项导航、连续库列表、行内统计、统一白色阅读面。问答练习保留单张主体卡片；透明只用于导航和弹层。
- 重画折线：ResizeObserver 获取容器实际宽度，viewBox 与容器一致，完整零基线/数值轴/日期轴；不用 preserveAspectRatio=none，不拉伸线条圆点，窄屏隔项日期。统计仍来源于原日志，不改变数值与口径。
- 原本地数据键、结构、排期算法、建库录入、Q/A 揭示、随机浏览和热力图保留，不重置已有数据。
- `verify-flow.js` 已补图表宽度、禁止拉伸、轴标签、旧侧栏和网格不存在断言；已有建库→自评→统计→未到期单卡/多卡随机浏览→存储不变链继续通过。
- 最终操作链报告桌面 1440×900、手机 390×844 均 passed=true，0 blocker/error/warning；实际查看统计双端与首页布局截图，无水平溢出或控制台错误。
- 首页手机首区统一子容器宽度后已复验：最终首页桌面/手机报告 status=pass，0 blocker/error/warning。未修改正式前后端，不做数据库或生产验证。
- 类型检查通过，ESLint 0 errors，保留原有 4 条 Fast Refresh warnings；未运行无关业务全量回归或构建。
- v2 已备份到 `anki-prototype/_backup/anki-v2.html`；不交付旧版备份，不推送/部署。

## 本轮文档更新记录（2026-10-26）

- 依据用户当面授权，将阶段由「原型待确认」翻转为「用户已确认正式开发」；仅更新 `ai-rules/anki.md` 与本文件，不改动 AGENT.md、其他 ai-rules、正式前后端源码、用户 `posts/prompts/Anki.md.blk`。
- 写入三项承重规则（详见 `ai-rules/anki.md`「用户已确认的核心规则」）：
  1. SM-2 自适应（非完整 FSRS），三档 UI 默认隐藏间隔，自定义天数独立提交；
  2. Asia/Shanghai 自然日按服务端实际提交时间跨零点；
  3. 修改 Q/A 默认保留进度，显式选择才重学，历史评价日志不删除。
- 明确：精确 SM-2 三档评分映射以后端实现回报为准；原型「错误 10 分钟 / ×1.2 / ×2.5」仅为原型示意，不是正式 SM-2，不得冒充。
- 工作文件保持未提交；待全仓门禁（typecheck / eslint / 相关单测 / 双账号验收等）通过后，中文 commit 仅包含这两份自有文档，提交信息注明「依据用户授权破例更新 ai-rules」。
- 不 push、不部署、不动用户 index；用户向最终 HTML 验收记录由独立验收 agent 在门禁后制作，本文不重复产出 Markdown 最终交付。

### 阶段性补充与最终结论

- 后端第一轮算法被退回（仍沿用原型倍率）；第二轮已按官方 SM-2（<https://www.super-memory.com/english/ol/sm2.htm>）修正落仓。
- 三档映射 q=1/q=3/q=5；`EF' = max(1.3, EF + 0.1 - (5-q)*(0.08+(5-q)*0.02))`；成功 reps 1→1 天、2→6 天、之后 `ceil(interval_prev * EF_prev)`，连续 correct 序列 1→6→17→48；q=1 时 EF-=0.54、reps/interval 归零、10 分钟初学步。
- custom review：EF/reps 不变、`reviewCount += 1`、计入当天 unique/reviews，调度侧不推断「正确」。
- DB 事务内 `clock_timestamp()` 锁评价时间戳后按 Asia/Shanghai 分桶；重放键 `cardId/version/rating/custom`；服务端 due 守卫：合法 replay 后再查 due，未到期拒绝、不计量。
- 前端首次截图视觉验收未通过（纸色背景 / 非 v3 白空间 / 多白色统计面板 / 折线 y 轴反向），已修复并 Read 通过。
- 测试分层：SM-2 纯函数单测；Q&A 揭示 / 随机浏览为前端行为测试与 fixture 截图；用户隔离 / 幂等 / due / 统计为真实 PG SQL 集成测试。
- ESLint 精确口径：产品源码 0 errors（按原型 README 排除 `_check_deps/` 第三方依赖后）；第三方错误是其代码不符合项目规则，不属产品范围，不是「误报」。
- 仍未验：真实生产 OAuth、生产库迁移、公网验收、严格 390px 手机、实际跨午夜端到端；无演示数据迁真实账号。
- dev `http://localhost:3000/anki` 仅 Vite 常驻；Go/OAuth 未配置时只呈现 API 故障态，**不得宣称完整可登录**。
- 用户向文档不写测试密码、DSN、主机或内部连接信息。

## 本地工作文件

- `anki-prototype/README.md`：打开与复验说明。
- `anki-prototype/verify-flow.js`：交互验证脚本，仅给 `shot.py --eval-file` 使用。
- `anki-prototype/_shots/`：初始截图与报告；`_checks/`：最终操作链截图与报告。
- `anki-prototype/_check_deps/`：局部 Playwright 验证依赖，不是产品依赖。
- 上述工具依赖与截图被原型目录 `.gitignore` 排除，不进入正式部署。

## 范围保护

v1 时用户已有 `posts/prompts/Anki.md.blk` 改动保持不动；v2 开始工作区为干净状态。本轮只修改用户已授权的两份文档（`ai-rules/anki.md` 与本进度），不修改 AGENT.md、其他 ai-rules、正式前后端源码或数据库，不执行 push 或部署。
