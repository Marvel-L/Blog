# Book 分类书架与预览 — AI 修改规则

依据用户 2026-10-21 的要求新增。进度与后续批次见 `packages/project-notes/features/book.md`。

## 架构与范围

- Book 是 packages/blog 的独立功能，使用作者维护的 package 定义；Pages/cloud 都可运行，不依赖账号、Go API 或数据库。
- `src/books/book-packages.mjs` 是 Book 的作者配置入口，维护封面信息、章节正文、章节分组与可选关联文章 ID。
- `src/books/books-core.mjs` 为纯目录模型，`books-core.d.mts` 声明类型；经 `@d-blog/blog/books-core` 提供给 SSG、sitemap 和内容链接校验。
- `src/books/BookTree.tsx` 管理递归目录交互，`src/books/books.css` 限定 Book 样式；`src/pages/Book.tsx` 管理书架与 package 详情。
- `/book` 为书架，`/book/:bookId` 默认展示第一章，`/book/:bookId/chapter/:chapterId` 展示 package 章节正文；旧文章 ID 形式的章节链接兼容映射到其所属 package 章节。

## 修改规则

1. Book 与 category 解耦：书籍、章节、分组和顺序只由 `book-packages.mjs` 显式维护，禁止重新按 category 自动生成；未被 package 引用的分类或文章不得自动出现在书架。
2. package 正文是 Book Detail 的主体；关联 Blog 文章仅从 `getInitialPosts()` 对应的公开元数据按 ID 解析，隐私文章、草稿、未知 ID 必须被排除。关联失败不得阻止 package 正文展示。
3. package 和章节 ID 必须稳定，不可随文章分类、数量或排序变化；未知书本/章节进入 noindex 缺失态，不静默选择另一章。旧文章 ID 章节 URL 只做兼容映射，不作为新的作者配置格式。
4. 目录按 package 中声明的章节顺序与 group 构建，禁止依赖当前时间、随机或运行 locale；同一关联文章可出现在多个章节，但书本级关联文章集合需去重。
5. 新路由必须同步 App、预加载、SSG、sitemap 和内容链接校验。书架与 package 章节可索引，正文和客户端首帧必须一致。
6. SSG 输出必须包含真实书架、目录与 package Markdown 正文；书架不急加载 Blog 全文、WebGL 或第三方 3D 库，3D 书封使用 CSS 透视。
7. 目录用 nav/嵌套列表/原生 button 或 details，不滥用 tree role。折叠同步 aria-expanded，隐藏后链接不可键盘到达；链接标识 aria-current；3D 装饰对辅助技术隐藏。
8. 桌面保留左侧 package 目录、中间正文与右侧本页目录；移动端目录可收起，本页目录降级为正文顶部索引，保持原站导航手势、弹层与主题行为。不要新增 main 嵌套或页面横向溢出。
9. 3D 悬停必须有键盘 focus-visible 等效反馈；遵守 prefers-reduced-motion，不做自动旋转、强制拖拽或持续动画。样式限定于 Book，不修改全站主题。
10. Markdown 渲染复用 `markdownPlugins` 和站内 `prose` 体系；代码高亮使用既有 rehype 能力，链接不可注入 raw HTML。若接入图片、公式或 Mermaid，必须继续遵守 post.md 的净化、资源路径与竞态规则。
11. 关联文章展示复用 `CompactPostCard`，不得复制另一套推荐卡片；空关联只隐藏推荐区，不显示伪造数据或错误占位。
12. 每批次更新功能进度文件，分别写明实现、验证和发布状态。测试需覆盖 package 独立性、目录层级、正文渲染、文章关联、旧链接兼容、未知路由和子路径部署。
