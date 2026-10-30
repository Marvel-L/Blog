# Anki — 功能范围与子任务进度

## 当前权威状态

### 2026-10-30 AI 检查失败诊断补充（本地实现，未发布）

- **用户确认范围**：补充失败时的请求诊断留存与历史详情展示；不重发已有 AI 请求，不修改评分、卡片排期、账号设置或生产数据库。
- **后端**：新增 `010_anki_ai_diagnostics.sql`，以可空 `diagnostic` JSONB 保存失败阶段、安全具体原因、HTTP 状态、厂商请求标识（响应提供且通过校验时）、响应完整/截断标记、返回模型/结束原因及厂商 token 用量（缺失时不伪造为 0）。失败响应正文先脱敏再截断，最多保存 16 KiB；整体读取仍有 256 KiB 硬上限。评分校验标准不放宽，错误可指出缺少字段、字段类型或空建议等原因。worker 保留诊断，仍只调用一次上游。
- **保护边界**：诊断只通过本人检查详情返回，列表摘要不附带正文；复用会话、归属校验与 no-store。API Key/Bearer 凭据脱敏，不输出到应用日志；响应按纯文本渲染，不执行 HTML。删除记录同时清除诊断，迟到 worker 不能复活；旧记录无诊断保持空值，不伪造历史响应。
- **前端**：原 AI 历史/Review 详情内增加默认折叠的“检查诊断详情”，展示原因、阶段、HTTP、响应及截断提示；说明厂商 token 用量不代表已确认扣费。查看/展开不发评分请求。没有诊断的旧记录明确提示无法补回。
- **已验**：Anki 全范围 9 文件/107 项通过（AI 18 项）；typecheck/Go vet 通过；全仓 ESLint 0 errors、8 条既有 Fast Refresh warnings，本次文件没有新增 warning。独立本地 PostgreSQL 下 Go 全包 `-race -count=1` 通过，SQL 无 skip，覆盖真实持久化、账号隔离、删除、旧记录与 worker 不重发。上游 fixture 覆盖 401/402/429/500/302、读取超时、格式失败、截断与脱敏边界、缺失用量不造零。
- **浏览器已验范围**：真实 React 组件本地只读模拟接口，1280×960 视口可展开诊断并读回具体原因/HTTP/原响应；诊断宽 722px，页面无水平溢出。截图已检查；没有做严格 390px、真实厂商或线上新版验收。临时预览已停止并恢复原线上标签页。
- **全量门禁仍阻断**：首次完整前端 156 文件/1264 项通过，Go 段因测试清理时短暂引入未使用变量而编译失败，已修复且 Go 全包独立复验通过。修后完整根测试为 1263 通过/1 失败；分离数据生成后的默认 Vitest 复验仍为 1263 通过/1 失败，均是范围外 `scripts/upload-cloud-release.test.mjs` 在 5000ms 超时，后一轮 Go 串联未执行。未修改无关上传脚本、timeout/workers 或绕过门禁，暂不 commit。
- **交付状态**：代码保留 `/Users/yuean/Blog` 本地，未 commit、未 push、未部署、未执行生产 010 迁移、未新增真实 DeepSeek 调用。正式生效需后续门禁通过并发布含 010 迁移的新后端与前端；历史两条丢失的响应不能恢复。
- **后续提交与推送授权**：用户在已知上述全量上传脚本超时限制后明确要求 `commit & push`，本次依据用户授权破例提交诊断留存、010 迁移、详情展示、回归测试及本记录，普通推送当前上游 `origin/custom`，同时包含此前本地提交 `b808dce` 的状态刷新/超时归类修复。不修改无关上传脚本或测试参数，不跳过钩子、不强推、不主动部署或重发 AI 请求；实际提交/推送以 Git 返回为准，历史门禁失败记录保留。

### 2026-10-27 沉浸式随机浏览与同步悬浮球（本轮）

