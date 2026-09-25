# 图片压缩工具（ImageCompress）— AI 修改规则

## 功能概述

浏览器本地压缩图片并下载；展示构建期已压缩的文章配图收益列表（文章 — 图片，原大小 → 目标大小，按节省体积降序，超出条数用「…」省略）。

## 关键文件

- `src/pages/ImageCompress.tsx`
- `src/pages/image-compress/compressImage.ts` / `compressReport.ts`
- `src/services/imageCompressReport.ts`（消费 `generated/image-compress-report.json`）
- `scripts/lib/compress-content-images-core.mjs` / `scripts/compress-content-images.mjs`
- 导航：`Layout.tsx`「更多 → 图片压缩」；路由 `/image-compress`

## 修改规则（必须遵守）

1. **本地处理**：上传压缩仅在浏览器完成，禁止上传到远端。
2. **加载健壮性**：图片加载须有超时与卸载/代际守卫（与水印工具一致）。
3. **清单字段**：`originalBytes`（压缩前）与 `bytes`（当前）必须写入 manifest；报告按 `savedBytes` 降序。
4. **列表展示**：默认最多展示固定条数（如 8），超出显示「… 及其他 N 项」，避免撑破首屏。
5. **SSG/路由**：新增或改名路径时同步 `App.tsx`、`preload.ts`、`Layout.tsx`、`ssg.mjs`、`post-content-validator` 静态路由、`siteUrl` markers。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
