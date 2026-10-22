# 云端首版部署

目标服务器：43.138.216.53。以下为部署配置和操作手册；首版情况见 `packages/project-notes/deployments/2026-10-20.md`，
最新 Trend 上线情况见 [2026-10-22 部署记录](../../packages/project-notes/deployments/2026-10-22.md)。

## 前置配置

- Linux 服务器安装 Docker Engine、Compose v2（支持 service_completed_successfully）。
- 域名 A 记录解析至服务器，安全组允许 80/443；SSH 按已有管理方式开放。
- 中国大陆服务器上线前核实相应备案要求。
- 创建 GitHub OAuth App，Homepage URL 为 https://<域名>/Blog/，Authorization callback URL 必须为 https://<域名>/api/v1/auth/github/callback。
- 使用独立本地 OAuth App 联调；不申请仓库/邮箱 scope。Giscus 授权不与本站会话自动互通。

## 首次部署

在服务器上取得代码，下面命令都从仓库根目录执行。前端构建机需 Node 22.22.2+（22 系列）或依赖支持的更新 LTS 版本。执行本地后端检查需 Go 1.27.3；Docker 内自带 Go 编译工具链，运行镜像不依赖 Node。
发布脚本的回归测试需要 Python 3.12+，使用与服务器相同的 `tarfile` 安全解压过滤器。
如果使用 CI 的 cloud-dist 制品，可将它解压到根 dist/，跳过本地站点构建。

```sh
npm ci
npm run typecheck
TEST_DATABASE_URL='<独立测试库连接串>' npm test
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
前提是对应镜像仍存在、旧 API 与当前 schema 兼容。0.5.0 新增 Trend 兼容迁移，回滚旧 API 不删除新增数据表。
未来变更采用向后兼容迁移；应用回滚不会自动还原数据库，破坏性迁移必须另行制定恢复步骤。
更新数据库密码时不能只修改 .env：已有数据卷保留原密码，需按 PostgreSQL 方式先修改实际数据库用户密码。

## 备份与恢复

已启用每日服务器加密备份（北京时间 03:00 后随机 15 分钟内，保留 14 天）。
首次独立数据库恢复演练和 Mac 异地副本校验通过；后续异地自动传输仍待存储位置确定。
备份私钥只长期保存在 Mac，服务器只保留加密公钥，备份不包含生产环境凭据。
安装、恢复演练、密钥保管和已知边界见 [BACKUP.md](BACKUP.md)。

## 已知限制

- 真实 GitHub OAuth、会话与访问记录主流程已完成生产验收；第二个真实账号的隔离验收仍待完成。
- 只有云端站点的已登录访问可关联账号；Pages 维持现有匿名统计和本机阅读记录。
- 原 Umami/Giscus 等第三方服务保留现状，连通性仍受实际网络影响。
- 初版限流按后端连接来源聚合，非真实访客 IP；多实例部署前需重新设计共享限流。
- 访问事件尽力上报，无持久化离线队列；页面关闭/断网可能丢失事件。
- 账号删除、阅读云同步、异地自动备份传输尚未包含在本版；每日服务器加密备份和首次恢复演练已完成。

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
Actions 先读取当前不可变 release 的 `SHA256SUMS`，本地从完整发布包生成差异包：
只携带新增/变更文件、删除列表和完整的新校验清单；基线不可用时自动生成完整差异包。
差异包仍按 2 MiB 分块、最多八条 SSH 连接并行上传，各批次成功后按顺序重组并校验整包 SHA256。
服务端要求差异包绑定的基线等于当前 `/opt/dblog/current`，再用硬链接复用未变化文件；
覆盖文件和 `SHA256SUMS` 前必须解链，随后按完整清单校验全部文件和文件集合，避免修改历史 release。
任意分块失败、包损坏、基线变化或文件校验失败均阻止发布并清理临时目录。
发布过程保留严格的私有文件权限；Web 镜像内为公开的 `dist/` 补充读取与目录遍历权限，
避免 Nginx 工作进程无法读取增量文件，造成页面或公网版本验收返回 403。

服务器按实际变更范围发布：仅 `dist/` 变化时只构建并以 `--no-deps` 更新 Web，
不重启 API、不执行数据库迁移；`packages/server/` 变化时构建 API/Migrate；
`deploy/cloud/` 或 `.dockerignore` 变化时 Web 与 API 均重建。无法分类时采用完整路径。
发布日志分别记录差异准备、上传、远端校验、release 物化、镜像构建、容器健康和公网验收耗时。
完整发布内容的 SHA256 决定 release 标识，差异包 SHA256 仅用于传输校验，因此同一提交可幂等重跑。

服务器验证新 release 与每个文件的 SHA256，先构建所需镜像，再切换 API/静态站。
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

## 0.3.0 Go 后端切换

API 镜像由 Go 1.27.3 静态编译，最终镜像只包含二进制与 CA 根证书，以 UID 10001 运行。
构建阶段 GOPROXY 默认使用 goproxy.cn 并回退官方源，适配服务器网络；go.sum 校验依赖摘要。
如需指定其他可信源，可使用 docker build --build-arg GOPROXY=...；该设置不进入运行镜像。
迁移服务执行 `migrate` 子命令；API 健康检查执行 `/app/dblog-server healthcheck`，不再使用 Node。
Go 开发与测试步骤见 [packages/server](../../packages/server/README.md)。

沿用生产 DATABASE_URL、GitHub 凭据、证书与数据库卷，001_initial.sql 不变。
旧 Cookie 和会话摘要兼容，无需用户重新注册，不需要重新配置 OAuth App。
按正常发布流程同步更新镜像与 Compose 文件；不得只将 Go 镜像标签写入旧 Node Compose。
若回退至 Node 版，使用旧 release 目录的 Compose 文件与旧镜像一起恢复，数据库保持原卷。
代码验证与线上状态见 [0.3.0 记录](../../packages/project-notes/versions/0.3.0.md)。

## 0.5.0 Trend 跨端自动同步

Trend 使用现有 Go API、GitHub OAuth 与 PostgreSQL，Pages、本地开发站和云端连接同一账号后共享配置。
2026-10-22 已按正常流程发布 `d77bed5` 的云端 API 与前端，成功执行 `002_trend_sync.sql`；
生产健康、迁移账本、精确 CORS 和 Trend 页面检查通过。首次部署后已推送并更新 Pages，
真实 GitHub 授权及跨端同步仍待生产验收。执行证据见 [部署记录](../../packages/project-notes/deployments/2026-10-22.md)。
无需重建数据卷，原 OAuth App 和回调地址继续使用。

服务端配置 `TREND_ALLOWED_ORIGINS`，为逗号分隔的精确来源，例如：

```dotenv
TREND_ALLOWED_ORIGINS=https://marvel-l.github.io,http://localhost:3000,http://localhost:3001
```

来源包含协议、主机和端口，不包含 `/Blog/`、路径或末尾斜杠；禁止通配符。
更换 Pages 域名或本地端口时调整此列表。Compose 已提供上面的默认值；
生产 `/opt/dblog/shared/cloud.env` 若已定义该变量，必须检查并修改实际值。
仅 `/api/v1/trend/` 提供上述来源的 CORS，不开放跨源 Cookie。
外部站点通过云端弹窗获取一次性 code，以 S256 PKCE 交换来源绑定的专用 token；有效期 1 小时。
0.5.1 起 token 与到期时间保存在当前标签页 sessionStorage，按 API origin 隔离；不写入 localStorage。
刷新 Pages/本地页面后自动请求 dashboard 验证并恢复账号与同步，不延长授权有效期。
恢复网络失败保留授权，在聚焦、网络恢复和 15 秒轮询时重试；关闭标签页、授权到期或主动断开后需重新连接。
退出云端账号使其关联的 Trend 授权失效，客户端收到 401 会删除记录。
浏览器无法保存授权时仍可完成本次同步，并提示刷新需要重新连接。

前端构建变量 `VITE_TREND_API_ORIGIN` 必须是完整 origin，默认 Pages 指向 `https://43.138.216.53`，cloud 使用当前站点同源：

