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

默认使用原样式，关闭开关即可恢复。选择保存在本机浏览器中，跨页面和刷新后继续生效；存储不可用时仍可在当前会话切换。字体随项目提供，WOFF2 文件仅在新排版启用时按需加载，首次开启可能需要等待字体下载。字体来源与许可见 `src/assets/resume-fonts/NOTICE.md`。
