# Go 后端

独立 Go module，使用标准库 `net/http` 和 pgx，提供 GitHub 登录、数据库会话和访问记录。
前端与 Pages 构建无需引入 Go 运行时。生产 API 为不依赖 Node 的静态 Go 二进制。

## 目录

```text
cmd/server/         进程入口：serve / migrate / healthcheck
internal/config/    环境变量校验
internal/github/    固定 GitHub 端点与 PKCE 换取身份
internal/httpapi/   路由、Cookie、Origin、请求校验、限流与接口集成测试
internal/store/     PostgreSQL 持久化与事务
migrations/         编号 SQL、内嵌迁移执行器
tooling/           npm 命令适配（只用于本地与 CI 编排）
```

## 本地运行

安装 Go 1.27.3（或启用 Go 自动工具链下载）、Node 22 和 PostgreSQL 17。
根 `.env.example` 复制为 `.env` 后填写服务端变量；OAuth 本地回调为
`http://localhost:3000/api/v1/auth/github/callback`。`.env` 不提交，不使用 `VITE_` 存放后端凭据。

从仓库根目录执行：

```sh
npm ci
npm run migrate --workspace @d-blog/server
npm run dev:server
# 另一个终端
VITE_BASE_PATH=/Blog/ npm run dev:cloud
```

上述 npm 适配器加载根 `.env`。也可以在 `packages/server` 直接使用 Go；此时需自行通过进程环境注入配置：

```sh
go run ./cmd/server migrate
go run ./cmd/server serve
go build -trimpath -o dist/dblog-server ./cmd/server
./dist/dblog-server healthcheck
```

`APP_ORIGIN=http://localhost:3000`，API 默认 3001；Vite 只在 cloud 模式代理 `/api/`。
生产保持 `NODE_ENV=production`、HTTPS、host-only `__Host-` Cookie；该兼容变量不代表运行时依赖 Node。
不开放跨域凭据接口。进程收到 SIGTERM/SIGINT 后停止接受连接并等待在途请求。

## 测试

测试使用真实 PostgreSQL 网络连接；每个用例创建随机 schema，结束后删除，不读取生产数据。
数据库角色必须能创建 schema。请使用单独测试数据库：

```sh
# 示例仅用于隔离测试，端口不向公网发布
docker run --rm --name dblog-go-test -p 127.0.0.1:55432:5432 \
  -e POSTGRES_PASSWORD=isolated-test -e POSTGRES_DB=dblog_test postgres:17.7-alpine
# 另一个终端，仓库根目录执行
TEST_DATABASE_URL='postgresql://postgres:isolated-test@127.0.0.1:55432/dblog_test?sslmode=disable' npm run test:server
npm run typecheck
```

`npm run test:server` 执行 `go test -race -count=1 ./...`，`typecheck` 对 Go 执行 `go vet`。
未设置 `TEST_DATABASE_URL` 时，本地明确跳过 SQL 集成用例，只运行不依赖数据库的测试；CI 缺少此变量直接失败。
CI 和手动云端发布内置 PostgreSQL service，必须通过 SQL 集成用例才可发布。
测试覆盖 PKCE、授权重放/过期、Cookie、CSRF、会话替换/注销、旧会话、账号隔离、去重、非法事件、清理、故障脱敏、事务回滚及并发迁移。
真实 GitHub 授权仍需浏览器生产验收，测试不提供假登录端点。

## 接口与兼容

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | /api/v1/health | 数据库就绪检查 |
| GET | /api/v1/me | 当前用户，未登录返回 user:null |
| GET | /api/v1/auth/github/start | 创建一次性授权事务，跳转 GitHub |
| GET | /api/v1/auth/github/callback | 消费 state、换取身份、创建 7 天会话 |
| POST | /api/v1/auth/logout | 撤销会话并清除 Cookie |
| POST | /api/v1/events/batch | 登录后上报 1–20 个页面事件 |
| GET | /api/v1/me/events | 本账号最近 20 条记录 |

POST 必须携带与 APP_ORIGIN 精确相同的 Origin。事件只接受 eventId/name/path/occurredAt，
不接受 user_id、任意 properties、查询参数或 fragment。账号始终取自服务端会话。
OAuth 仅请求公开身份；state 10 分钟一次性使用，S256 PKCE，禁止跟随携带凭据的重定向。
会话有效期 7 天，仅保存 SHA-256 十六进制摘要；Cookie 名、格式与旧 Node 后端一致。
用户、新会话、旧会话撤销和 login_success 事件在同一数据库事务提交。
不输出 Cookie、密码、连接串、OAuth code/token/secret 或完整请求 URL。

沿用原 `001_initial.sql`、`schema_migrations` 和迁移锁 7102026，无数据格式转换或数据卷重建。
`migrate` 只需 DATABASE_URL；SQL 内嵌到二进制。启动不自动执行迁移，由 Compose 先迁移、再启 API。
每小时清理过期 state、会话和 90 天前事件，失败脱敏记录并于下周期重试。
限流仍按后端连接来源聚合：120 次/分钟，授权入口 10 次/分钟，不信任 X-Forwarded-For。

生产镜像和部署步骤见 [部署说明](../../deploy/cloud/README.md)。
