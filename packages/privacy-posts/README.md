# Privacy Posts

这个 package 用于存放隐私页的私有文章源码。

- 目录：`packages/privacy-posts/content/`
- 这些文章不会进入主站 `posts.json`
- 它们的 `category` 和 `tags` 不会计入主站分类、标签和统计
- 构建期会单独生成 `generated/privacy-posts.json`

Markdown front matter 约定：

```md
---
id: sample-private-post
title: 私有文章标题
excerpt: 简短摘要
date: 2026-09-30
updatedAt: 2026-09-30
category: 隐私
tags:
  - private
---
```
