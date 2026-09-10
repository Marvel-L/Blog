# OG 分享卡片（generate-og-card）— AI 修改规则

## 功能概述

构建期生成社交分享卡片（1200×630 PNG）：有 `public/logo.png` 时为纸感渐变 + 居中 logo；无 logo 时仍生成纯渐变卡片，供默认 og:image / twitter:image 与 SEO 审计使用。

## 关键文件

- `scripts/generate-og-card.mjs`（sharp 处理）
- `config/site.config.json` 的 `seoImage`（通常指向 `/og-card.png`）

## 修改规则（必须遵守）

1. **必须产出卡片**：无论 logo 是否存在，都必须写出 `public/og-card.png`（无 logo 时用纯渐变）；合成失败须抛错阻断构建。
2. **logo 尺寸夹紧**：竖图 logo 等比放大后高度超过卡片（630px）时必须 clamp（composite 负坐标行为未定义）。
3. **纯构建期**：不引入运行时依赖；复用既有 sharp 依赖，不新增重依赖。
4. **设计语义**：有 logo 时为「渐变背景 + logo」；无 logo 时为纯渐变、不叠加文字（避免引入 CJK 字体）；改动视觉需用户确认。

## 常见陷阱

- 分享平台推荐 1200×630（1.91:1），改动尺寸需评估各平台裁切；
- 输出路径 `public/og-card.png` 是站点级共享图；`seoImage` 为空会导致 SSG 页缺少 og:image，SEO 审计失败阻断部署。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
