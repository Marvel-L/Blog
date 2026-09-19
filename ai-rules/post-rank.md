# 文章分级闪卡（post rank）— AI 修改规则

## 功能概述

文章可选分级：青铜、白银、黄金、钻石、星耀、王者。front matter 不写 `rank`，或写成空字符串时，保持普通展示，不挂闪卡、徽标或色条。配置合法档位后，列表卡片、紧凑卡、归档行与阅读页展示对应金属描边、封面光泽和段位徽标。光泽只走描边和封面，正文保持实底，避免闪光压低阅读对比度。

## 关键文件

- `config/content.config.json` 的 `postRanks`（构建期白名单）
- `src/utils/postRank.ts`（`POST_RANKS` / `RANK_SLUG` / `isPostRank`）
- `src/utils/postRank.test.ts`（断言 JSON 白名单与 `POST_RANKS` 一致）
- `src/components/RankFlash.tsx`（徽标、标题框、封面套；指针只写 CSS 变量）
- `src/index.css`（`.flash-rank--*` 颜色变量、`.flash-surface--card|frame|cover`）
- `scripts/generate-site-data.mjs`（校验 `rank`，经 `normalizeRank` 写入 `posts.json`）
- `src/types.ts` 的 `PostMetadata.rank`
- 消费面：`src/components/PostCard.tsx`、`src/components/CompactPostCard.tsx`、`src/pages/Post.tsx`、`src/pages/Archive.tsx`
- `.pages.yml` 文章集合的 `rank` select（非必填）

## 修改规则（必须遵守）

1. **缺省即普通**：未配置、`null`、空字符串不得渲染任何分级样式。客户端用 `isPostRank` 拒掉未知值，禁止把非法档静默显示成某一档。
2. **非法值 fail-closed**：`rank` 有非空内容但不在 `postRanks` 内时，`generate-site-data` 必须非零退出（与分类白名单同一口径）。禁止构建期回退成「其他」或丢掉错误继续发布。
3. **白名单双源一致**：`content.config.json` 的 `postRanks` 与 `postRank.ts` 的 `POST_RANKS` 成员和顺序必须一致。增删档位要同时改 JSON、`RANK_SLUG`、`index.css` 的 `.flash-rank--*`、`.pages.yml` 的 select options。中文档位不得直接进 class 名。
4. **字段契约**：front matter 键名固定为 `rank`。写入 `posts.json` 必须走 `normalizeRank` 显式赋值，不要放进 `POST_FRONTMATTER_ALLOWLIST` 原样透传（未 trim 的脏值会进产物）。`PostMetadata.rank` 与消费方类型同步。
5. **光泽不盖字**：全息光只允许在描边（`mask` 挖空内容区）和封面上。禁止把 `flash-surface--card` 套到整篇正文，也禁止在 `.post-prose` 上加左侧色条、竖线或额外分隔（那会被看成正文多了一列分隔符）。分级只出现在标题框、封面和徽标。
6. **阅读页**：标题区用 `PostRankFrame`，封面用 `FlashCover`。专注阅读传 `quiet`，只留段位名，去掉流动描边。标题是 LCP，不得用 `opacity: 0` 入场。新增逻辑放在 `RankFlash` / `postRank`，不要继续堆进 `Post.tsx`。
7. **动效与性能**：指针只 `setProperty('--flash-x' / '--flash-y')`，禁止用 `setState` 驱动光斑（会让 `PostCard` 的 `memo` 失效，列表跟着鼠标重渲染）。`prefers-reduced-motion` 时不跟随指针，并停掉 `flash-drift`。渲染期禁止随机数和时钟。
8. **展示面同一套**：首页与搜索的 `PostCard`、紧凑卡、阅读页、归档元信息都读同一个 `rank`。归档是时间线，只放行内徽标，不要把整行改成闪卡。新的文章列表复用 `RankFlash`，不要再复制一套颜色。
9. **CMS**：`.pages.yml` 的 `rank` options 与 `postRanks` 一致，且不得标成 required。留空表示普通展示。
10. **打印**：打印样式去掉流动描边和封面光泽；段位名可以留下。

## 常见陷阱

- 王者档的彩虹若用 `padding-box` 实色铺满标题框或封面，会盖住 `conic-gradient` 描边。`frame` / `cover` 的彩虹只能作为 padding 缝里露出的背景，实心底色放在内层（`.flash-frame-body`）。
- 卡片分类行有 `uppercase` / `tracking-wider`，会继承到徽标。`.flash-rank-badge` 必须自己复位 `text-transform` 和 `letter-spacing`。
- `background` 简写会清掉 Tailwind 的 `bg-white` / `dark:bg-zinc-900`。卡片填充色用 `--flash-fill`，深色模式跟着 `html.dark` 改，不要只靠 utility class。
- 块注释里写 `*/` 会提前结束 JSDoc。档位说明不要写成 `posts/**/*.md`。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
