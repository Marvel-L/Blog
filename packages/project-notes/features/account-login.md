# 账号密码与 GitHub 双向绑定

## 已确认规则

- 系统账号与 GitHub 是同一用户身份的两种认证方式，不是两份业务数据。
- 新系统账号可以注册、登录；只有完成 GitHub 绑定后才可访问 Planner、Anki、Trend 的云端读写与授权。
- 保留原有匿名博客浏览、Planner/Trend 本地工具能力，不把公共本地工具改为强制登录。
- 不进行历史业务数据合并；未绑定身份不应有业务数据，若检测到异常业务数据，则拒绝绑定并保留原记录。
- GitHub 登录后可以创建系统账号，或通过已有未绑定系统账号的密码验证后附加。
- 系统账号登录后，通过 GitHub OAuth 完成绑定。GitHub 已属于另一个已绑定系统账号时拒绝替换。

## 数据与安全

- `users.id` 保持业务数据的唯一归属；新建 `account_credentials` 保存账号与密码散列。
- 账号为 3–32 位 ASCII 字母/数字/下划线/短横线，首字符为字母或数字；登录名大小写不敏感、显示保留原写法。
- 密码为 8–128 个 Unicode 字符，不 trim；PBKDF2-HMAC-SHA256，随机 16 字节盐、600000 次迭代、32 字节摘要，常量时间比较。
- 会话沿用 host-only、Secure、HttpOnly、SameSite=Lax Cookie，数据库只存 token 摘要。密码登录轮换当前会话；绑定撤销双方旧会话及其 Trend 授权，再建立统一身份的新会话。
- 绑定 OAuth 的一次性数据库记录关联发起时的会话摘要，回调须持有同一会话且会话仍有效，保留随机 state、S256 PKCE、固定回调地址。
- 账号登录与绑定有 IP 授权入口限流，以及数据库账号摘要限流（每账号 15 分钟最多 10 次尝试）；失败统一脱敏。现有 IP 限流按连接来源聚合，反向代理后并不等同真实访客 IP。
- 绑定、凭据附加与 GitHub 登录使用数据库事务锁防止竞态串号；SQL 参数化。
- 账号接口同源、精确 Origin、no-store，不接受客户端 user_id，不写入 Service Worker 缓存。
- 本地 HTTP 预览兼容配置端口上的两个精确来源 `localhost` / `127.0.0.1`，其余端口、协议和域名继续拒绝；HTTPS 仍只接受配置的唯一来源。来源不符返回 `origin_mismatch`，IP 限流返回 `rate_limited` 与 60 秒重试提示。

## 新增接口

- `POST /api/v1/auth/account/register`：注册并建立未绑定会话。
- `POST /api/v1/auth/account/login`：账号密码登录，不访问 GitHub。
- `POST /api/v1/auth/account/bind`：当前已认证 GitHub 身份创建或验证系统凭据。
- `POST /api/v1/auth/github/bind`：当前未绑定系统身份发起 GitHub 授权。
- 原 GitHub start/callback、/me、logout 继续兼容。
- 未绑定身份访问业务接口返回 HTTP 403 和 `github_binding_required`，不是仅隐藏按钮。

## 初始化与生产状态

- 已在原 Marvel-L 身份上录入系统账号 `GzzhM`，未新建第二份业务身份；密码未写进仓库、文档或明文配置。
- 已先执行生产加密备份，服务结果 success / 退出码 0。
- 生产 `011_account_login.sql` 与凭据录入同一事务提交；10 张相关业务表在提交前后数量一致；原用户 ID 未改变。
- 数据库独立回读确认 username / GitHub 登录名 / GitHub 绑定状态；密码散列与初始化载荷相符。
- 初始化撤销该用户旧会话，用户需重新登录。
- **应用代码未推送、未部署；公网账号密码登录尚未可用，真实新 OAuth 绑定尚未在生产浏览器验收。**
- 初始化工具：`packages/server/cmd/account-init` 从 stdin 读散列载荷；不覆盖已有凭据、不按可变 GitHub 登录名绑定。交互散列工具为 `packages/server/tooling/account-hash.py`。

## 验证记录

- 真实 PostgreSQL 14 随机 schema：Go 1.27.3 `go test -race -count=1 -v ./...`，70 个顶层用例全部通过，0 跳过。生产 PostgreSQL 版本不同的部署仍需实际上线验收。
- 覆盖密码散列、错误密码、大小写账号、Origin、输入校验、未绑定业务读写、同一身份、已有身份数据保留、双向绑定、已绑定冲突、注销后回调拒绝、重放、异常未绑定数据保护，以及原有 Anki/Planner/Trend SQL 测试。
- 完整前端/脚本 `npm run test:blog`：157 文件、1281 用例通过。第一轮两项部署脚本超时，独立复验及完整第二轮均通过；未修改超时阈值或关闭断言。
- `npm run typecheck` 和 Go `go vet` 通过。
- 根 `npm test` 最终退出码 0；本机未配置 TEST_DATABASE_URL，SQL 集成段按既有规则明确跳过。SQL 验证依据上面的独立 PostgreSQL 零跳过运行，不将本机跳过当作通过。
- `npm run build:cloud`、Pages `npm run build`、Go 服务构建通过；保留既有内容/大 chunk 警告，无相关构建错误。
- `npx eslint .`：0 errors，8 条既有 Fast Refresh warnings（不属于本次认证改动）。
- 真实浏览器已打开独立 cloud Vite 预览并检查账号弹层：账号/密码输入、密码遮蔽、注册与 GitHub 登录入口、焦点及滚动渲染正常。本地预览未接通账号后端，不冒充端到端登录验收。
- 用户已有 `shuoshuo/26-11-03/0x01.md` 暂存/未暂存改动保持不动；其尾随空格不纳入本次改动校验。

## 本轮不包含

找回密码、邮箱验证码、二次认证、解绑/换绑、强制密码轮换、账户删除，以及历史业务数据合并。现有 API/数据库发生故障时密码登录也可能不可用；它解决 GitHub 网络依赖，不代表绕过服务端故障。
