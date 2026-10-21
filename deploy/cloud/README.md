# 云端首版部署

目标服务器：43.138.216.53。以下为部署配置和操作手册；实际完成情况见 `packages/project-notes/deployments/2026-10-20.md`。

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
首版 CI 仅构建两种制品；0.1.2 增加下述自动云端发布，需先完成一次性配置。

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

- 真实 GitHub OAuth、会话与访问记录主流程已完成生产验收；第二个真实账号的隔离验收仍待完成。
- 只有云端站点的已登录访问可关联账号；Pages 维持现有匿名统计和本机阅读记录。
- 原 Umami/Giscus 等第三方服务保留现状，连通性仍受实际网络影响。
- 初版限流按后端连接来源聚合，非真实访客 IP；多实例部署前需重新设计共享限流。
- 访问事件尽力上报，无持久化离线队列；页面关闭/断网可能丢失事件。
- 账号删除、阅读云同步、异地备份作业尚未包含在本版。

## 无域名的 IP HTTPS 部署

已提供 `compose.ip.yml` 和 `Caddyfile.ip`。先申请公开可信 IP 证书，再合并配置启动；不能用 Caddy 默认本地证书替代公开可信证书。

服务器约定：

- `/opt/dblog/current` 指向本次 release 目录；历史目录位于 `/opt/dblog/releases/`。
- `/opt/dblog/shared/cloud.env` 是 root:root 0600 的服务器凭据文件，CLOUD_DOMAIN 填公网 IP。
- `/opt/dblog-tools/certbot` 为 Certbot 5.8.0 独立 Python venv；系统包版本可能不支持 IP 申请。
- `/var/lib/dblog-acme` 为 HTTP-01 challenge webroot；`/etc/letsencrypt` 保存证书和 ACME 账号。
- 首次签发可临时使用 HTTP 服务提供上述 webroot；正式运行后 Caddy 在 HTTP 80 上继续提供 challenge，其他请求跳转 HTTPS。

签发示例（服务器执行，先确保公网可访问 challenge 路径；建议先以不同 cert-name 通过 staging 校验）：

```sh
sudo /opt/dblog-tools/certbot/bin/certbot certonly --webroot \
  --webroot-path /var/lib/dblog-acme --preferred-profile shortlived \
  --ip-address 43.138.216.53 --cert-name 43.138.216.53
```

签发账户注册时按提示处理 CA 条款；IP 证书有效期短，必须设置续期与证书重载。
将 `dblog-certificate.service`、`dblog-certificate.timer` 安装到 `/etc/systemd/system/` 后执行：

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now dblog-certificate.timer
```

定时器每天北京时间 08:00/20:00 后随机 30 分钟内（定时器显式使用 UTC 00:00/12:00）检查，续期脚本仅续正式 IP 证书，并关闭 Certbot 自带随机等待（定时器已提供随机延迟）；证书变化时重载 Caddy，失败不会写入已加载摘要。
证书路径和定时器针对本次 IP 部署；更换服务器 IP 时需要同步证书签发、续期脚本和 OAuth 回调。

OAuth 凭据尚未填好时，可先启动静态站和数据库（不伪造凭据、不启动账号 API）：

```sh
cd /opt/dblog/current
sudo docker compose --env-file /opt/dblog/shared/cloud.env \
  -f deploy/cloud/compose.yml -f deploy/cloud/compose.ip.yml up -d --no-deps db web gateway
```

Nginx 在请求时解析 API 名称，因此 API 未启动时仍可浏览博客；账号界面如实提示服务暂不可用。
通过 `sudo nano /opt/dblog/shared/cloud.env` 填写 GITHUB_CLIENT_SECRET 后执行 `sudo ./deploy/cloud/start-ip.sh`，启动迁移和 API，并等待健康检查。
日志、截图和聊天均不应包含凭据文件内容；备份该文件时也应加密并限制访问。

Caddy 保留错误日志，但在全局默认日志过滤器中删除请求 URI、Cookie 和 Authorization；Nginx 的 /api/ 不记录访问日志或带查询串的代理错误，避免回调 code 泄漏。

## 日常发文同步到云端（0.1.2）

两个站点都以 `custom` 为发布来源。先将云端功能分支合入 `custom`，以后正常提交文章即可。
GitHub Pages 保持现有发布方式；`Deploy to Cloud` 等待同一提交的 CI 全部成功后，
下载该次 CI 的 `cloud-dist`，将相同提交的 API 源码与制品打包上传。
旧 CI 若晚于新提交完成，会跳过旧提交发布；云端发布串行执行，不在迁移期间取消。

一次性配置：

1. 为发布单独生成 SSH 密钥，将公钥加入服务器 `ubuntu` 的 `~/.ssh/authorized_keys`。
   该用户需能以 `sudo -n` 执行部署；当前脚本适用于已有 Ubuntu 管理账号。
2. 核验服务器 SSH 主机公钥，将匹配 `43.138.216.53` 的 known_hosts 行写入仓库
   Actions Secret `CLOUD_SSH_KNOWN_HOSTS`。脚本严格验证主机身份，不使用跳过验证参数。
3. 将部署私钥写入 Actions Secret `CLOUD_SSH_PRIVATE_KEY`，不放入仓库或聊天记录。
4. 设置 Actions Variable `CLOUD_DEPLOY_ENABLED=true`。未启用时云端工作流跳过；
   启用后凭据缺失或发布失败均明确报错。首次可以在 `custom` 手动运行 `Deploy to Cloud`，
   手动运行同样先执行内容/类型检查、覆盖率测试、双端编译和云端构建审计。

服务器继续使用 `/opt/dblog/shared/cloud.env`，无需把数据库或 OAuth 凭据交给 Actions。
发布包仅含 Docker/Compose、API 源码、workspace 清单和 `cloud-dist`；
不上传本机 `.env`、原始文章目录、`temp/` 中的本地仓库或其他开发资料。
上传前审计必须确认 cloud 账号代码存在，避免误用 Pages 制品覆盖云端。
服务器验证发布包与每个文件的 SHA256，先构建镜像，再切换 API/静态站。
数据库、网关和证书沿用已有部署；发布不清理数据卷或历史镜像。

容器健康及公网 `/api/v1/health`、`/Blog/cloud-release.json` 的提交号均通过后，
才更新 `/opt/dblog/current` 和生产配置中的镜像标签。失败时恢复上一版镜像及指针，
并返回失败。SQL 迁移不会自动回退，后续迁移仍需保持对旧 API 的兼容性。
旧网关继续挂载其首次启动时的配置目录，历史目录应保留；网关配置变更须单独部署。

也可从已构建 cloud 制品的本机执行相同发布：

```sh
npm run build:cloud
commit=$(git rev-parse HEAD)
node scripts/package-cloud-release.mjs "$commit" /tmp/cloud-release.tar.gz
CLOUD_SSH_KEY_FILE=/secure/path/deploy_key \
CLOUD_SSH_KNOWN_HOSTS_FILE=/secure/path/known_hosts \
  bash deploy/cloud/upload-ip.sh "$commit" /tmp/cloud-release.tar.gz
```

以 `/Blog/cloud-release.json` 的 `commit` 为实际版本证据，并打开新文章验收。
不能仅凭工作流文件已添加或上传成功宣称自动发布已经上线。
