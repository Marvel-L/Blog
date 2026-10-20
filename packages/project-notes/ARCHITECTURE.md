# 云端增强版架构决策

日期：2026-10-20；版本：0.1.0。

## 部署拓扑

```text
同一份文章和 React 组件
├─ pages 构建 → GitHub Pages /Blog/ → 现有静态博客
└─ cloud 构建 → Caddy HTTPS → Nginx /Blog/ → 云端增强版
                                └─ /api/v1/ → Fastify → PostgreSQL
```

两个构建共用 scripts/build.mjs，包含原来的内容校验、SSG、构建和 SEO 审计。
Cloud 构建输出也为 dist，连续构建会覆盖上一个结果；CI 分别上传 dist/cloud-dist，部署时必须使用对应产物。
/Blog/ 保持一致使资源路径和离线作用域保持兼容。云端 Nginx 返回 X-Robots-Tag:noindex,follow；公开文章 canonical 保持指向配置中的 Pages 站点。

## ADR-001：渐进式 workspaces，不立即迁移博客

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

## ADR-002：独立 API 与数据库会话

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
