# Book 内容维护

每个一级子目录是一份独立的 Book package。章节直接写 Markdown，构建时递归读取；不用修改 JavaScript，也不用把每个新章节登记到配置中。

```text
books/
  golang/
    config.json          # 可选，或 config.yaml / config.yml，三者只保留一个
    language-basics.md
    pointers.md
    concurrency/
      context.md
```

## 创建一本书和第一章

创建 `books/my-book/intro.md`：

```markdown
# 我的第一章

这里写正文。
```

运行 `npm run dev` 即可在书架看到 `my-book`，书籍路径为 `/book/my-book`，章节路径为 `/book/my-book/chapter/intro`。开发服务器会自动读取新建、修改和删除的章节或配置；发布时原有 Pages/cloud 构建会生成对应静态页面与 sitemap。

无配置时，书名和 Book ID 使用目录名；章节标题取正文的一级标题，没有一级标题则取文件名。章节 ID 使用相对路径去掉 `.md`，子目录分隔符替换为 `--`，例如 `concurrency/context.md` 对应 `concurrency--context`；默认分组取子目录路径。默认按路径的固定字符顺序排列，不依赖系统 locale。

## 配置书籍展示

以 `config.yaml` 为例（JSON 支持相同字段）：

```yaml
id: my-book
name: 我的手册
subtitle: 记录可以连续阅读的知识
edition: MY FIELD NOTES
accent: "#365348"
order: 10
chapters:
  - intro.md
  - file: concurrency/context.md
    title: Context 与取消
    group: 并发
```

所有字段都可省略：

| 字段 | 用途与默认值 |
| --- | --- |
| `id` | 稳定的 Book URL ID；默认目录名 |
| `name` | 书名；默认目录名 |
| `subtitle` | 简介；默认空字符串 |
| `edition` | 封面英文标识；默认 `KNOWLEDGE PACKAGE` |
| `accent` | 封面主题色，格式 `#RRGGBB`；默认 `#365348` |
| `order` | 书架排序数字，越小越靠前；默认 `0`，同值按 ID 排序 |
| `draft` | `true` 时整本书不发布；默认 `false` |
| `chapters` | 可选的优先阅读顺序；支持相对文件路径或带 `file` 的配置对象 |

`chapters` 列出的文件按数组顺序优先展示；未列出的 Markdown 自动追加，并按章节 `order`、相对路径排序。因此添加普通新章节无需修改配置。对象还可覆盖章节的 `id`、`title`、`group`、`order`、`draft`、`relatedPostIds`，优先级高于 Markdown front matter。配置引用的文件必须存在，删除这类章节时应一并删除配置中的引用。

## 配置章节

Markdown front matter 可选：

```markdown
---
id: context
title: Context 与取消
group: 并发
order: 20
relatedPostIds:
  - go-pointer-pass-by-value-0x01
---

# Context 与取消

这里写章节正文。
```

`draft: true` 的章节不发布，未完成正文不会阻断构建。未设置 `draft` 的章节正文不能为空。`relatedPostIds` 仅关联公开 Blog 文章；未知 ID、隐私文章和草稿不会出现在推荐区，也不影响 Book 正文。

调整文件名或移动目录时，显式保留 `id` 即可保持原 URL。Book ID 和章节 ID 不允许空白、路径分隔符及 URL 不安全字符；重复 ID、重复章节引用、配置格式错误、未知配置字段和非法字段类型会报出具体文件路径并阻止构建。以 `.` 开头的文件或目录不收录，不支持符号链接。

Book Markdown 沿用现有的文字、列表、表格和代码高亮能力。正文图片、公式与 Mermaid 的完整资源接入仍属于后续功能。

## 生成链路

`scripts/lib/book-content.mjs` → `generated/books.json` → 前端/SSR、SSG 路由、sitemap 与 Blog 内部链接校验。

`generated/books.json` 是自动生成的产物，不应手动编辑。可单独运行 `npm run gen:data` 校验本地配置；开发中错误会显示在终端和浏览器错误浮层，修正后继续自动更新。