- **实现**：随机浏览改为占据剩余屏幕空间的单张大卡牌，长内容在卡内滚动；前后切换分别触发 520ms 方向翻动，重洗触发 720ms 卡组错位展开/收拢。每次切卡重洗隐藏答案、归位卡内滚动；重洗回第一张。保留标签、真实终身次数、全卡读取及只读边界，不新增评价或排期写入。减少动态效果时关闭装饰动画。随机浏览暂隐藏草稿入口，返回库仍可访问草稿。
- **同步**：旧顶部同步说明改为右下角悬浮球，不占文档流；点击打开同步弹层和手动同步按钮。5 分钟为本轮可调整 UI 时效阈值：成功确认 5 分钟内绿色，超时或请求失败红色，无确认中性灰色；同步中旋转反馈。时效计时不触发请求，后台恢复重新校准。继续使用既有 API 事件，失败写入不会被成功拉取抹掉；关闭/Escape 归还焦点、Tab 在弹层内循环。
- **自动验证**：Anki 9 文件 98 项通过，包含新增 8 项翻牌/重洗/单卡边界、时效精确边界、后台恢复、失败写入标记、卸载清理与 SSR 水合检查；前后端 typecheck 通过。全仓 lint 按原型 README 排除 `_check_deps` 第三方依赖后 0 errors、4 条既有 Fast Refresh warnings，改动无新增 warning；裸 eslint 扫描第三方依赖产生错误，未更改配置或依赖。最终复验结果以本轮交付为准。
- **完整测试限制**：本轮 `SKIP_IMAGE_COMPRESS=1 npm run test:blog` 为 151 文件/1204 项，1203 通过，发布脚本 upload-cloud-release 一项默认 5000ms 超时；独立复验该文件 4 项通过，不等同全量通过。不修改范围外脚本、默认 timeout/workers；本轮未运行 Go SQL 集成测试，后端无改动，Go vet 已通过。
- **浏览器验证范围**：独立 Vite 只读示例真实挂载现有页面，GET 示例卡与统计，不连接生产或数据库，写请求全部拒绝。DOM/实际按钮验证下一张和上一张分别设置 next/previous、对应 CSS 动画名生效、切卡答案移除；洗牌三层对应动画且归首卡；悬浮球可打开手动同步弹层。截图通道未可靠显示卡牌与悬浮球渲染层，故不宣称像素级或严格 390px 验收完成；外部资源 DNS/404 仍存在。
- **交付与边界**：源码位于当前仓库，预览 `http://127.0.0.1:29491/anki?view=browse&deck=preview-deck`，明确为只读示例。复用脚本 `packages/project-notes/verification/anki-immersive-preview.mjs`，根目录运行 `node packages/project-notes/verification/anki-immersive-preview.mjs`。未 push、未部署，生产页面尚未生效；原型、主题、Love、账号 API 与数据库不改，历史记录保留。

### 2026-10-27 AI Key 启用与交互修复（最新）

- **范围**：用户要求修复无法配置 API Key、Ai Check 与编辑按钮接近、账号录入一次后登出/再登录不重复录入，并 commit & push。本轮不更改评分/复习逻辑或清理用户数据。
- **服务端修复**：Compose API 增加 ANKI_AI_ENCRYPTION_KEY / KEY_ID / MODEL 的显式传递，部署 .env.example 补齐。初始化脚本仅在没有既有密文、没有主密钥时生成随机 32 字节标准 base64；有效值保留，非法/重复值或有密文缺密钥时拒绝覆盖。主密钥仍需分离备份，不自动轮换。
- **线上已修**：只读确认当前 ecd7fac release 已运行、009 表存在、已加密配置为 0 后，按本次修复授权安装独立运维脚本，持发布锁且不改不可变历史 release，以临时 Compose override 仅重新配置现有 API。主密钥写入 root 私有 cloud.env，未输出；API healthy，公网 health 成功，已登录 AI 设置读取完成后“保存配置”不再禁用、未再提示加密不可用。未输入真实用户 Key、未调用 DeepSeek，未改业务数据库/证书/Web。后续发布新 Compose 继续从同一环境文件取主密钥。
- **交互与持久化**：编辑和 Ai Check 共用卡片按钮样式，双端真实 React fixture 实测均高 30px、12px 字号、6px 12px 内边距；仍只打开弹窗，不自动 Check。已配置时显示掩码与“修改 API Key”，默认无输入框；主动修改才显示空输入，取消清空草稿且不写配置。Key 一直按服务器账号存库，登出仅撤销会话，不删除配置；新增真实 SQL 测试覆盖登出、重新登录、重建 API 实例保持原密文/nonce/version和解密结果，其他账号隔离。
- **验证**：Anki 前端 90 项通过（AI 9 项）、部署 Python 4 项通过；typecheck / eslint 0 errors（4 条既有 warnings），Go 隔离 PostgreSQL全包 -race -count=1 通过。完整默认根 npm test 149 文件/1196 项及串联 Go 全过（与此前1193/1194失败为不同版本，不改写历史）。完整 cloud 构建/SSG/SEO审计通过，保留既有体积/内容提示。真实生产保存用户 Key 和真实 DeepSeek 仍未验；新前端需本次 push 后的发布完成才在公网生效。
- **提交与推送**：完成本轮验证后仅提交上述修复、测试、运维脚本和说明到 origin/custom；不加入本机截图/备份/日志/工作脚本，不跳过钩子、不强推。实际提交/push 和自动发布状态以现场返回为准。

