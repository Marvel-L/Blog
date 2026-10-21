# 云端增强版架构决策

初始日期：2026-10-20；目录边界于 2026-10-21 更新至 0.2.0，后端于同日更新至 0.3.0。

## 部署拓扑

```text
同一份文章和 React 组件
├─ pages 构建 → GitHub Pages /Blog/ → 现有静态博客
└─ cloud 构建 → Caddy HTTPS → Nginx /Blog/ → 云端增强版
                                └─ /api/v1/ → Go net/http + pgx → PostgreSQL
```

两个构建共用 scripts/build.mjs，包含原来的内容校验、SSG、构建和 SEO 审计。
Cloud 构建输出也为 dist，连续构建会覆盖上一个结果；CI 分别上传 dist/cloud-dist，部署时必须使用对应产物。
/Blog/ 保持一致使资源路径和离线作用域保持兼容。云端 Nginx 返回 X-Robots-Tag:noindex,follow；公开文章 canonical 保持指向配置中的 Pages 站点。

## ADR-001：首版渐进式 workspaces（历史决策）

根 package 承载现有博客；新建 packages/server、packages/project-notes。
根目录 scripts/gen:data、import.meta.glob、Pages CMS、内容旁路图片和 CI 都依赖当前目录。
立即将博客迁入 packages/blog 需要修改大量无关路径，会提高发布回归风险。因此首版先分离新增职责。

目录约定：

```text
package.json                 workspace 管理和博客入口命令
src/ config/ scripts/        现有博客代码与工具链
posts/ shuoshuo/ friends/    现有内容和 CMS 路径
packages/server/             API 源码、迁移与服务端集成测试
packages/project-notes/      架构、进度、历史版本
ai-rules/cloud-platform.md  AI 变更硬约束
deploy/cloud/                镜像、Compose、代理与部署说明
```

后续迁移条件：先完成路径契约测试，再一次性修改 CMS、glob、脚本根路径、配置别名、静态资源、SSG 和 Actions。
不建立一个仅转发根目录命令的 packages/blog，避免形成名义上的分包和双重入口。

## ADR-002：独立 API 与数据库会话（初始语言选择已由 ADR-007 替代）

选择 Fastify + TypeScript 复用现有开发语言；PostgreSQL 存储用户、一次性授权事务、会话和事件。
初版用户表使用唯一 github_id；未来支持多种登录时再拆 auth_identities 并迁移现有账号。
浏览器只持有 HttpOnly 会话 cookie。没有 JWT、本地持久化 token 或生产 mock 账号。
数据库迁移由一次性服务执行，API 不在每次启动时擅自变更 schema。

## ADR-003：首版行为记录范围

已登录用户自愿开启本次页面访问记录；每次路由访问发送一个白名单事件，失败最多重试一次。
事件 ID 在重试间保持不变；数据库去重。登录成功由服务端创建安全记录。
不收集匿名身份、完整搜索词、文章标题、上传内容和任意 attributes；不承诺浏览器行为零遗漏。
没有通用后台管理报表；个人入口只展示本账号最近 20 条记录。

## ADR-004：本机阅读历史不改变

现有 readingHistory 读取完成后删除记录，这是“继续阅读”列表而非完整阅读日志。
跨设备同步需显式的 reading/completed/deleted 状态和版本冲突协议，列入 0.2，不把本机列表直接当作云端真相。
Pages 和 cloud 的浏览器存储相互隔离，首版不自动迁移旧域名存储。

## ADR-005：HTTPS 自动化

Nginx 负责静态资源和 API 路由，Caddy 在其前面自动申请和续期证书。
对外仅公开 80/443；API 和数据库不映射宿主机端口。部署额外增加一个轻量网关容器，减少人工管理证书的步骤。
授权回调不启用访问日志，Nginx API error_log 也关闭以避免记录 code。
这意味着代理故障主要通过容器健康状态和不含请求 URL 的应用错误诊断。

## 后续版本

0.2：阅读同步、账号数据导出/删除、事件暂停与删除策略、收藏。
之后：自动发布与回滚、监控告警、异地备份恢复演练、必要时拆 packages/blog。

## ADR-006：前端归入 packages/blog，Pages 是部署目标

依据用户 2026-10-21 的项目结构优化要求，将实际前端源码、HTML、Vite/SSR、TypeScript、前端测试配置和依赖迁入 packages/blog。
根 package 转为工作区与共用工具编排；后端仍是 packages/server，工程记录仍是独立文档 package。

```text
packages/blog（共用 React 前端）
  ├─ pages → GitHub Pages：静态阅读和本机能力
  └─ cloud → 云端 Nginx：同一前端，加账号界面
                       └─ /api/v1/ → packages/server → PostgreSQL
```

Pages 没有独立源码副本；deploy/pages 记录 Pages 发布职责，deploy/cloud 管理服务器部署和运维。
GitHub Actions 继续放在根 .github/workflows，发布分支仍是 custom。

此次只迁移前端应用，不迁移 posts、shuoshuo、friends、Summary、posts-img 或 .pages.yml，避免改变 CMS 发文与已有文章 Git 日期。
config、public、generated 和 scripts 保留为根目录的共用内容/构建基础设施；浏览器数据服务同步调整指向根内容和生成数据的路径。
前端包导出少量无 UI 的 Markdown/加密核心，根 scripts 通过 npm package exports 引用，不再依赖前端目录的深层相对路径。

根 Vite 配置只 re-export 前端真实配置，根 config/tsconfig.json 只 extends 前端 tsconfig；旧命令继续可用。
前端实际 root 为 packages/blog，envDir 指向仓库根，静态资源、dist 和 dist-ssr 路径保持现有部署契约。
Vite 的 @、@config 别名语义保持，未增加路径别名。前端 workspace 可独立 dev/typecheck/test，也仍复用根唯一生产构建流水线。

迁移验证包括：CMS/内容文件摘要不变、正文真实懒加载、前端/SSR 配置根路径、两种产物隔离、全量回归、两套 SSG/SEO 构建、云端发布包中的前端依赖清单与后端独立依赖安装。

## ADR-007：Go API 替换 Node API（0.3.0）

依据用户要求，packages/server 改为独立 Go module。使用 net/http 路由与中间件、pgxpool、标准库测试；不增加业务框架层。
cmd/server 提供 serve、migrate、healthcheck；internal 按 config/github/httpapi/store 划分职责。
前端 packages/blog、内容/CMS 路径和 Pages/cloud 两种构建保留。
package.json 只作为开发与 CI 的 npm 命令适配器；Go 服务与生产镜像不依赖 Node。

沿用 SQL 文件、迁移账本及 advisory xact lock 7102026；SQL 使用 embed 打入二进制。
现有用户和事件不改写，旧 SHA-256 会话及 Cookie 继续可读，接口请求与 JSON 字段不变。
登录事务一次提交用户更新、创建会话、撤销旧会话与服务端登录事件。
Go 静态编译后放入 scratch 镜像，带 CA 根证书、非 root UID 10001；用自身 healthcheck 子命令检查数据库就绪。

服务端测试从 PGlite 改为真实 PostgreSQL，随机 schema 隔离；CI 内置测试数据库、race 检测与 go vet。
CI 保持 check/test/build 三个 job；Pages 单独部署无需 Go。
发布包只包含 Go 服务端、云端部署文件和前端 dist，不再携带前端 npm 清单或根 npm 锁文件。
线上切换沿用现有发布脚本与镜像标签；无需新建数据库、修改 OAuth App 或替换已有 Secret。
应用回滚时使用上一版 release 的 Compose 文件及镜像（旧 Node 镜像入口和健康检查与 Go 不同）。
