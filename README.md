# 欢迎来到我的世界

## 正文图片尺寸

```md
![说明](a.jpg)                    # 默认通栏
![说明](a.jpg){.small}            # 缩小居中（另有 {.medium}）
![a](a.jpg){.inline} ![b](b.jpg){.inline}   # 并排（默认 small）
![a](a.jpg){.small}{.inline}      # 多修饰：多个 {} 依次书写
![截图](x.jpg){.no-dark}          # 暗色不降亮（兼容 title "no-dark"）
```

详见 `ai-rules/post.md`。

## 本地图片压缩

`npm run dev` / `npm run build`（经 `gen:data`）会幂等压缩 `posts/`、`shuoshuo/`、`Summary/` 旁路 jpg/png/webp；已记录在 `config/image-compress-manifest.json` 的文件不会重压。也可单独执行 `npm run compress:images`。

浏览器工具页：导航「更多 → 图片压缩」（`/image-compress`），支持本地上传下载，并展示站内已压缩配图收益。

## Resume 阅读排版

首页及全站导航栏的外观/氛围按钮旁新增「排版」开关。开启后，Markdown 正文采用 Resume 的 Lapis CV Serif 风格：思源黑体正文、思源宋体标题、JetBrains Mono 英文与代码、1.8 倍行高、蓝色章节标题及细分隔线。字号与段落留白按博客长文适配，同时支持浅色、深色和专注阅读模式。

默认使用原样式，关闭开关即可恢复。选择保存在本机浏览器中，跨页面和刷新后继续生效；存储不可用时仍可在当前会话切换。字体随项目提供，WOFF2 文件仅在新排版启用时按需加载，首次开启可能需要等待字体下载。字体来源与许可见 `packages/blog/src/assets/resume-fonts/NOTICE.md`。

## 项目结构与双端部署

同一份前端、同一份文章，发布到 GitHub Pages 和云服务器。日常继续在 custom 发文，不需要复制文章或 commit。

```text
packages/
  blog/            React 前端：页面、样式、账号界面、Vite 与前端依赖
  server/          Go 后端：GitHub 登录、数据库会话、行为记录、SQL 迁移
  project-notes/   架构、任务进度、版本与部署记录
deploy/
  pages/           GitHub Pages 静态发布说明
  cloud/           云服务器容器、网关、发布、证书与备份
scripts/           共用内容生成、SSG、构建与审计工具
config/            共用站点、内容及构建配置
posts/ shuoshuo/ friends/ Summary/ posts-img/
                   内容和 CMS 路径保持原位
public/            共用静态资源输入（含内容生成的配图等）
.github/workflows/ CI、Pages 发布与云端自动发布入口
```

`packages/blog` 是实际前端 workspace，不为 GitHub Pages 再复制一份源码。
Pages 构建仅包含静态能力；cloud 构建加入账号入口，通过同源 `/api/v1/` 访问后端。
根 package 负责工作区编排，根 Vite/TypeScript 配置只保留已有命令的兼容入口。

```sh
npm ci
npm run dev           # 静态前端
npm run dev:cloud     # 云端前端，本地 /api/ 代理到 3001
npm run dev:server    # 独立 API（需先配置数据库和 OAuth）
npm run typecheck    # 前端 + 后端
npm test             # 前端 + 共用脚本 + 后端
npm run build:pages  # 静态 Pages 产物
npm run build:cloud  # 同一前端的 cloud 产物
```

两种构建共用 `scripts/build.mjs`，输出都为根 `dist/`，连续构建会覆盖上一份本地产物；CI 分别保存制品。
前端也可通过 `npm run dev --workspace @d-blog/blog` 等命令单独运行。

后端开发与全仓库检查需 Go 1.27.3；SQL 集成测试需设置独立 `TEST_DATABASE_URL`。只构建 Pages 不需要 Go。

详细说明：[前端](packages/blog/README.md) · [后端](packages/server/README.md) · [部署目标](deploy/README.md)。
Book 从 `books/<package>/` 自动读取 Markdown 章节，每本书可用 `config.json` 或 `config.yaml` 配置封面、分组与顺序。创建 Book 和章节无需修改脚本，详见 [Book 内容维护](books/README.md) 与 [Book 进度](packages/project-notes/features/book.md)。

工程进度见 [项目记录](packages/project-notes/README.md)，架构约束见 [云端规则](ai-rules/cloud-platform.md)。
