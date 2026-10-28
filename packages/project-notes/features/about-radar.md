# 关于页能力雷达 — 开发任务与恢复记录

## 当前阶段

**正式功能与紧凑尺寸已完成本地验证。初始 config.json 为 {}，无等级时只显示雷达外框和中心黑点。用户已授权 commit & push；原 lint 扫描问题已在授权范围内修正，全仓 lint 通过。提交/推送实际状态以当前 git 记录为准，线上未验收。**

需求来源：用户要求在 `https://43.138.216.53/Blog/about` 的「订阅新文章提醒」上方增加能力雷达；先交付 HTML Demo，再经确认细化开发。任务记录放在 project-notes，不参与运行时构建。

## 用户确认的约束

- 九维顺序：算法、语言广度、语言深度、业务的广度、业务的深度、技术的广度、技术的深度、AI、学历。
- 最新轴格式为 `Title(等级)`，如 `学历(N)`；长解释仅在选择文档弹窗中。去除初版宣传说明与六级图例。
- 六级：N 灰 Newbie、G 绿 Green、B 蓝 Blue、V 紫 Violet、O 橙 Orange、R 红 Red。最新澄清既不恢复初版彩色扇区，也不保留纯灰：内部采用更透明的冰蓝玻璃渐变与反光薄边，六级颜色仍编码节点及轴旁字母，3.6 秒节点呼吸闪烁可关闭、reduced-motion 禁用，离屏/后台暂停。
- 当前等级用 config.json 的「维度:大写字母」管理；每维同名目录含 Index.md、Stage1.md、Stage2.md 等。
- 点击维度以真正模态弹窗展示文档列表；点击文件进入独立阅读页。单文件 Demo 用 `#/read/维度/文件`，支持直链、浏览器前进/后退与返回雷达；正文继续支持 Aa、===高亮=== 与原文。
- Stage1=V、Stage2=G 是用户示例，历史可非单调，不覆盖当前 config 等级。

## 探查结论与证据入口

1. 关于页插入点：`packages/blog/src/pages/About.tsx` 末尾 `IssueSubscriptionCard` 前；不改变现有作者、技术栈、折腾记录。
2. Aa 为 Resume 排版开关：`components/TypographyToggle.tsx`、`hooks/useResumeTypography.ts`、`styles/resumeTypography.css`；不是字号调节。
3. 文章插件基线：`utils/markdownPlugins.ts`，共享 GFM、Typora 标记、图片属性和 code meta；文章页按需加载 highlight/数学/Mermaid。
4. `remark-typora-marks-core.mjs` 当前最多两个等号，只支持 ==，不是 ===。Demo 打包时只替换内存副本的 tokenizer 长度限制，正式源码保持原样。
5. 已读 AGENT.md、ai-rules/README.md、about.md、post.md、theme.md。用户本轮明确授权补充规则；新规则只约束能力雷达，保留既有介绍规则。
6. 网页 fetch 仅返回站点壳层，没有读取到完整关于正文；原型依据本地真实源码，不声称已检查线上交互或完成上线。

## 可恢复入口

- 最终原型：`about-radar-prototype/关于页雷达图-demo.html`，双击用浏览器打开，单文件离线可用。
- 可编辑模板：`about-radar-prototype/demo-template.html`，全部雷达/文件交互为原生 JS 和 SVG。
- 生成脚本：`node about-radar-prototype/build-demo.mjs`，内联现有 remark 依赖、DOMPurify、Resume CSS 与项目 WOFF2 字体，不接入生产构建。
- 本地导入：目录根 config.json，各维下一层 .md；只读本地、不上传、原子提交、generation 防竞态。Demo 限 200 篇、单篇 1 MB、总体 10 MB。
- 默认全 N（非真实作者评分）；混合等级仅为配色与交互示例；27 份内联示例记录均标明非真实经历。
- 正式根目录 `about-radar/`，`config.json` 初始 `{}`；缺失维度/空值不显示等级，中心单个黑点。用户自己创建同名维度目录和 Markdown，不预生成示例自评。
- 共享正文已从 Post 抽取到 `components/markdown/MarkdownBody.tsx`；Post 与能力文档复用同一图片/代码/Mermaid 和增强管道。共享三等号 tokenizer 已正式实现，原型生成脚本不再做内存补丁。
- 截图/验收报告放原型的 `_shots/`，不是单独交付物。不要删除验收证据。

## 分阶段清单

### 第一阶段：Demo（当前）

