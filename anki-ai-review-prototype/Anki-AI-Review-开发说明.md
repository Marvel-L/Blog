# Anki AI Review 开发说明

## 交付状态

正式代码已接入 `/Users/yuean/Blog`，不是仅修改 HTML Demo。功能与相关验证已完成；最后完整根测试仍有一项既有上传脚本超时。开发阶段因此暂未提交；用户随后明确要求 `Commit & Push`，本次依据该授权提交并普通推送 AI Review 范围，不绕过 Git 钩子。实际提交与推送结果以 Git 返回为准。没有部署、给真实业务库执行迁移或使用真实 DeepSeek API Key。

## 当前操作

1. 登录后，Anki 顶部“AI 设置”配置自己的 DeepSeek Key。
2. 在单张卡片“编辑”旁点击 **Ai Check**，只打开操作弹窗。
3. 选择 **开始 Check** 才提交本次卡片的问题与答案；或选择 **查看 AI 历史**，不发起新评分。
4. 评分结果在弹窗中展示：0–100 分、评价、优点、问题、建议。
5. 历史按检查时快照保存，可多次独立 Check；只能查看、复制、删除，不能追加对话。复制使用旧快照，不使用卡片当前内容。

卡片原问题、答案揭示、标签和计数保持；AI Check 不改变 SM-2 排期、复习日志或每日统计。

## 后端实现

- `009_anki_ai_review.sql` 新增用户配置、单轮检查及幂等 receipt 表。
- Key 用 AES-256-GCM 加密，随机 nonce，绑定用户与配置版本；配置接口只返回掩码。
- POST 只接受卡片版本和 mutationId，问题/答案从当前用户所属卡片读取并保存快照。
- 同一次请求重放复用任务；新一次检查创建新记录。数据库限制同卡只有一个 queued/running 任务。
- PostgreSQL 认领任务，Go worker 在事务外调用固定 DeepSeek 官方 HTTPS 端点；非流式，禁止跳转，不自动上游重发。
- 90 秒调用上限、256 KiB 响应上限、2048 输出 token 上限；得分及结果严格校验。
- 历史采用游标分页，列表只查摘要；详情按需读取。所有读写按服务器会话隔离。
- 删除清除 Q/A、Prompt 和 AI 内容，暂留不含会话内容的幂等墓碑，防删后重放重建；后台回写需匹配 claim token 和 running 状态。
- 超时/崩溃等结果不确定标 unknown，不自动再次调用；手动开启新 Check 可能再次消耗费用。

## 启用条件（本轮未执行）

需要已有 Go、PostgreSQL、GitHub OAuth 配置正常，并给服务端执行新版编号 SQL 迁移。

新增配置写在根 `.env.example`，真实值不入 Git：

- `ANKI_AI_ENCRYPTION_KEY`：随机 32 字节的标准 base64，由服务端安全注入。缺少时 AI 功能不可用，原 Anki 保持可用。
- `ANKI_AI_ENCRYPTION_KEY_ID`：默认 `v1`。
- `ANKI_AI_MODEL`：默认 `deepseek-flash`，可选 `deepseek-v4-pro`；厂商实际支持需真实联调验证。

用户自己的 DeepSeek Key 在登录后的页面配置，不放在 VITE 环境变量、前端包、URL 或 localStorage。API Key 不经付费模型验证配置成功；首个真实 Check 才检验厂商凭据。

**主密钥不能随意替换**：已有用户配置需用旧密钥解密后重加密，先备份再轮换。本轮没有自动轮换工具。不保证删除能抹掉既有数据库备份或撤回已发厂商请求。

## 验证结果与覆盖

- 前后端 `npm run typecheck` 通过；全仓 ESLint 0 errors，4 条既有 HeroQuote/RankFlash Fast Refresh warnings，新增模块无 warning。
- 新增前端 8 项测试通过：入口/历史不提交、手动开始、双击保护、配置不自动评分、旧快照复制/删除、卡片揭示保留、卸载取消、提交不确定重用标识、业务错误反馈及结果校验。
- 最后 Go 全包在本任务独立 PostgreSQL 上 `-race -count=1` 通过，无 SQL skip：真实迁移、权限隔离、并发/幂等、历史快照、删后回写保护、分页、加密及 worker 超时/lease/配置变化。
- 真实 React 页面 1440×900 与 390×844 验证通过：打开/查看历史没有 POST，开始仅一次 POST，历史无输入框，关闭后答案仍展开；使用浏览器拦截 fixture API，**不代表真实 OAuth/真实厂商端到端**。复制系统权限未实测，复制内容由测试替身验证。
- Go 二进制编译通过；cloud / Pages Vite 客户端编译通过，cloud 含 Anki chunk、Pages 不含。已有 Mermaid 大 chunk 警告保留，未开展本轮完整 SSG/SEO。
- 中间版本完整 `npm test` 148 文件/1192 项及 Go 全包通过。
- **最新完整根测试未全绿**：148 文件/1194 项，1193 通过、1 项既有 `scripts/upload-cloud-release.test.mjs` 在默认 5000ms 超时；Go 因串联前段失败未执行，最后已独立通过。证据 `accepted-full-test.log`；未修改无关脚本、timeout、workers 或 skip。开发时暂不 commit、不 push；后续用户明确授权提交与推送，历史测试失败记录不改写为通过。

## 已保留的代码

前端：`AnkiAIDialog.tsx`、`anki-ai-api.ts`、`anki-ai.test.tsx`；Anki 顶部、库详情和局部 CSS 的接入。

后端：`internal/deepseek/`、`internal/aireview/`、`store/anki_ai.go`、`httpapi/anki_ai.go` 与真实 SQL 回归；配置、进程生命周期和 009 迁移。

用户未授权部署或生产迁移，因此没有把页面预览地址描述成可正式录卡的完整服务。之前的 HTML Demo 仍是模拟版本，不自动升级成正式环境。

公开接口依据：

- https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/
- https://api-docs.deepseek.com/guides/json_mode

真实 API、额度/限流映射、真实账号使用与生产发布仍需后续验证。