### 2026-10-27 Anki AI Review（本轮开发，未发布）

- **最新交互**：卡片“编辑”右邻增加 Ai Check；点击只打开操作弹窗，提供“开始 Check / 查看 AI 历史”，不立即评分。AI 历史不在卡片上另放入口，不追加到列表末尾。配置保存不自动评分；历史只读、可复制/删除，复制原问题、原答案和 AI 评价。原答案揭示、复习统计与排期保持原链路。
- **后端**：新增 009 SQL：用户加密 Key、单轮快照、数据库任务队列与请求 receipt；服务端会话授权、Origin/no-store、mutationId 幂等、同卡 active 唯一、用户频率与运行容量约束。Go worker 单轮调用固定 DeepSeek HTTPS 端点，禁止重定向，不自动上游重试；严格 JSON 与 0–100 分校验。超时/结果不确定无得分，保留安全状态。编辑卡片不改历史；删除清空内容并保留短期幂等墓碑，旧 worker 不复活记录。
- **密钥**：AES-256-GCM，随机 nonce，AAD 绑定用户和配置版本；主密钥仅服务端环境 `ANKI_AI_ENCRYPTION_KEY`，未配置时 AI 不可用但旧 Anki 不受影响。配置详情返回掩码，不回读 Key；替换/删除取消 queued 任务，已发上游不能保证撤回或退款。主密钥轮换需运维重加密，不支持直接遗弃旧密钥；本轮没有实现自动轮换工具。
- **验证**：新增 8 项前端测试通过；真实隔离 PostgreSQL 下 Go 全包 `-race -count=1` 最后复验通过，覆盖归属/并发/幂等/快照/删除/worker 超时不重试/lease 与配置变化；类型检查通过，全仓 ESLint 0 errors，保留 4 条既有 HeroQuote/RankFlash warnings。正式 React 双端 1440×900 / 390×844 核心流程通过，但 API 为浏览器拦截 fixture，不是真实 OAuth 或真实厂商调用。Go 二进制与 cloud/Pages Vite 客户端编译通过，Pages 裁剪 Anki；未做本轮完整 SSG/SEO 构建。
- **完整根门禁**：中间版本 `final-full-test.log` 为 148 文件 /1192 项全过，随后 Go 全包通过；最后新增 2 项回归与摘要查询调整后，`accepted-full-test.log` 为 148 文件 /1194 项，1193 通过、1 项既有 `scripts/upload-cloud-release.test.mjs` 在默认 5000ms 超时，Go 串联被跳过；最后 Go 全包已另行独立通过。不得把中间通过当成最新全绿。未调整超时、workers、skip 或修改无关脚本，根门禁未全绿，因此未 commit。
- **未完成/发布边界**：没有真实 Key 联调，没有生产 OAuth、业务库 009 迁移、push、部署或线上验收。正式使用前需运行新版编号迁移并注入加密主密钥，用户登录后配置自己的 DeepSeek Key；本轮不修改真实 .env 或业务数据库。测试数据库为本轮独立实例，关停后保留工作区文件；原型数据不迁入正式账号。
- **本次提交与推送授权**：用户获知最新全量根测试仍有上传脚本超时后明确要求 `Commit & Push`，本次依据用户授权破例提交 AI Review 源码、009 迁移、相关测试、最终原型和说明，普通推送当前 `origin/custom`；不包含本机截图、旧原型备份、测试工具及日志，不绕过 Git 钩子、不强推、不部署或迁移业务库。提交前复验类型检查、全仓 ESLint 与 Anki 相关测试；Git 实际结果以提交与推送返回为准，历史门禁失败保持不变。
- **证据位置**：`anki-ai-review-prototype/formal-ui-evidence/`（真实组件双端截图及 ui-report.json）、`accepted-full-test.log`（最新根测试失败范围）、`final-full-test.log`（中间完整通过），开发说明另存 `anki-ai-review-prototype/Anki-AI-Review-开发说明.md`。

