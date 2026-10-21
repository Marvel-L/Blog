# @d-blog/server

独立 TypeScript + Fastify API。数据库为 PostgreSQL；无内存账号、假登录或生产测试后门。

从仓库根目录运行：

```sh
npm ci
# 将根 .env.example 复制为 .env 并填写服务端变量；PostgreSQL 需已运行。
node --env-file=.env --import tsx packages/server/src/migrate.ts
npm run dev:server
# 另一个终端启动云端前端；GitHub 本地 OAuth 回调指向 localhost:3000。
VITE_BASE_PATH=/Blog/ npm run dev:cloud
```

本地 APP_ORIGIN=http://localhost:3000，后端 3001；Vite 仅在 cloud 模式代理 /api/。
生产使用 HTTPS 和 __Host- Cookie，本地 HTTP 使用独立 cookie 名。后端不开放跨域凭据接口。

接口：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | /api/v1/health | 数据库就绪检查 |
| GET | /api/v1/me | 当前用户，未登录返回 user:null |
| GET | /api/v1/auth/github/start | 创建一次性授权事务，跳转 GitHub |
| GET | /api/v1/auth/github/callback | 消费 state、换取身份、创建 7 天会话 |
| POST | /api/v1/auth/logout | 撤销会话并清除 Cookie |
| POST | /api/v1/events/batch | 登录后上报 1–20 个页面事件 |
| GET | /api/v1/me/events | 本账号最近 20 条记录 |

POST 必须携带与 APP_ORIGIN 精确相同的 Origin。事件不接受 user_id、任意 properties 或查询参数。
首次登录只请求公开 GitHub 身份，不申请仓库和邮箱权限，不持久化 GitHub access token。
OAuth state 10 分钟过期且只可使用一次。会话 token 仅保存 SHA-256 摘要。
每小时删除过期授权事务、会话和超过 90 天的事件；失败记录脱敏错误，后续周期重试。
限流为单进程级别，当前代理下按连接来源聚合限流，适用于初版低流量，不宣称按真实用户 IP 限流。

测试使用 PGlite 执行真实 PostgreSQL 表结构和 SQL，无需 Docker。迁移锁、pg 网络连接、镜像和真实 OAuth 仍需集成环境验证。
