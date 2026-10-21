/**
 * remark 插件：解析图片后连续的属性块。
 * 例：`![alt](a.jpg){.small}{.inline}`、`![alt](a.jpg){.medium}{.no-dark}`
 *
 * 实现见 remark-image-attrs-core.mjs（构建脚本与客户端共用）。
 */
export { remarkImageAttrs } from './remark-image-attrs-core.mjs';