### 2026-10-27 刷新首帧闪回 Blog / 黑屏修复（本轮）

- **原因已核查**：线上 `/Blog/anki`、query 视图和 login 入口返回与 Blog 首页相同的 HTML；浏览器刷新记录 React #418，地址仍在 Anki。不是实际导航回首页，而是错误的首页静态树被当作 Anki 水合，随后重新生成页面；懒加载占位露出博客底色。
- **本地修复**：统一 SSG 流水线仅在 cloud 生成 `anki/index.html`、`anki/login/index.html`，只含无账号/卡片数据的初始学习壳；Nginx 精确入口直接提供对应文件，保留 query 且不强制目录重定向，制品缺失返回 404 而非博客首页。Anki 懒加载使用全屏白色占位；静态壳内联白底样式随 `.anki-surface` 存在生效，离开学习面自动失效，不改主题存储与 Love 模式逻辑。旧回退 HTML 的客户端入口不再错误水合；有效 Anki SSR 树仍使用 hydrateRoot。
- **构建与静态检查**：完整 cloud 和 Pages 构建、SSG、SEO 与部署隔离审计通过；新学习壳已补非可见 h1，SEO 无新增标题/description错误。独立 HTML 解析验证两个入口各有一个 Anki surface、一个 h1、无 Blog shell；Pages 无 Anki 静态入口和 Anki JS/CSS chunk。完整前后端 typecheck 通过，全仓 ESLint 0 errors、4 条既有 Fast Refresh warnings；本轮改动无新增 warning。
- **相关回归**：最终 Anki 与 SSG/路径/水合保护共 9 文件、104 项通过；包含旧首页回退拒绝、有效学习壳保留、根/子路径部署、Pages 保护、真实 SSG 文件落盘和加载期白色学习面。
- **浏览器验证**：实际 cloud 构建在本地只读模拟 API 下验证 `view=deck&deck=refresh-deck` 刷新保留库详情，刷新加载期和完成后 `html.dark` 保持不变、body 为白色且没有 `.site-shell`，未再捕获 #418；已登录 login 入口仍按既有逻辑回到 Anki。模拟账号/数据明确标识，写入被拒绝，不连接生产或数据库。实际可观测视口 219×822，不声称桌面/390px 像素验收；外部资源存在 DNS 失败，不宣称全程控制台零报错。本机未安装 Nginx，配置经过契约测试，未做真实 Nginx 容器运行验收。
- **完整门禁限制**：最终默认全量根测试为 147 文件、1186 项，1185 通过、1 项 `scripts/upload-cloud-release.test.mjs` 的 5000ms 超时；独立复验该文件通过，不等同全量通过。Go 测试因串联前段失败未执行，Go vet 已通过；不修改无关上传脚本、timeout、workers，也不绕过门禁。
- **交付边界**：修复保留 `/Users/yuean/Blog` 本地源码；未 commit、未 push、未部署。只读刷新预览 `http://127.0.0.1:31827/Blog/anki?view=deck&deck=refresh-deck` 使用真实已构建前端与模拟数据，不能用于正式录卡。线上须后续部署才生效。历史备注与结论原样保留。
- **本次提交与推送授权**：用户在获知完整根测试仍有上传脚本超时后明确要求 `commit & push`。本次仅提交刷新首帧、白色加载态、旧 HTML 水合保护、Nginx 精确入口及回归/本记录，普通推送至当前分支上游 `origin/custom`；依据用户授权破例提交，不改写历史全量门禁失败，不绕过 Git 钩子、不强推、不主动部署。提交前再次复验前后端 typecheck、全仓 ESLint 和相关 104 项测试通过；实际 commit/push 结果以 Git 返回与最终答复为准。

### 2026-10-27 证书恢复、刷新定位与卡片草稿（本轮最新）

