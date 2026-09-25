/**
 * 正文图片展示约定（构建脚本与客户端共用）。
 *
 * 尺寸：small / medium（默认通栏）
 * 布局：inline（同行并排；未写尺寸时默认按 small）
 * 行为：no-dark（暗色不降亮；亦兼容 title="no-dark"）
 * 特效预留：fx-* class 透传到 figure
 *
 * 宽度样式写在 index.css（[data-size]/[data-inline]），不要依赖
 * 本文件里的任意 Tailwind class——tailwind content 不扫描 .mjs。
 */

const SIZE_CLASSES = new Set(['small', 'medium']);
const LAYOUT_CLASSES = new Set(['inline']);
const BEHAVIOR_CLASSES = new Set(['no-dark', 'no-dark-adapt']);

/** 解析单个 `{}` 内正文，如 `.small` / `no-dark`。多修饰用多个 `{}` 拼接。 */
export const parseImageAttrBody = (body) => {
  const classNames = [];
  const tokens = body.trim().split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    if (token.startsWith('.') && token.length > 1) {
      classNames.push(token.slice(1));
      continue;
    }
    if (token === 'no-dark' || token === 'no-dark-adapt') {
      classNames.push(token === 'no-dark-adapt' ? 'no-dark' : token);
    }
  }

  return { classNames };
};

/** react-markdown / hast 可能给 string 或 string[]。 */
export const splitImageClassName = (className) => {
  if (!className) return [];
  if (Array.isArray(className)) {
    return className.flatMap((item) => splitImageClassName(item));
  }
  return String(className)
    .split(/[\s,]+/)
    .filter(Boolean);
};

/**
 * 判断段落子节点是否为「inline 图」。
 * 注意：p 渲染时子节点仍是 img（className 含 inline），尚未变成带 data-inline 的 figure。
 */
export const isInlineMarkdownImageChild = (props) => {
  if (!props || typeof props !== 'object') return false;
  if (props['data-role'] === 'markdown-figure' && (props['data-inline'] === true || props['data-inline'] === '')) {
    return true;
  }
  return splitImageClassName(props.className).includes('inline');
};

const imageHasInlineClass = (image) => {
  const className = image?.data?.hProperties?.className;
  return splitImageClassName(className).includes('inline');
};

/** 从 img className + 可选 title 解析展示选项。 */
export const resolveImageDisplayOptions = (className, title) => {
  const classes = splitImageClassName(className);
  let size = 'default';
  let inline = false;
  let noDark = title === 'no-dark';
  const passthroughClasses = [];

  for (const name of classes) {
    if (SIZE_CLASSES.has(name) && size === 'default') {
      size = name;
      continue;
    }
    if (LAYOUT_CLASSES.has(name)) {
      inline = true;
      continue;
    }
    if (BEHAVIOR_CLASSES.has(name)) {
      noDark = true;
      continue;
    }
    passthroughClasses.push(name);
  }

  // inline 未显式写尺寸时默认 small（并排缩略图），仍可用 {.inline}{.medium} 覆盖。
  if (inline && size === 'default') {
    size = 'small';
  }

  return { size, inline, noDark, passthroughClasses };
};

/**
 * figure 额外 class：只放 spacing / 语义标记。
 * 宽度一律由 CSS 按 data-size / data-inline 控制（见 index.css）。
 */
export const imageFigureLayoutClass = (options) => {
  const { inline } = options;
  if (inline) {
    return 'md-img-figure md-img-figure--inline';
  }
  return 'md-img-figure';
};

/** 段落是否「只含 inline 图」（可夹空白文本）。 */
export const paragraphIsInlineImageRow = (children) => {
  if (!Array.isArray(children) || children.length === 0) return false;

  let imageCount = 0;
  for (const child of children) {
    if (child.type === 'text' && !String(child.value || '').trim()) continue;
    if (child.type === 'image' && imageHasInlineClass(child)) {
      imageCount += 1;
      continue;
    }
    return false;
  }
  return imageCount > 0;
};