- [x] 阅读规则，确认插入点、Aa 和现有 Markdown 扩展。
- [x] 独立原型源码、同源 Markdown 依赖内联与六级浅色 SVG。
- [x] 九个轴标题按钮、点维度→文件列表→正文/原文，Aa 与深浅色切换。
- [x] 配置编辑/导出/导入、目录只读导入、自然排序、输入错误保留状态。
- [x] 补充 ai-rules/about-radar.md 与长期记录。
- [x] 生成最终 HTML，桌面/移动核心主路径及真实 DOM 渲染验收通过；截图生成但读取通道未显示像素。
- [x] 类型检查与 61 项关联单测通过；本次脚本 lint 通过。全仓 lint 原命令受既有第三方目录干扰，排除第三方目录后 0 error / 4 条既有 warning。
- [ ] 本地 git 提交（不 push）：按 AGENT 提交门槛，原始全仓 lint 未通过，暂不提交；不为通过门槛擅改其他原型目录或忽略规则。
- [x] 用户确认 Demo 视觉与交互，并补充正式初始空状态。

### 第二阶段：正式实现（必须等待确认）

- [x] 正式目录 `about-radar/`，config.json 初始 {}，README 说明维护方式；未生成虚构等级/阶段正文。
- [x] 配置/同名目录 Markdown 读取与清单，客户端/SSR 共用 generated/abilities.json。
- [x] 抽取共享 MarkdownBody 渲染/增强层，Post 与能力页回归通过；修复图片 figure/p 非法嵌套，不改图片显示行为。
- [x] 共享 tokenizer 双/三等号、转义、比较、代码、Setext 回归通过；Feed 同源复用。
- [x] 关于页仅插入订阅之前，空/部分配置、弹窗与独立阅读页、原文及子路径测试通过。
- [x] Pages/cloud SSG 与 SEO/隔离审计通过；能力内容不进文章搜索/Feed，独立阅读页进入页面 sitemap。
- [x] 类型、本次 lint、全量低并发测试及两端构建通过；实际 Chrome 验证空状态/弹窗/临时混合等级→文档→代码/数学/Mermaid/原文。临时数据已还原。
- [ ] 原始全仓 lint 门槛与本地提交（既有第三方验证依赖和备份被扫入，未擅自修改规则或删除文件）。

### 第三阶段：发布（单独授权后）

- [ ] 本地提交，用户明确要求才 push。
- [ ] CI、Pages/cloud 发布结果及真实 /Blog/about 路径验证。
- [ ] 生产点九维、文件切换、Aa、===、移动可读性验收。

## 第一阶段验收结果

- `shot.py` 使用现有 `anki-prototype/_check_deps` 的 Playwright 与系统 Chrome；1440×900 和 390×844 两种视口都实际驱动核心路径，`_shots/report.json` 中 eval.executed=true、result.passed=true；每视口 22 项断言通过，consoleErrors/resourceErrors/horizontalOverflow 均为空。
- 覆盖：九维完整 Title、六种等级颜色、标签边界、点维度/文件、config 当前等级、三等号/双等号/嵌套格式/代码保留、下划线、原文、Aa 字体真实切换、危险链接净化、Setext、无效配置保留、阶段不覆盖当前等级、项目字体加载及页面宽度。
- 手机标签顶部热区超出图表边界已通过 clamp 修复；打包字符串替换使用 callback，避免打包正文中的 `$&`、`$'` 被 replace 误解；重新生成与完整主路径均通过。
- 桌面/手机真实截图已保存。Read 当前返回「图片媒体不支持」，因此**未完成人工像素级审美回看**，不声称截图肉眼检验通过；本轮有真实 DOM、computedStyle、字体加载和空间边界断言。
- `npm run typecheck` 通过（server 提示 .env 不存在并按既有行为继续，无运行时配置被创建/更改）。
- `npx vitest run` 关联 4 文件 / 61 项通过。Layout 测试有既有 jsdom Canvas 与 scrollTo 未实现提示；Demo 使用真实 Chrome 验证，无 Canvas 依赖，不修改无关测试。
- 原 `npx eslint .` 扫到既有 `anki-prototype/_check_deps` 等第三方 Python 包内 JS，失败（非本次新增文件）。同命令加两个第三方目录 ignore 后 0 error，HeroQuote/RankFlash 共 4 条既有 Fast Refresh warning；本次 build-demo.mjs 单独 lint 通过。保留第三方依赖、不改全仓 lint 配置。
- verifier-hub 最终 HTML 格式检查 passed=true；HTML 含内联字体约 16.6 MB，单文件离线，无 CDN 依赖。
- 配置导入与原生目录选择已实现但未逐一驱动系统文件选择器；导出下载、目录大文件限制、异步竞态依代码审查，待正式实现进一步自动化验收。数学/Mermaid、文章完整图片/代码工具栏将在确认后共享抽取，不冒充本轮已实现。
- Git 工作期间出现用户/其他工作对 `books/life/工作规划/北京回南方/我需要做什么.md` 的修改；本次未触碰，禁止纳入提交。