- **用户确认范围**：保存失败保护针对 Anki 卡片，不涉及博客文章；修复查看库后刷新退出，以及公网 HTTPS 证书故障。
- **线上证书已恢复**：磁盘证书已续期，但公网仍提供旧证书。Caddy 普通 reload 在配置相同时未重新加载证书；执行 `caddy reload --config /etc/caddy/Caddyfile --force` 后正常 TLS 校验下 health 返回成功，Anki 页面 HEAD 返回 200。续期脚本追加 --force；独立安装到 `/opt/dblog-tools/renew-ip-certificate.sh`，systemd drop-in 将原服务改用此脚本，不修改不可变历史 release。回读 SHA256 与本地一致，服务 Result=success、定时器 enabled。未修改业务数据、数据库或 OAuth。
- **本地刷新定位**：Anki 查看状态改由 URL query（view/deck/tag）表达，不把问题、答案或账号放进 URL；刷新、历史后退保持所在库，basename 由 router 处理。失效库在 effect 后回到概览，不在渲染期导航；账号退出清理视图与编辑器。
- **本地草稿保护**：卡片新增/编辑的非空修改自动保留本机草稿；保存失败标记 failed，关闭弹层、刷新后可从“卡片草稿”继续编辑。每份记录独立键，按服务端 /me 返回的账号分区，身份未确认不读旧账号草稿。成功确认才清除；保存过程中禁用表单修改防旧响应清除新内容。保留 Markdown 源码、目标库、标签和编辑版本、显式重学选项，不增加练习进度；草稿不跨设备同步、不冒充数据库保存。存储故障明确提示请勿关闭/刷新，损坏记录不删除、不覆盖。退出隐藏旧账号草稿，但保留以便本人下次登录恢复。
- **验证**：本轮新增 9 项前端回归及 1 项证书脚本回归通过；最终 Anki 全范围加证书脚本为 7 文件、81 项全过（包含创建/编辑失败恢复、成功清除、账号隔离、损坏存储、关闭在途请求、basename/历史恢复）；前端 typecheck 通过，Anki 范围 ESLint 无警告，全仓 ESLint 0 errors、4 条既有 Fast Refresh warnings。真实浏览器 1080×801 隔离样例通过进库→刷新仍在原库、输入→模拟503→关闭→刷新→草稿恢复（保留缩进和尾换行），不连接生产账号或数据库；不声称严格390px或生产卡片端到端验证。控制台有测试预期503、外部资源DNS失败及404，未声称控制台全部干净；核心草稿与路由流程已实际可用。
- **构建与门禁限制**：完整 cloud SSG/SEO/部署隔离构建通过（保留既有 chunk-size/SEO提示）。标准 npm test 前端/脚本 146 文件、1174 项：1173 通过，1 项 upload-cloud-release 在默认5000ms超时；Go 段因 && 未运行。该上传测试独立复验4项通过，不等同完整根门禁通过。本轮执行环境 Go 不在 PATH，完整 typecheck 的 Go vet 未执行；未安装工具链或修改全局环境。构建自动图片压缩副作用已恢复；用户文章、说说和原暂存状态保持不动。
- **发布边界**：只对证书加载与续期链路实施线上修复；两项 Anki 优化保留本地，未 commit、未 push、未部署前端，不绕过未通过的完整门禁。隔离预览为 `http://127.0.0.1:28643/Blog/anki`，明确标记模拟账号与数据，保存始终模拟失败，不能用于正式录卡。

- **本次提交与推送授权**：用户在获知上述全量测试限制后明确要求 `push`，本次只提交刷新定位、卡片草稿、证书强制加载及回归/记录，普通推送到当前 `origin/custom`；不包含用户文章/图片或修复源码ZIP，不绕过钩子、不强推、不主动部署。已找到现有 `/Users/yuean/sdk/go1.27.3/bin/go`，仅本次命令临时加入 PATH，完整前后端 typecheck 通过；全仓 ESLint 0 errors（4条既有warnings），相关81项复验通过。全仓 diff-check 发现用户文章尾空格，不改用户内容；本次提交范围单独检查。完整 npm test 的历史失败仍保留，不改写为通过；实际提交与推送以 Git 返回及最终答复为准。

### 2026-10-27 标签独立管理（最新确认覆盖上一版自由输入）

