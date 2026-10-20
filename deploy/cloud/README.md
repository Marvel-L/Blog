# 云端首版部署

目标服务器：43.138.216.53。以下为部署配置和操作手册，不表示已连接或已上线。

## 前置配置

- Linux 服务器安装 Docker Engine、Compose v2（支持 service_completed_successfully）。
- 域名 A 记录解析至服务器，安全组允许 80/443；SSH 按已有管理方式开放。
- 中国大陆服务器上线前核实相应备案要求。
- 创建 GitHub OAuth App，Homepage URL 为 https://<域名>/Blog/，Authorization callback URL 必须为 https://<域名>/api/v1/auth/github/callback。
- 使用独立本地 OAuth App 联调；不申请仓库/邮箱 scope。Giscus 授权不与本站会话自动互通。

## 首次部署

在服务器上取得代码，下面命令都从仓库根目录执行。构建机需 Node 22.22.2+（22 系列）或依赖支持的更新 LTS 版本。
如果使用 CI 的 cloud-dist 制品，可将它解压到根 dist/，跳过本地站点构建。

```sh
npm ci
npm run typecheck
npm test
npm run build:cloud
cp deploy/cloud/.env.example deploy/cloud/.env
```

编辑 deploy/cloud/.env，填写 CLOUD_DOMAIN、GitHub Client ID/Secret 和随机数据库密码。
密码建议用 `openssl rand -hex 32` 生成（仅用于填入本机 .env），避免连接 URL 的特殊字符转义问题。
将 SITE_IMAGE_TAG/API_IMAGE_TAG 设为本次 git 提交编号。不要提交 .env，也不要向聊天或日志粘贴密钥。

```sh
docker compose --env-file deploy/cloud/.env -f deploy/cloud/compose.yml build
docker compose --env-file deploy/cloud/.env -f deploy/cloud/compose.yml up -d
```

启动顺序：PostgreSQL 健康 → 事务迁移成功 → API 健康 → Nginx → Caddy。
Caddy 自动获取 HTTPS 证书，需要域名已经解析到服务器且 80/443 可达。
迁移失败时停止继续上线，不能使用 down -v 重建数据库。

验收：

1. https://<域名>/Blog/ 可浏览，原 Pages 站点仍可独立访问。
2. /api/v1/health 返回 status:ok，/api/v1/me 返回 user:null。
3. GitHub 登录后刷新仍保持身份；退出后旧会话无法访问 /me/events。
4. 主动开启访问记录后切换文章，“查看最近记录”可看到本账号事件。
5. 不开启访问记录时，除登录安全记录外不生成页面事件。
6. A/B 两个账号分别登录，查询不到彼此记录。
7. 域名响应包含 noindex；API 为 no-store；/Blog/sw.js 不缓存 /api/。

## 更新与回滚

每次更新都用同一提交重新构建 cloud 前端和 API 镜像，记录旧标签。
运行 build、up -d；Compose 会在新的 API 启动前执行尚未执行的 SQL 迁移。
Pages 沿用原 custom 分支发布工作流，与云端上线相互独立。
首版 CI 会构建并上传两种站点制品，不自动登录或发布到服务器。

回滚前端/API：将 SITE_IMAGE_TAG/API_IMAGE_TAG 改为之前保留的标签，运行 `docker compose --env-file deploy/cloud/.env -f deploy/cloud/compose.yml up -d --no-build`。
前提是对应镜像仍存在、旧 API 与当前 schema 兼容。首次版本仅有初始迁移。
未来变更采用向后兼容迁移；应用回滚不会自动还原数据库，破坏性迁移必须另行制定恢复步骤。
更新数据库密码时不能只修改 .env：已有数据卷保留原密码，需按 PostgreSQL 方式先修改实际数据库用户密码。

## 备份与恢复

首次上线后配置每天备份，并将加密后的备份复制到服务器以外；首版提供操作步骤，尚未配置自动作业。
备份文件含用户数据，应限制权限、设置保留周期，不应提交仓库。

```sh
# 从根目录执行；备份输出路径放在仓库外，先创建该目录。
umask 077
docker compose --env-file deploy/cloud/.env -f deploy/cloud/compose.yml exec -T db pg_dump -U dblog -d dblog -Fc > /secure-backups/dblog.dump
```

备份命令返回非零时不得将输出文件当作成功备份。
恢复先在独立测试数据库中运行 pg_restore，验证账号/事件数量与约束，再计划正式恢复；禁止在仍有写请求时覆盖线上库。

```sh
# 仅恢复到独立的 dblog_restore 数据库，保留线上 dblog。
docker compose --env-file deploy/cloud/.env -f deploy/cloud/compose.yml exec -T db createdb -U dblog dblog_restore
docker compose --env-file deploy/cloud/.env -f deploy/cloud/compose.yml exec -T db pg_restore -U dblog -d dblog_restore --exit-on-error < /secure-backups/dblog.dump
```

## 已知限制

- 真实 GitHub OAuth、pg 网络连接/迁移锁和镜像启动需在部署环境验收。
- 只有云端站点的已登录访问可关联账号；Pages 维持现有匿名统计和本机阅读记录。
- 原 Umami/Giscus 等第三方服务保留现状，连通性仍受实际网络影响。
- 初版限流按后端连接来源聚合，非真实访客 IP；多实例部署前需重新设计共享限流。
- 访问事件尽力上报，无持久化离线队列；页面关闭/断网可能丢失事件。
- 账号删除、阅读云同步、自动发布、异地备份作业尚未包含在本版。