## 第二版反馈与验收（最新）

- 用户第二轮四项修改已执行：删除描述与图例、文件选择模态弹窗、文档独立阅读页面、维度 `Title(等级)`、中性内部与彩色节点光环（用常驻光环替代闪烁）。初版备份保留在 `_backup/`，不作为额外交付。
- 原生 `<dialog>.showModal()`，键盘焦点进入，关闭恢复轴焦点与背景滚动；Escape/遮罩关闭。文件为真实 hash 链接，阅读页隐藏整个雷达总览，返回恢复配置及阅读前位置，错误路由有明确空态。
- `shot.py --eval-file` 使用现有 Playwright 与 Chrome，对 1440×900 / 390×844 主路径验证均 `executed=true / passed=true`；最新报告 `_shots/report.json`。覆盖图例移除、九维字母、六种节点色、单一填充、边界、真实模态及焦点/锁、文件顺序、真实链接、独立页、Aa/字体/双三等号/代码、返回前进后退、直链与错误恢复、无横向溢出。
- 此轮仅 HTML 模板与两份规则/进度变更，无正式页面或文章插件变更；本次 build-demo 脚本 lint 通过。全仓 diff-check 受用户正在编辑的书稿空白字符影响，未修改该文件，未将它纳入本次改动。原始全仓 lint 的既有门槛问题仍保留，不擅自提交或 push。
- 截图生成，当前 Read 图片仍返回不支持，人工像素级审美回看未完成；实际浏览器 DOM、边界、computedStyle 与交互已校验。

## 第三版玻璃配色与节点闪烁（最新）

- 用户澄清要求新一版更透明、自然的玻璃颜色，而非恢复初版等级扇区或维持第二版浅灰。采用高透明冰蓝线性渐变、受数据轮廓 clip 限制的白色反光、细薄反光边缘；网格可透过，等级色仍由节点与字母表达。
- 节点 3.6 秒慢速呼吸，亮度保留 0.58–1，不完全消失；光环轻微放缩，九维错开相位。关闭开关只关闭闪烁，不影响玻璃填充与数据点；reduced-motion 禁用，离屏/后台暂停。
- 真实 Chrome 的桌面 1440×900 与手机 390×844 主路径验证均 executed=true / passed=true；新增实际采样间隔 900ms 比较节点 computed opacity，确认随时间变化；开关关闭与重启断言通过，弹窗/独立阅读页/Aa/===/返回/历史导航原回归通过。报告 `_shots/report.json`。
- 另以系统低动效分支测试静态回退，两视口禁用动画/按钮状态与玻璃保留均通过；总览截图及报告 `_shots/glass-preview/`。截图像素仍受当前读图通道限制，未做人工审美验收，不冒称已肉眼确认。
- 本轮仅原型、规则、进度文件；未修改正式关于页、正式文章 tokenizer、构建配置或线上。第二版备份保留 `_backup/`，不单独交付。正式开发仍等待用户确认。

## 正式实现与最终验收（最新）