- **用户选择**：卡片库内独立管理标签；新增和编辑卡片只能点击多选已有标签，不能通过卡片表单隐式增加新标签。标签管理控件负责新增、重命名、删除；同库标签名忽略大小写唯一，Gc 与 GC 不产生两份。
- **实现**：008 迁移新增 anki_deck_tags 目录，从旧卡片标签按库合并大小写变体并统一名称；尚未用在卡片上的标签也可保留。管理接口受会话/Origin/归属校验保护；卡片保存按目录规范名匹配，不存在的标签报错。删除仅移除关联、改名同步更新关联，均不删除卡片/历史、不改排期/结果次数。关联变更递增卡片版本以拒绝旧编辑覆盖。用户锁与评价入口顺序统一，串行保护删除/保存/评价竞态。
- **UI**：库详情“管理标签”打开独立弹层，提供名称录入、重命名/删除及关联张数；卡片表单只显示已有标签按钮，点击选中/取消、显示预选。切换库清空原库选择，标签加载失败保留草稿且阻止保存；过滤标签来自独立目录，新增的未使用标签也可筛选。
- **最终门禁**：前后端 typecheck 通过；全仓 ESLint 0 errors，4 条既有 Fast Refresh warnings，无新增 warning。Anki 5 文件/71 项回归通过。完整根 npm test 使用独立本地 PostgreSQL 和 SKIP_IMAGE_COMPRESS=1，默认并发与超时未改，144 文件/1164 项前端与脚本全部通过，随后 Go 全包 -race -count=1 通过，无 SQL skip。覆盖独立标签增改删、大小写并发去重、未知标签拒绝、账号/版本隔离、删除与改名保留排期/历史、007→008 迁移归一与重放；此前发布脚本超时记录保留为历史，不据此次通过改写旧记录。
- **本轮浏览器验收**：实际 1080×801 视口：输入 Gc 被已有 GC 拒重；独立新增测试标签；编辑卡片预选 GMP，点击多选测试标签并保存后 GET 回读显示两项；删除测试标签后卡片仍为 5 张、保留 GMP，筛选目录移除测试标签。最终控制台为空。只针对本地测试内存数据执行，不代表生产或严格390px验收。
- **构建与边界**：Go 后端及 cloud Vite 客户端编译通过，已有 chunk-size 提示保留；未声称完整 SSG 或严格390px/生产验收。预览沿用 http://127.0.0.1:29477/anki，改为明确标识的测试进程内存交互样例，标签/卡片操作不连接生产账号或数据库，重启测试进程清空样例操作。本轮未 push、未部署、未执行生产迁移。

### 2026-10-27 卡片库内标签与博客高亮语法（本轮最新）

- **范围**：子分类是卡片库内卡片的标签，不自动新建卡片库；录入/编辑支持逗号分隔的多个标签、去除首尾空白与大小写重复，每卡最多 20 个、单标签最多 30 字。详情、随机浏览和到期练习展示标签；库内提供全部/无标签/单标签筛选，点击卡片标签也可筛选。随机浏览与到期练习继承所选标签，整体库进度不冒充筛选进度；过滤不增加练习记录。
- **持久化**：007_anki_tags.sql 新增 text[]，旧卡片默认空数组。POST/PATCH 读写标签，PATCH 省略 tags 保留原标签、显式 [] 清空；非法 null/类型/空白/超长拒绝。身份隔离、版本检查、历史及排期不变；只从当前库卡片聚合标签，不添加全局或共享标签系统。
- **Markdown**：AnkiMarkdown 复用博客 remarkTyporaMarks，==Txt== 生成 mark，支持嵌套加粗；源码/实时预览/详情/浏览/练习统一。代码块、行内代码、转义及未成对等号保持原样；仍 skipHtml、危险链接白名单与媒体替代文本。高亮使用 Anki 局部浅黄色，不改变博客全局主题。跨行高亮按博客原插件语义解析，不扩展共享插件。
- **已验**：最终前后端 typecheck 通过，全仓 ESLint 0 errors，仅 4 条既有 Fast Refresh warnings；本轮新增工具函数与组件已拆开，无新增 warning。Anki 67 项前端测试通过；附带独立发布脚本 4 项共 71 项通过，不等同全量门禁。Go 全包在本轮独立 PostgreSQL 下 -race -count=1 通过，无 SQL skip；覆盖 006→007 旧卡迁移、标签读写/保留/清空、账号/版本隔离、评价后标签保留、迁移并发重放与失败事务回滚。原迁移回归中固定数量断言改为执行前快照对比，保留数据与回滚断言。Go 后端与 cloud Vite 客户端编译通过，既有大 chunk 提示保留。
- **根门禁限制**：最终 npm test 前端/脚本部分 143 文件、1160 项，1159 通过、1 项 scripts/upload-cloud-release.test.mjs 在默认并发下 5000ms 超时，Go 因 && 未执行。没有修改该发布脚本、测试超时或 worker，也不据独立通过宣称根门禁通过。
- **浏览器**：本轮独立只读样例预览 http://127.0.0.1:29477/anki，不连接生产账号或数据库且拒绝写入。实际 1080×801 视口验 GC 仅显示 1/5 卡、卡片标签、答案默认隐藏、揭示后 mark 黄色 rgb(255,241,168)、编辑实时输入 ==Txt== 生效及重学未选、随机浏览继承 GC 为 1/1。源码拆分期间旧热更新错误已恢复；最后浏览页控制台为空。不声称严格 390px 手机或生产登录验收。
- **发布边界**：未执行生产 007 迁移、未 push、未部署；全量门禁未通过，暂不 commit。用户说说暂存/未暂存状态保留，gen:data 自动图片压缩副作用已恢复，后续测试 SKIP_IMAGE_COMPRESS=1。

