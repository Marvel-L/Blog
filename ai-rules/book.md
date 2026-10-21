# Book 分类书架与预览 — AI 修改规则

依据用户 2026-10-21 的要求新增。进度与后续批次见 `packages/project-notes/features/book.md`。

## 架构与范围

- Book 是 packages/blog 的独立功能，使用同一份公开文章元数据；Pages/cloud 都可运行，不依赖账号、Go API 或数据库。
- `src/books/books-core.mjs` 为纯目录模型，`books-core.d.mts` 声明类型；经 `@d-blog/blog/books-core` 提供给 SSG、sitemap 和内容链接校验。
- `src/books/BookTree.tsx` 管理递归目录交互，`src/books/books.css` 限定 Book 样式；`src/pages/Book.tsx` 管理书架/分类/章节预览。
- `/book` 为书架，`/book/:bookId` 为分类概览，`/book/:bookId/chapter/:postId` 为章节摘要预览。完整阅读仍进入原 `/post/:id`，一期不复制正文渲染器。

## 修改规则

1. 数据只来自 `getInitialPosts()` 对应的公开元数据；不读取隐私文章、草稿、解密缓存、私有目录或全量搜索正文来补充书架。
2. 一本书对应一个现有 category；不搬移内容/CMS 路径，不复制文章。不用演示内容伪造书籍或文章数量；空分类不制造空书。
3. 目录默认按已有文件夹构建，index.md 的文章容器不再形成重复层；共同容器可由书本代表。系列内尊重 seriesOrder，其他项目稳定排序，不依赖当前时间、随机或运行 locale。
4. 分类 ID 稳定，已发布的已知分类 slug 不可随排序、文章数量改变；未知分类使用无碰撞的确定性 ID。跨分类章节、未知书本/章节进入 noindex 缺失态，不静默选择另一章。
5. 新路由必须同步 App、预加载、SSG、sitemap 和内容链接校验。书架与分类概览可索引；摘要章节预览 noindex，正文索引仍由原文页承担。
6. SSG 输出必须包含真实书架/目录/摘要；首帧与客户端一致。书架不急加载 Markdown、WebGL 或第三方 3D 库；一期 3D 使用 CSS 透视。
7. 目录用 nav/嵌套列表/原生 button 或 details，不滥用 tree role。折叠同步 aria-expanded，隐藏后链接不可键盘到达；链接标识 aria-current；3D 装饰对辅助技术隐藏。
8. 桌面保留左侧目录；移动端提供可收起的目录与横向分类栏，保持原站导航手势、弹层与主题行为。不要新增 main 嵌套或页面横向溢出。
9. 3D 悬停必须有键盘 focus-visible 等效反馈；遵守 prefers-reduced-motion，不做自动旋转、强制拖拽或持续动画。样式限定于 Book，不修改全站主题。
10. 后续接入全文时先抽取并复用文章的 Markdown、HTML 净化、图片、代码块与锚点能力，遵守 post.md；异步加载处理取消、切换竞态和失败重试，不在 Book 复制一套弱化渲染器。
11. 每批次更新功能进度文件，分别写明实现、验证和发布状态；未完成的全文阅读/手动目录配置不得记为完成。测试需覆盖目录层级、实际跳转、分类隔离、折叠、未知路由和子路径部署。