```sh
# 使用其他 API 域名时，Pages/cloud 均在构建时设置
VITE_TREND_API_ORIGIN=https://api.example.com npm run build
VITE_TREND_API_ORIGIN=https://api.example.com npm run build:cloud
```

本地页面连接已部署云端无需运行本地数据库：

```sh
VITE_TREND_API_ORIGIN=https://43.138.216.53 npm run dev
```

服务端白名单须与 Vite 实际监听的端口一致。调试独立本地 API 时按照 [Go 后端说明](../../packages/server/README.md)运行数据库、迁移和 API；
设置 `VITE_TREND_API_ORIGIN=http://localhost:3001`，页面使用 3000，API 的 `APP_ORIGIN` 应是浏览器访问授权 API 的 `http://localhost:3001`，
并使用匹配 `http://localhost:3001/api/v1/auth/github/callback` 的独立本地 OAuth App。

部署后验收：

1. 云端健康检查通过，迁移账本包含 `002_trend_sync.sql`；未登录读取 dashboard 返回 401。
2. Pages `/Blog/trend` 点击“使用 GitHub 连接同步”，完成云端 GitHub 授权；页面显示账号与同步状态。
3. 新增条目或修改阈值，等待“已同步到云端”；另一台设备/本地站连接同一账号，15 秒内或点击“立即同步”看到相同数据。
4. 两端离线编辑不同内容，恢复网络时出现版本冲突；选择保留版本后两端最终一致，另一账号不读取到本账号配置。
5. 在授权有效期内刷新，账号、草稿与同步自动恢复，不再弹出授权窗口；修改仍可上传。恢复请求暂时失败后可自动重试。
   断开后刷新不恢复授权，并恢复原匿名配置；退出云端账号后外部授权失效，到期后提示重新连接。
6. 普通 Pages 阅读不请求账号 API，拒绝白名单外的跨源请求，API 响应不被 Service Worker 缓存。

数据包含全部类别、条目、坐标、阈值和 dashboard 设置。修改防抖 700ms 上传；
页面可见时每 15 秒拉取，窗口聚焦和网络恢复也触发。跨端同时修改采用版本冲突选择，当前不提供字段级合并。
断网和上传响应丢失保留账号草稿、同步基线与 mutation ID，重试不会重复增加版本。
迁移新增表纳入现有数据库备份；不在 Git 仓库中保存用户数据，GitHub Pages 本身仍为静态站点。
