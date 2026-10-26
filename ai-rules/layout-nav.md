# 布局与导航（Layout）— AI 修改规则

## 功能概述

全站外壳：头部导航（桌面下拉/移动抽屉）、主题切换按钮、移动端滑动抽屉手势、Love 面切换入口、滚动进度/返回顶部、页脚、Cookie 提示条、Service Worker 更新提示、错误边界与 View Transitions 页面切换。

## 关键文件

- `packages/blog/src/components/Layout.tsx`（约 1350 行）
- `packages/blog/src/App.tsx`（路由 + 错误边界 + View Transitions）
- `packages/blog/src/components/{BackToTop, OfflineStatus, ServiceWorkerUpdatePrompt, CookieNotice, ReadingModeToggle}.tsx`
- Love 面细节见 [love-mode.md](love-mode.md)（`Layout` 只负责全站壳层切面与入口摆放）
- `packages/blog/src/hooks/useModalOverlay.ts`（弹层栈/滚动锁/焦点陷阱，全局共享）

## 修改规则（必须遵守）

1. **弹层栈语义**：useModalOverlay 的 openOverlayStack/scrollLockCount 是全局共享状态（多层弹层叠加时只第一个锁滚动、最后一个恢复）；hasOpenOverlay 用于页面快捷键守卫 —— 全部不得破坏。
2. **View Transitions**：页面切换必须 try/catch 回退（已有活动 transition 时同步抛 InvalidStateError）；水合首帧 `hasViewTransition=false`。
3. **移动抽屉手势**：touchmove 非 passive 监听、滑动距离/阈值、scrollTop<=1 判定 —— 保持既有行为。
4. **监听器清理**：window/document 监听、计时器必须成对清理（含主题切换计时器）。
5. **Cookie 提示**：「同意」永久持久化（localStorage）、「关闭」会话级（sessionStorage）语义保持。
6. **返回顶部**：隐藏时同步 visibility/tabIndex 并主动 blur 焦点。
7. **SSG 确定性**：主题/网络状态先渲染默认态再在 effect 中纠正；getServiceWorkerState 只读模块变量。
8. **Love 面边界**：涉及 Love 面入口位置、全站切面接管、导航收起与退出路径时，必须同时遵守 [love-mode.md](love-mode.md)；不要在 `Layout` 里复制另一套与文档脱节的 Love 逻辑。
9. **Anki 入口位置（2026-10-27 用户授权）**：共享头部品牌导航区在 **Love 心形按钮左邻**插入 Anki 入口。Pages 部署与 cloud 部署两个壳都要在共享头部出现；移动头部同理（跟随 Love 当前所在位置）；**不新增移动抽屉入口**——除非现有 Love 按钮本身就在抽屉里，否则不强制在抽屉重复放置，避免与用户精确位置冲突。**Love 按钮本身的位置、样式、动效、切换行为不得改动**——本授权只允许在其左邻插入一个新入口，不允许重排心形、不允许改心形颜色/尺寸/点击反馈。链接形态：cloud 壳使用同源 `<Link to="/anki">`（basename 由路由统一注入，禁止硬编码路径）；Pages 壳使用外链 `https://43.138.216.53/Blog/anki` 跳转到受保护服务器上的真实学习页，跳转后账号与 API 均在服务器同源内完成，**Pages 侧不发起跨域 API 调用**，不引入新鉴权链路。「只读调查」仅指本轮我方对该 URL 的核验动作边界，不是该链接对用户的功能定位。
10. **Home 大入口移除**：原 Home 首屏 Anki 大入口按本轮授权移除；Home「继续阅读」及其余空间/功能必须原样保留，不得因移除而塌陷、重排或改字号。

## 常见陷阱

- 修改 Layout 的动画时序会影响 Layout.test（真实计时器等待）；
- 导航菜单项与路由表（App.tsx Routes）需同步维护；
- z-index 体系（z-nav/z-modal/z-floating 等）由 tailwind 配置定义，改动需全局评估遮挡关系；
- Anki 入口新增时，Pages 与 cloud 两个部署壳的共享头部都要出现，位置严格限定为 Love 心形左邻；不强制在移动抽屉重复放置，除非 Love 本身就在抽屉里；不得顺手重排其他导航项。

## 本轮 Nav 落地事实（2026-10-27）

- Pages 外链定为 `https://43.138.216.53/Blog/anki`；cloud 壳同源 `<Link to="/anki">`。
- 品牌导航顺序：Anki 紧临 Love 左邻；Love 按钮原样式与切换行为保留。
- Home 仅移除原 Anki 大 section（约 -21 行）；「继续阅读」区域 40% 回归通过。
- Nav 相关测试与 Pages 外链、390 头部均通过；详细几何与门禁结论见 `packages/project-notes/features/anki.md`。
- 2026-10-27 恢复阶段：仅 `Layout.test.tsx` 内 4 个面板内容测试（非动画验证）改用 reducedMotion `matchMedia` 340→1 与 `fireEvent.mouseOver/open`；保留 2 个真实 340ms guard 与菜单 user click。修后默认 root blog 下 Layout 46 全绿；根总 15 failed（Rin/Mascot/Search/Trend/scripts）根因未全部解，未扩无关功能。
- 2026-10-27 最终完整 root `npm test`：18 files、46 fail / 1104、exit 1、43 timeouts，Go 因 `&&` short-circuit 未 run；scope 内 timeout 为 Layout 6 / Home 5 / Anki 1。代码与上一 run 相同，时序变化不能定外部 CPU/无回归原因；不写「外部负载饥饿」。此前 Layout 46 全绿是 `test:blog` 层历史 run，不可外推为 latest all green。标准 root 仍 blocked，待 Main 判断是否修 scope。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
