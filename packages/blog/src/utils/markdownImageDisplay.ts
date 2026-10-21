/**
 * 正文图片展示约定：Markdown 属性块 `{.small}{.inline}` 与渲染侧 class 解析。
 * 实现见 markdown-image-display-core.mjs（构建脚本与客户端共用）。
 */
export {
  imageFigureLayoutClass,
  isInlineMarkdownImageChild,
  paragraphIsInlineImageRow,
  parseImageAttrBody,
  resolveImageDisplayOptions,
  splitImageClassName,
} from './markdown-image-display-core.mjs';

export type ImageDisplaySize = 'default' | 'small' | 'medium';

export type ImageDisplayOptions = {
  size: ImageDisplaySize;
  inline: boolean;
  noDark: boolean;
  passthroughClasses: string[];
};
