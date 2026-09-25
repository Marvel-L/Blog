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
