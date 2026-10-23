# 凛的陪伴角落

## 当前交付

全站左下角的可交互看板娘，形象来自用户提供的志摩凛设定图。默认使用拆分的头部和身体 WebP 图层，支持轻微转头、呼吸、眨眼、打招呼、喝茶、搜索入口、暂停、换边和收起。

**当前显示的是轻量 2D 预览，不是已绑定的 Cubism Live2D 模型。** 用户提供的是单张 449 × 445 参考图，仓库没有志摩凛的 `.moc3` 文件，因此无法凭此导出真实的 Cubism 模型；当前转头是图层变换。参考图分辨率限制了放大清晰度。

- 桌面首次访问默认展开；小于 1024px 的设备首次访问默认收起。
- 显式的展开/收起、暂停、左右位置保存在 `d-blog-rin-mascot`。
- 专注阅读和 Love 面卸载组件；退出时恢复偏好。
- 后台标签页暂停动画；遵循系统减少动态效果设置。
- 绕开返回顶部按钮，并使用已有 Cookie 提示、更新提示、底部导航和安全区高度。
- 对话是本地固定文案，无网络聊天请求、无语音或录音。
- 2D 图层随站点打包，生产运行无需图片生成服务或外部图片 CDN。
- 关闭对话和收起后恢复焦点；对话支持 Escape 和外部点击关闭。
- SSR 不渲染设备相关角色 UI，水合后才读取视口与存储。

## 接入正式 Live2D 模型

已实现 Cubism 3/4 模型加载器，使用 `pixi.js@6.5.10` 和 `pixi-live2d-display@0.4.0`。它按需分包，默认 2D 预览不会下载或执行 Pixi/Cubism。尚未用真实志摩凛模型验证渲染；当前运行时生命周期测试使用模拟模型。

1. 在 Cubism Editor 中完成拆图、遮挡补绘、网格和参数绑定，或提供已导出的志摩凛模型。
2. 将完整导出目录放到 `public/live2d/rin/`，保留相对路径：
   - `rin.model3.json`
   - `.moc3`
   - 贴图目录
   - 模型引用的动作、表情、物理配置（如有）
3. 从 [Live2D 官方 Cubism SDK for Web](https://www.live2d.com/en/sdk/download/web/) 取得与模型兼容的 `live2dcubismcore.min.js`，按其使用条款放到 `public/live2d/live2dcubismcore.min.js`。
4. 修改 `packages/blog/src/components/mascot/rinConfig.ts`：

   ```ts
   export const rinConfig = {
     enabled: true,
     modelUrl: '/live2d/rin/rin.model3.json',
     coreUrl: '/live2d/live2dcubismcore.min.js',
   };
   ```

资源通过 `assetUrl` 适配 `/Blog/` 与根目录部署；使用同源路径，模型内部引用也应同源。`modelUrl` 留空时保留预览。`enabled: false` 关闭组件。

模型可用时自动切换到透明 WebGL Canvas；帧率上限 30，像素比上限 2，鼠标驱动注视参数。点击从实际存在的 tap/touch/flick 动作组选择动作，没有对应组则尝试表情。预览的茶杯反馈与正式模型动作相互独立。暂停、后台和卸载都会停止或释放渲染资源。

模型或 Core 加载失败时保留预览，并在对话中说明失败。仅有参考图、贴图或 `.model3.json` 而缺少 `.moc3`，都不足以运行正式 Live2D。

## 素材说明

`packages/blog/src/components/mascot/art/rin-{head,body}.webp` 是本次由用户上传的志摩凛参考图裁切、去背景和拆层所得。角色及原图权利属于原权利人；素材不因仓库代码的 MIT 许可而变成 MIT 许可。仓库未引入游戏提取模型或第三方角色模型。

## 验证入口

```sh
npx vitest run packages/blog/src/components/mascot packages/blog/src/components/Layout.test.tsx
npm run typecheck
npm run build
```

相关测试覆盖：SSR、手机默认态、交互与导航、持久化失败、减少动效、后台暂停、模式切换、模型加载失败、异步取消与资源释放、Core 超时重试。

2026-10-23 验证：58 项相关测试通过（其中新增 17 项），前后端类型检查、ESLint 和 Pages 生产构建通过。全量 Vitest 1060/1062 通过，剩余两个既有上传测试在并行运行时超过默认 5 秒；单独以 15 秒上限复跑该文件的 4 项测试全部通过，实际单项均低于 5 秒。全量验证使用 Python 3.13；系统 Python 旧版不支持发布脚本的 `tarfile.extractall(filter=...)`。Go 测试通过，未配置测试数据库的集成用例按原规则跳过。

Chrome 实测覆盖 1440px 桌面、390px 手机与 320px 窄屏：聊天、喝茶、搜索跳转、收起唤醒、换边、刷新恢复、深色主题和减少动态效果，未出现页面 JavaScript 错误。修正了窄屏右侧对话越界；短屏幕对话可滚动。
