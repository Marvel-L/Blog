# Book 内容维护

每个一级子目录是一份独立的 Book package。章节直接写 Markdown，构建时递归读取；不用修改 JavaScript，也不用把每个新章节登记到配置中。

```text
books/
  golang/
    config.json          # 可选，或 config.yaml / config.yml，三者只保留一个
    基础/
      language-basics.md
    核心语义/
      pointers.md
    并发/
      取消/
        context.md
```

## 创建一本书和第一章

创建 `books/my-book/intro.md`：

```markdown
# 我的第一章

这里写正文。
```

运行 `npm run dev` 即可在书架看到 `my-book`，书籍路径为 `/book/my-book`，章节路径为 `/book/my-book/chapter/intro`。开发服务器会自动读取新建、修改和删除的章节或配置；发布时原有 Pages/cloud 构建会生成对应静态页面与 sitemap。

无配置时，书名和 Book ID 使用目录名；章节标题取正文的一级标题，没有一级标题则取文件名。章节 ID 使用相对路径去掉 `.md`，子目录分隔符替换为 `--`，例如 `并发/取消/context.md` 对应 `并发--取消--context`。默认按路径的固定字符顺序排列，不依赖系统 locale。

## 组织子 package

同一个子 package 的章节放在同一个子目录。目录名直接成为导航名称，每层子目录对应一层可折叠目录；根目录下的 Markdown 直接显示为章节。比如上面的结构会显示「并发 → 取消 → Context」。

章节 front matter 和配置都不接受 `group` 字段。章节所属目录由文件位置确定，移动文件即可调整目录层级；移动时保留显式 `id`，章节 URL 就保持不变。

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
  - file: 并发/取消/context.md
    title: Context 与取消
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
| `markdownFirst` | 每层先展示直属 Markdown，再展示子 package；未配置目录排序时默认 `false`，配置 `directoryOrder` 时默认 `true` |
| `directoryOrder` | 按父目录分别指定直属子 package 的顺序；默认不指定，格式见下文 |

未启用目录级排序时，`chapters` 列出的文件按数组顺序优先展示；未列出的 Markdown 自动追加，并按章节 `order`、相对路径排序。因此添加普通新章节无需修改配置。对象还可覆盖章节的 `id`、`title`、`order`、`draft`、`relatedPostIds`，优先级高于 Markdown front matter。配置引用的文件必须存在，删除这类章节时应一并删除配置中的引用。

导航保持真实目录结构：子目录按章节首次出现的顺序排列，同一个子目录的章节集中展示。「上一章 / 下一章」使用目录树的阅读顺序，跨目录交错的配置不会把同一子目录拆成多个分组。

## 根目录 Markdown 优先与子 package 排序

不需要为了让总览出现在子 package 前面，给所有 Markdown 协调一套全局 `order`。在书籍的 `config.json` / `config.yaml` / `config.yml` 中配置一次即可，例如合同项目：

```json
{
  "markdownFirst": true,
  "directoryOrder": {
    ".": ["业务", "技术"],
    "技术": ["接口和鉴权", "定时任务", "MQ"]
  }
}
```

这些字段和已有的 `id`、`name`、`order` 等书籍配置放在同一个对象中。

- `markdownFirst: true` 对所有层级生效：书根目录、`技术/`、`技术/接口和鉴权/` 等目录，都先显示该目录直属的 `.md`，再显示其子目录。不仅限于书的最外层。
- `directoryOrder` 的键是相对于书根的父目录路径；`.` 表示书根，嵌套目录使用完整相对路径，例如 `技术/接口和鉴权`。值只写该父目录的**直属子目录名**，不写 Markdown 文件、不带 `/`。
- 数组里的子 package 按指定顺序显示；没列出的子 package 自动追加，保留由既有章节排序决定的相对顺序。无需列出所有目录，每个父目录也可以独立配置。
- 新章节自动收录。同一目录内的 Markdown 仍按 `chapters` 中的先后、章节 `order`、相对路径排序；`order` 只需用于调整同目录文章之间的顺序，不再用来把总览压到子 package 前面，也不再决定已配置子 package 之间的顺序。
- 开启后，目录级规则优先于跨目录的 `chapters` 顺序；即使把 `技术/MQ/mq.md` 列在 `技术/readme.md` 前，总览仍优先。目录、阅读顺序和生成快照保持一致，章节 ID、正文和 URL 不变。
- 只配置 `markdownFirst: true` 也可，不指定子 package 顺序。只配置 `directoryOrder` 时默认开启 Markdown 优先；明确写 `markdownFirst: false` 则保留 Markdown 与目录的原有穿插位置，仅重新排列子目录位置。
- 两个字段都不配置时完全保留旧行为。路径不存在、父路径不规范、重复子目录、非法字段类型会阻断构建，不会静默忽略。空目录或只有草稿的目录可配置，但不会显示空导航。

上例中，`技术/` 下的所有直属 Markdown 在前，随后依次展开「接口和鉴权」「定时任务」「MQ」；`技术/readme.md` 不需要靠比所有后代文章更小的 `order` 来排在前面。

## 配置章节

Markdown front matter 可选：

```markdown
---
id: context
title: Context 与取消
order: 20
relatedPostIds:
  - go-pointer-pass-by-value-0x01
---

# Context 与取消

这里写章节正文。
```

`draft: true` 的章节不发布，未完成正文不会阻断构建。未设置 `draft` 的章节正文不能为空。`relatedPostIds` 仅关联公开 Blog 文章；未知 ID、隐私文章和草稿不会出现在推荐区，也不影响 Book 正文。

调整文件名或移动目录时，显式保留 `id` 即可保持原 URL。Book ID 和章节 ID 不允许空白、路径分隔符及 URL 不安全字符；重复 ID、重复章节引用、配置格式错误、未知配置字段和非法字段类型会报出具体文件路径并阻止构建。以 `.` 开头的文件或目录不收录，不支持符号链接。

Book Markdown 沿用现有的文字、列表、表格和代码高亮能力。公式与 Mermaid 的完整资源接入仍属于后续功能。

## 正文图片

图片可以和章节放在同一目录，使用相对路径引用：

```markdown
![业务流程](img.png){.small}
```

支持 `.small` / `.medium` 居中缩小、`.inline` 同行并排，以及 `.no-dark` 暗色模式保留亮度；多个属性块依次紧挨。点击图片可打开已有的缩放预览。

相对图片路径按 Markdown 文件位置解析，开发服务器直接读取 `books/` 下的图片；构建时复制到 `public/books-img/`，保留目录结构并自动适配 `/Blog/` 等部署子路径。无需修改章节链接或手动复制图片。

## 生成链路

`scripts/lib/book-content.mjs` → `generated/books.json` → 前端/SSR、SSG 路由、sitemap 与 Blog 内部链接校验。

`generated/books.json` 是自动生成的产物，不应手动编辑。可单独运行 `npm run gen:data` 校验本地配置；开发中错误会显示在终端和浏览器错误浮层，修正后继续自动更新。
