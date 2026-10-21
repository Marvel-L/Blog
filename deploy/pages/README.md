# GitHub Pages 部署

Pages 是 `packages/blog` 的静态部署目标，没有独立的 React 源码 package。
所有文章、页面与样式修改都在共用内容目录和前端 workspace 中完成。

- 发布分支：`custom`。
- 工作流：`.github/workflows/deploy.yml`（GitHub 要求工作流保留在根 `.github/workflows/`）。
- 构建命令：`npm run build` 或 `npm run build:pages`，走根 `scripts/build.mjs`。
- 目标：`VITE_DEPLOY_TARGET=pages`、`VITE_BASE_PATH=/Blog/`。
- 产物：根目录 `dist/`；包含原有内容校验、SSG、构建审计、SEO 与部署隔离审计。

Pages 保留静态阅读、工具和本机记录能力，不调用云端账号 API。
云端使用 `npm run build:cloud` 构建同一前端，账号相关代码通过目标条件动态导入。
页面规范地址仍由根 `config/site.config.json` 管理。

日常发文继续修改根 `posts/`、`shuoshuo/` 等 CMS 内容目录；推送 custom 后沿用现有 Pages 与云端发布流程。
