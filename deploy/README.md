# 部署边界

前端源码在 `packages/blog`，后端源码在 `packages/server`。
GitHub Pages 与云服务器是部署目标，发文与功能代码都继续维护在 custom。

| 目标 | 构建与发布入口 | 部署内容 |
| --- | --- | --- |
| [GitHub Pages](pages/README.md) | `npm run build:pages`；`.github/workflows/deploy.yml` | 同一前端的静态版本，无登录接口 |
| [云服务器](cloud/README.md) | `npm run build:cloud`；CI 成功后触发 `deploy-cloud.yml` | 同一前端的 cloud 版本，加 API、PostgreSQL、网关 |

同一份文章生成两种前端制品；不需要将文章复制到另一个分支或目录。
静态制品统一输出根 `dist/`，CI 用独立的 dist/cloud-dist artifact 保存。
账号配置、数据库卷、证书和备份不在前端制品内。
