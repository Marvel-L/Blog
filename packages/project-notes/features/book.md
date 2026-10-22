# Book 功能进度

更新日期：2026-10-22。参考 [OI Wiki](https://oi-wiki.org/) 的「顶部分类 → 左侧层级目录 → 内容预览」组织方式，沿用博客自身主题与内容。

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
- [ ] 独立 Book CMS 编辑入口与作者预览（本地配置校验已完成）。
- [ ] 章节搜索、移动目录体验与本机阅读状态。

## 第三批：本地内容 Package（0.4.2）

- [x] 按用户要求删除 `.mjs` 作者内容入口；`books/<package>/` 自动发现书籍和 Markdown 章节。
- [x] 可选 `config.json` / `config.yaml` / `config.yml` 控制封面、名称、书架顺序和优先章节顺序；未登记的章节自动追加。
- [x] 章节 front matter 支持稳定 ID、标题、分组、排序、草稿和可选关联文章；无配置时取文件与目录默认值。
- [x] 现有 9 本书、12 个章节迁移前后逐项比对一致，保留封面、正文、顺序与旧 URL。
- [x] 生成 `generated/books.json`，客户端/SSR、SSG 路由、sitemap 与 Blog 内容链接校验共用目录快照；章节加入 sitemap。
- [x] 开发模式监听本地内容增删改，配置错误显示诊断；配置与内容读取失败阻断构建。
- [x] 提供 [Book 内容维护](../../../books/README.md) 说明与创建示例。
- [x] Book 回归测试、类型检查与 Pages/cloud 构建验收（全量环境限制见第三批验证记录）。
- [ ] 推送与线上发布验收。

## 第三批验证记录

- 迁移前用深比较确认 9 本书、12 个章节的封面、正文、分组、顺序与关联 ID 完全一致；额外字段只有源文件路径。
- Book 读取、开发监听、目录模型与页面测试通过，覆盖无需配置的新书、递归章节、JSON/YAML、配置覆盖与排序、草稿、错误诊断、公开关联、旧链接及 `/Blog/` 路径。
- 123 个可运行测试文件 / 927 项测试通过；覆盖率语句 61.29%、分支 53.10%，通过既有门槛。回归复跑限定 4 个 worker，文件上传等 I/O 用例使用 20 秒 CLI 超时，未更改仓库测试配置。
- 完整首轮回归中两项既有 `materialize-cloud-release` 测试因系统 Python 的 `tarfile.extractall(filter=...)` 不可用而失败；覆盖率复跑排除了该文件的 7 个测试，不将其报告为通过。上传超时用例在复跑中通过。
- TypeScript、Go vet 和本地非数据库 Go 测试通过；Go 通过现有 SDK 的自动工具链选择匹配 module 版本，未改 SDK 配置。ESLint 无错误，保留原有 4 条 Fast Refresh 警告；未配置测试数据库，SQL 集成测试按既有约定跳过。
- Pages/cloud 完整构建、SSG、SEO 与部署隔离门禁通过；两种产物的 22 个 Book 路由均检查了真实章节标题与 `/Blog/` 链接，章节出现在 sitemap。
- 本地验证使用 `SKIP_IMAGE_COMPRESS=1`；未推送、未部署。

## 文件入口

- 作者内容与配置：`books/`，使用说明 `books/README.md`
- 内容读取与开发监听：`scripts/lib/book-content.mjs`、`scripts/lib/book-content-watch.mjs`
- 模型与目录：`packages/blog/src/books/`
- 页面：`packages/blog/src/pages/Book.tsx`
- 导航：`packages/blog/src/components/Layout.tsx`
- 路由：`packages/blog/src/App.tsx`
- 构建：`scripts/ssg.mjs`、`scripts/generate-site-data.mjs`
- 规则：`ai-rules/book.md`

## 第四批：按真实子 package 组织目录（0.4.3）

- [x] 依据用户反馈移除章节和配置中的 `group` 字段；同一子 package 的章节放在同一子目录。
- [x] 12 个已有章节迁到对应物理子目录，并保留稳定 ID、正文、关联文章与原有 22 个 Book 路由。
- [x] 多层子目录生成递归导航树，根目录文章直接显示为章节；同名子目录按完整路径区分。
- [x] 目录树与相邻章节共用深度优先阅读顺序；配置交错引用同一子目录时，章节仍集中在该目录下。
- [x] 使用说明与 Book 规则同步更新；旧 group 字段按未知配置报错。
- [x] 47 项 Book 相关测试通过；123 个可运行测试文件 / 931 项回归通过，覆盖率语句 61.30%、分支 53.02%。沿用第三批的本机环境限制，排除既有云端解包测试文件的 7 项测试，未将其报告为通过。
- [x] TypeScript、Go vet、ESLint 通过（原 4 条 Fast Refresh 警告保留）。
- [x] Pages/cloud 完整构建及 SSG、SEO、部署隔离门禁通过；最终 cloud 产物验证了全部 22 个 Book 路由、真实目录标签、正文与阅读顺序，生成快照和源文件一致。
- [ ] 推送与线上发布验收。

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