### 2026-10-27 实时 Markdown、宽屏编辑、库内主动自评与终身结果次数

- **需求确认**：用户选择库内揭示答案后自评计入正式练习并重新安排复习；允许未到期卡片主动练习。只看答案、随机浏览、录入/编辑不计数；随机浏览仍只读，不在该模式添加自评。
- **线上只读证据**：在既有登录态查看 Golang 库的「两个 Interface 可以比较吗」卡片，源码首行含 Markdown 硬换行标记（尾部两个空格）；渲染 DOM 出现 br 后额外换行文本，原 CSS pre-wrap 又保留该换行，导致多余空白。未修改/保存该卡片，未评价生产数据。修复统一软/硬换行为单次换行，代码块缩进及源码不变；松散列表结构换行不当正文处理。
- **编辑与排版**：新增/编辑始终同时展示源码与预览，无需点击切换。桌面两列，窄屏上下排列；Q 输入 7 行、A 输入 14 行，编辑面最大宽 76rem、高 92vh/dvh，保存区粘性定位；只扩展 Anki 卡片弹层，不改共用 SlideModal 默认行为。复用 AA 排版已有字体文件：Resume Sans（思源黑体/JetBrains 英文）、Resume Serif（思源宋体）、Resume Mono，16px 正文/1.8 行高、蓝色 h2 和细分隔线；不改变博客 AA 开关或主题存储。
- **主动自评**：详情揭示答案后显示「熟悉 / 模糊 / 忘记」，映射 correct/hard/wrong，POST /api/v1/anki/practice；新入口允许提前，旧 /reviews 保留 due 守卫。两种模式共用服务端 SM-2 事务，来源纳入幂等摘要，版本/身份/Origin 校验保留。成功后刷新计数/统计、隐藏答案；失败保留旧状态与答案，原 payload 重试，卸载取消，防晚到加载响应覆盖新计数。
- **终身计数**：006 迁移添加 practice/correct/hard/wrong/custom 次数字段，从不可变历史按用户/卡片回填。新练习和结果计数同事务递增；总次数包括自定义评价，自定义独立列出、不推断三档结果。重学只重置原调度周期，终身计数/历史不清零。详情、练习、随机浏览均展示真实计数；旧后端字段缺失明确提示统计不可用，不伪造 0。
- **最终测试**：57 项 Anki 前端回归通过；前后端 typecheck 与全仓 ESLint 0 errors（4 条既有 Fast Refresh warnings）。根 npm test 注入本轮隔离 PG、设置 SKIP_IMAGE_COMPRESS=1 避免压缩用户图片，142 文件/1150 前端与脚本测试通过，Go 全包 -race -count=1 通过，无 SQL 测试跳过；包含提前练习、幂等并发、版本/账号隔离、自定义计数、重学保留和 005→006 历史回填/重放验证。迁移数量测试由 5 更新为 6，不削弱数据保留/回滚断言。
- **构建**：cloud/Pages Vite 客户端和 Go 二进制编译通过，cloud 有 Anki chunk、Pages 无 Anki chunk；既有大 chunk 提示保留。不冒充完整 SSG/SEO 或生产部署验收。
- **浏览器边界**：隔离内存示例验证即时预览、首行 DOM 单次 br、字体 computed family、主动自评 3→4 次且熟悉 1→2 次、成功隐藏答案。当前浏览器 CSS 视口仅 219px，CDP 改为桌面/390px 失败（session not found），因此不声称严格桌面/390px 像素级验收通过；极窄原页面有溢出及 Cookie 提示遮挡，未扩展修改全站提示。截图通道未准确捕获弹层，使用 DOM/行为与 computed 样式验证，不把截图算通过。
- **发布边界**：当前改动只在本地；新增后端和 006 迁移尚未部署生产。测试 PostgreSQL 独立于用户/生产数据，用户说说暂存和工作树保持不动。默认只 commit 不 push，未获本轮部署指令不部署。

