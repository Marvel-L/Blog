# 文章详情页（Post）— AI 修改规则

## 功能概述

文章正文页：SSG 预渲染完整正文、Markdown 渲染（react-markdown + remark/rehype 插件）、代码块工具栏（复制/下载/行号/折叠）、Mermaid 图表（缩放/平移/主题同步）、阅读进度保存与恢复、目录 TOC 与锚点、相邻文章快捷键、分享。

## 关键文件

- `src/pages/Post.tsx`（约 2600 行，全站最大文件）
- `src/utils/headings-core.mjs` / `headings.ts`（标题提取/锚点 id，**构建端与客户端共享**）
- `src/utils/remarkCodeMeta.ts` / `markdown-core.mjs` / `markdownText.ts`
- `src/utils/remarkImageAttrs.ts` / `remark-image-attrs-core.mjs` / `markdownImageDisplay.ts` / `markdown-image-display-core.mjs`（图片属性块）
- `src/components/{TableOfContents, GiscusComments, ShareModal, ReadingProgressBadge, ProgressiveImage, ImageViewer}.tsx`
- `src/utils/readingProgress.ts`
- 文章分级闪卡见 [post-rank.md](post-rank.md)（`PostRankFrame` / `FlashCover`，逻辑不堆进本页）

## 正文图片属性块（作者约定）

语法：`![alt](file.jpg){.small}{.inline}`（多修饰写成**多个** `{}`，依次紧挨）。

| class                       | 含义                                                               |
| --------------------------- | ------------------------------------------------------------------ |
| （无）                      | 通栏全宽（默认）                                                   |
| `{.small}` / `{.medium}`    | 居中缩小                                                           |
| `{.inline}`                 | 同行并排；**未写尺寸时默认 small**，可用 `{.inline}{.medium}` 覆盖 |
| `{.no-dark}` 或 `{no-dark}` | 暗色模式不降亮；亦兼容旧写法 `![alt](x.jpg "no-dark")`             |
| `{.fx-*}`                   | 特效预留，透传到 `<figure class>`，一期可不实现样式                |

示例：`![a](a.jpg){.inline}`、`![a](a.jpg){.small}{.inline}{.fx-spark}`。

实现要点：

- 解析在 `remarkImageAttrs`（挂入 `remarkCommonPlugins`）；展示映射在 `Post.tsx` 的 `img` / `p`（纯 `.inline` 段 → `markdown-image-row`）。
- Feed 管道（`scripts/feed-markdown.mjs`）必须同步挂载同一插件，避免 RSS 残留 `{.small}` 文本。
- 新增尺寸/特效时：先扩展 `markdown-image-display-core.mjs` 与 `Post.tsx` 映射，再更新本表与根 README 的精简说明；**不要**改回 title 令牌或单 `{}` 内空格拼 class 的写法。

## 修改规则（必须遵守）

1. **SSG 确定性**：正文、标题、阅读时长等全部锚定文章数据；渲染期禁用时钟/随机。
2. **TOC/锚点一致性**：DOM 标题 id 必须与构建端 `extractMarkdownHeadings` 输出的 id 一致；`resolveHeadingId` 的二次扫描必须跳过已占用 id（防重复 id）；修改 headings-core 时同步考虑 post-content-validator 与 TOC。
3. **竞态防护**：文章加载（cancelled）、Mermaid 渲染（cancelled）、阅读进度保存（节流 + 卸载守卫）、分享/复制（seq/generation）的既有防护不得移除。
4. **代码块**：行号折叠（MAX_CODE_LINES）保持惰性初始化；复制/下载走既有工具；代码内容不进行任何 HTML 注入（高亮由 rehype-highlight 处理）。
5. **Mermaid**：缩放必须矢量缩放（改 width 而非 transform: scale）；wheel 用原生非 passive 监听（否则页面同步滚动）；SVG 必须经 DOMPurify 净化（useMemo 缓存）；拖动用 rAF 节流。
6. **HTML 净化**：`dangerouslySetInnerHTML` 内容必须经 DOMPurify（含 KaTeX/Mermaid 注入）。
7. **阅读进度**：进度/恢复逻辑在 `readingProgress.ts`（start/end 阈值、clamp、完成阈值），不得在组件内重写公式。
8. **无障碍**：`role="application"` 仅限 Mermaid 视口容器（其确实接管键盘）；复制/分享按钮有可访问名称；快捷键有 kbd 提示。
9. **性能**：`stripMarkdown(post.content)` 结果必须 useMemo 缓存（meta description 与 articleBody 共用）；useMemo 不得放在条件早退之后（Hooks 规则）。
10. **分级闪卡**：标题区与封面的闪卡、专注阅读只留段位名、正文不被光泽覆盖，均遵守 [post-rank.md](post-rank.md)。不要把闪卡样式内联进 `Post.tsx`。
11. **图片属性块**：只认 `{.class}` 约定；点击预览、ProgressiveImage、暗色适配链路不得因尺寸/并排被绕过；任意 `key=value` 不得直接落到 DOM 属性。

## 常见陷阱

- 标题含图片/公式时渲染文本与 rawText 不一致 → 锚点错位（按既有 usedHeadingIds 兜底）；
- 修改 headings-core 的正则会影响构建期校验（锚点链接校验）；
- Post.tsx 体量极大，新增逻辑优先抽到 utils/组件，避免继续膨胀；
- 只改前端、漏改 feed 插件 → RSS 正文出现 `{.small}` 字面量；
- `.inline` 图若未全部标记，不会组成并排行（各图按自身尺寸单独排布）。
- `p` 检测并排时子节点仍是 `img`（不是 figure）：必须用 className 含 `inline` 判断，不能只看 `data-inline`。
- 图片宽度样式必须写在 `index.css`（`data-size` / `data-inline`），**不要**把任意值 Tailwind class 只放在 `.mjs` 里——`tailwind.config.js` 的 content 不扫描 `.mjs`，会导致通栏变大、无法横排。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