- 代码入口 `abilities/AbilityRadar.tsx`、`pages/AbilityDocument.tsx`、`services/abilities.ts`、`abilities/ability-core.mjs`；生成入口 `scripts/lib/ability-content.mjs`。内容根 `about-radar/`，初始仅 `{}` 与维护说明，不存在真实等级或阶段记录。
- SSR 与客户端共用 generated/abilities.json，独立页面前缀 `/about/ability/`，About 前后内容不变。雷达 CSS 在 App 预加载，SSG 第一帧也有样式。
- 最新全量 Vitest **1256 项全部通过**（`--maxWorkers=2 --reporter=json`，报告 `_shots/official-tests.json`）；初次默认并发超时的无关项也经隔离复验通过。后端测试通过，但未配置 TEST_DATABASE_URL 的数据库集成项跳过；此次未改后端。
- 类型检查通过；本次文件 lint 0 error，共享正文文件含非阻断 Fast Refresh 导出 warning。原始全仓 lint 被既有原型第三方依赖与备份源码影响，保留诊断 `_shots/official-lint.json`，不得把“本次 lint 通过”写成“全仓 lint 通过”。不为提交门槛擅自删除依赖、调整全仓规则或混入用户书稿。
- Pages/cloud 完整构建、SSG、SEO 0 error、部署隔离通过；原有短 description/标题/层级与大型 chunk 警告保留，不擅自改网站其他文案。额外标题重复错误已修复，雷达用 aria-label 标注。
- 真实 Chrome 预览 `http://127.0.0.1:28371/about` 已检查：空数据九维无等级、文档弹窗空态与关闭；临时生成快照中混合等级正确，点 Index.md 到真实独立路由，代码复制/下载工具栏、KaTeX、Mermaid、原文切换可用。**未写正式 config.json；验证完 generated 已还原为空**。缺失文档/两种 base 路由与 SSR 正文通过自动测试。
- 本地页面有既有外部统计 CORS/资源 DNS 报错，不影响雷达；未更改统计或外部服务。截图通道先前不能读像素，未声称全屏像素级审美检查通过。
- 留存可编辑源码、规则与长期进度。尚未 push、未部署线上；生产入口仍为原页面。

## 正式雷达尺寸收敛（最新）

- 用户要求缩小展示范围，预计与原技术栈卡片相近；只调整雷达局部尺寸，不改变关于页其余布局、颜色、配置或文档阅读行为。
- 桌面容器宽度改为 `(100% - 1rem) / 2`，匹配原技术栈单卡；图表最大宽度从 700px 改为 320px，内边距统一 16px，标题 20px，维度 14px、点击热区仍至少 44px。顶部/底部相邻标签左右锚定，避免等级字母挤压。
- 本地服务仍为 `http://127.0.0.1:28371/about`；本轮类型检查、相关 lint、2 文件/9 项交互回归通过。真实 Chrome 实测雷达卡约 440×308px、技术栈约 440×256px，同宽；九维和空状态、点维度弹窗/关闭正常。DOM 临时追加等级字母并约束 440/343/288px 容器检查标签碰撞与越界，测试后立即恢复；非真实移动视口验收。正式配置保持 `{}`，没有测试评分或作者经历。未 commit/push/部署。

## 提交与推送（最新）

- 用户明确要求 `commit & push`，目标当前 `custom` 分支的 `origin`（Marvel-L/Blog）；不推送 upstream，不混入用户书稿。
- 经一次澄清，用户选择修正 lint 扫描范围：仅在 eslint.config.js 排除 `anki-prototype/_check_deps/**` 第三方验收依赖与 `about-radar-prototype/_backup/**` 历史源码备份。不删除文件，不放宽正式源码规则。
- 全仓 lint 已通过（0 error / 8 条 Fast Refresh warning），类型与最新 Pages/cloud 双构建通过。默认并发根测试出现 6 项资源/异步加载超时；低并发全量 156 文件/1256 项与后端测试通过，数据库集成因 TEST_DATABASE_URL 缺失按既有规则跳过。提交信息注明“依据用户授权破例”。原型模板与生成工具提交；自包含 HTML 内嵌的第三方 bundle 含有语义性的空白字符，不为通过 diff-check 修改其字符串，最终 HTML 与旧备份、大型诊断报告仅留本地，不作为正式功能提交。
- `VITEST_MAX_WORKERS=2 SKIP_IMAGE_COMPRESS=1 npm test` 完整根命令也已通过，覆盖前端/共享构建与后端；未修改测试配置。提交使用显式路径范围，保留用户已暂存的 `books/life/学历/index.md` 和其他书稿修改，不纳入能力雷达提交。
- 本记录随功能提交；实际 commit/push 结果以 `git log` 与 `origin/custom` 远端 refs 为权威来源。推送可能触发仓库既有 CI，结果需另行确认，不将 push 等同线上验收。

## 下次继续的第一步

先读本记录、`ai-rules/about-radar.md` 与当前 git 状态。正式本地实现已完成，不要重复实现；提交/推送状态以当前 git log 和远端 refs 为准，生产验收未完成。原始全仓 lint 第三方依赖扫描问题已按授权排除解决；低并发使用 `VITEST_MAX_WORKERS=2 npm test`，不改测试超时或跳过用例。配置为空是用户明确要求，不要擅自补 N 或复制 Demo 示例；用户书稿不纳入本任务提交。