### 2026-10-27 Markdown 编辑、答案渲染与局部主题修复

- **实现范围**：新建与编辑问题/答案直接输入 Markdown，分别切换预览；详情、随机浏览、到期练习共用 `AnkiMarkdown`，支持标题、加粗、列表、引用、链接、代码块与 GFM 表格。源码保存保留前导缩进与尾部换行，不保存渲染后的 HTML；编辑默认保留排期，显式重学行为不变。
- **安全边界**：ReactMarkdown 不解析原始 HTML，禁用危险协议链接，外链使用 noopener/noreferrer。当前不扩展媒体卡片，图片仅显示替代文字，不向第三方加载卡片内远程媒体。默认答案不渲染进 DOM，主动揭示后才渲染；原鉴权/API/数据库/调度链路不变。
- **主题修复**：Anki 沿用独立白色阅读面。移除详情、随机浏览与折线提示残留的 dark 变体；表单使用局部 `anki-input`，portal 弹层通过现有 className 扩展点独立浅色化。不改变 html.dark、博客主题或共享 SlideModal 的默认行为。
- **接口核查**：前端 `anki-api.ts` 是统一模块，不是单一 HTTP 接口；Go api.go 注册 9 个 Anki method/path 组合。dashboard 聚合分类/库摘要/目标/今日/历史；录入、编辑、读卡、队列、评价和目标等按操作调用对应端点。无需为 Markdown 渲染新增服务端接口。
- **最终相关门禁**：前后端 typecheck（本机已有 Go 工具链）通过；全仓 ESLint 0 errors，4 条原有 HeroQuote/RankFlash Fast Refresh warnings 保留；Anki 34 + 新增 Markdown 15，共 49 项通过；git diff --check 通过。
- **全量限制**：本轮默认完整 npm test 为 141 文件/1141 项，1140 通过、1 项发布脚本 `scripts/upload-cloud-release.test.mjs` 5000ms 超时，Go test 因 && 未运行。单独复验该文件 4 项通过，但不等同于默认全量门禁通过。后端未改，不将 go vet 或 UI fixture 写为真实 SQL 集成测试。
- **构建与浏览器**：cloud Vite 客户端编译通过，保留已有大 chunk 提示，不冒充完整 SSG/SEO 构建。隔离内存 fixture 验证了问题渲染、默认隐藏答案、新建源码→预览→保存→GET 回读→渲染答案，以及编辑源码/预览切换保留内容；html.dark=true 时详情主体、弹层和输入 computed background 为白色，弹层 color-scheme=light。截图通道未可靠显示编辑弹层，因此不声称其像素级截图验收通过。390px CDP 视口设置失败，手机实际浏览器验收未完成。
- **交付边界**：`http://127.0.0.1:28642/anki` 为隔离示例预览，数据仅在该测试进程内存，不是真实账号或数据库，也不连接生产站点。真实本地入口因 API 后端未启动展示故障态。本轮未 push、未部署；默认全量门禁未绿，暂不 commit。用户新增的说说暂存/未暂存状态保持不动，gen:data 的无关图片压缩副作用已恢复。
- **后续提交与推送授权**：用户获知默认全量测试仍有发布脚本超时后，明确要求处理完成后 `commit & push`。本次按该授权仅提交 Markdown 编辑/渲染、Anki 局部主题修复、回归测试与本记录，普通推送至当前分支上游 `origin/custom`；不包含用户正在编辑的说说，不绕过钩子、不强制推送、不主动部署。提交前重新运行前后端 typecheck、全仓 ESLint 与 Anki 49 项回归；实际提交/推送结果以 Git 返回及最终答复为准，历史全量门禁限制不改写为通过。

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
