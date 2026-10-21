# @d-blog/blog — 共用前端

此 workspace 拥有 React 页面与组件、云端账号界面、HTML 入口、Vite/SSR 配置、前端类型检查及测试。
GitHub Pages 与云服务器使用同一份前端源码；差异通过 pages/cloud 构建目标控制。

## 目录边界

- `src/`：组件、页面、数据服务、样式、前端资源与同目录测试。
- `src/cloud/`：cloud 目标才加载的账号界面，Pages 产物不包含账号代码和 API 引用。
- `index.html`、`vite.config.ts`、`vite.ssr.config.ts`：真实客户端与 SSR 入口配置。
- `tsconfig.json`、`vitest.config.ts`、`package.json`：前端自身的类型、测试、依赖和命令。
- 部分无 UI 的 Markdown/加密核心通过 package exports 供根 scripts 使用，根工具不引用 React 组件。

文章、配图、说说、友链、Summary 和 CMS 配置仍在仓库根目录，发文路径保持不变。
根 `config/` 是站点/内容与共享构建配置，根 `public/` 是构建期静态资源输入；`generated/` 为生成的数据。
不在前端包中复制另一份文章、配置或 public。

## 开发与验证

在仓库根目录安装依赖，锁文件仅使用根 `package-lock.json`：

```sh
npm ci
npm run dev               # 静态前端 / Pages 能力
npm run dev:cloud         # 同一前端，加账号入口及 /api/ 开发代理
npm run dev:server        # 另一个终端启动 API（先配置数据库和 OAuth）
npm run test:frontend     # 仅前端测试；根 npm test 包含共享脚本与后端
```

也可进入本目录直接执行 `npm run dev`、`npm run typecheck`、`npm test`。
站点构建继续调用仓库唯一的 `scripts/build.mjs`，内容校验、SSG 和审计没有另建一套。
根 `.env` 是统一环境变量入口；只有 `VITE_` 前缀配置参与浏览器构建，OAuth/数据库凭据属于服务端。

```sh
# 从仓库根目录执行；两种目标输出同为根 dist/，需要连续构建时分别保存制品。
npm run build:pages
npm run build:cloud
```

Pages 部署见 [Pages 说明](../../deploy/pages/README.md)，云端部署见 [云端说明](../../deploy/cloud/README.md)。
