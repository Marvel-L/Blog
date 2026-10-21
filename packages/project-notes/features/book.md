# Book 功能进度

更新日期：2026-10-21。参考 [OI Wiki](https://oi-wiki.org/) 的「顶部分类 → 左侧层级目录 → 内容预览」组织方式，沿用博客自身主题与内容。

## 第一批：书架与分类预览（0.4.0）

- [x] 桌面导航新增 Book；移动端在原「更多」面板提供入口。
- [x] CSS 3D 书本、书页厚度、悬停/键盘反馈、浅色/深色及减少动效适配。
- [x] 公开 category 自动生成书本，使用真实文章数量；当前 9 本书、43 篇文章。
- [x] 分类预览：顶部分类切换、左侧文件目录层级、目录折叠与当前章节高亮。
- [x] 章节摘要预览、相邻章节、开始阅读、返回书架和进入原文阅读页。
- [x] 稳定分类 ID，未知路由/跨分类章节缺失态，`/Blog/` 子路径兼容。
- [x] 书架/分类/章节共用纯模型；路由接入 SSG、预加载、sitemap 和内容链接校验。
- [x] ai-rules/book.md 记录边界与后续全文接入约定。
- [x] 全量前端/脚本测试、覆盖率门槛、Pages/cloud 构建及桌面/手机浏览器验收。
- [ ] 推送与线上发布验收（当前批次只本地提交）。

第一批的「章节预览」曾明确为标题、摘要、标签及阅读信息；第二批已升级为独立 package Markdown 正文，Blog 文章降为章节末尾的延伸阅读。
第一批曾按文章数排序并从分类目录生成章节；第二批起书籍、章节分组与顺序均由 `book-packages.mjs` 显式维护。

## 第二批：独立 Package 与 Book Detail（0.4.1）

- [x] Book 与 category 解耦，改由 `book-packages.mjs` 显式维护书籍、章节、分组、顺序和封面信息。
- [x] 点击书籍进入 Book Detail，默认展示 package 第一章正文。
- [x] 详情页采用顶部 package 切换、左侧章节树、中间 Markdown 正文、右侧本页目录的 Wiki 式层级。
- [x] package 章节可关联公开 Blog 文章，章末复用文章页「你可能还喜欢」的 `CompactPostCard` 展示。
- [x] 没有关联文章时仍正常展示 package 内容；隐私、草稿与未知文章 ID 不进入推荐。
- [x] 旧 `/book/:bookId/chapter/:postId` URL 可映射到包含该文章的 package 章节。
- [ ] 推送与线上发布验收（当前批次只本地提交）。

## 后续增强

- [ ] package 正文图片、公式和 Mermaid 的完整复用与资源校验。
- [ ] 独立 Book CMS 编辑入口、配置校验与作者预览。
- [ ] 章节搜索、移动目录体验与本机阅读状态。

## 文件入口

- 模型与目录：`packages/blog/src/books/`
- 页面：`packages/blog/src/pages/Book.tsx`
- 导航：`packages/blog/src/components/Layout.tsx`
- 路由：`packages/blog/src/App.tsx`
- 构建：`scripts/ssg.mjs`、`scripts/generate-site-data.mjs`
- 规则：`ai-rules/book.md`

## 第一批验证记录

- 893 项前端/共用脚本测试通过，覆盖率为语句 60.54%、分支 52.41%，高于既有门槛。
- 前端 TypeScript、后端 go vet、ESLint 通过（保留原 4 条 Fast Refresh 警告）。
- Pages/cloud 均输出 123 页，其中 53 个 Book 路由；SSG、SEO 和部署隔离门禁通过。
- 书架/分类已加入 sitemap，章节摘要 noindex；初始 CSS 包含 Book 样式，无需等懒加载后才能显示。
- 浏览器验收：桌面导航/书架/章节、进入原文与返回，手机分类切换/目录收起/更多菜单入口，390px 无横向溢出。
- 静态构建使用 `/Blog/book/golang/` 目录地址直达，无水合错误；Vite preview 的无尾斜杠地址可能回退首页 HTML，不据此判断页面 SSG 失败。
- Go API 本轮无改动；执行了本地不依赖数据库的测试，未重新运行后端 PostgreSQL 集成/生产 OAuth。
- 文章、图片和 CMS 路径未修改；本地检查使用 SKIP_IMAGE_COMPRESS=1 避免重新压缩内容。
- 未推送、未部署；第二批/第三批待后续实施。
