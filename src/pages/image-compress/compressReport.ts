/**
 * 从构建期报告整理「文章压缩收益」列表展示数据。
 */

export type ImageCompressReportItem = {
  article: string;
  articleId?: string;
  image: string;
  path: string;
  originalBytes: number;
  bytes: number;
  savedBytes: number;
};

export type ImageCompressReport = {
  profileId?: string;
  items: ImageCompressReportItem[];
};

/** 按节省字节降序；过滤无效项。 */
export const sortCompressReportItems = (items: ImageCompressReportItem[]): ImageCompressReportItem[] =>
  [...items]
    .filter((item) => item.savedBytes > 0 && item.originalBytes > item.bytes)
    .sort((a, b) => b.savedBytes - a.savedBytes || a.path.localeCompare(b.path));

/**
 * 截断列表：优先展示收益最大的条目，超出 maxVisible 时附带省略提示。
 * 返回 visible + 是否还有更多 + 剩余条数。
 */
export const truncateCompressReportItems = <T>(items: T[], maxVisible: number) => {
  const limit = Math.max(0, maxVisible);
  if (items.length <= limit) {
    return { visible: items, omitted: 0, hasMore: false };
  }
  return {
    visible: items.slice(0, limit),
    omitted: items.length - limit,
    hasMore: true,
  };
};
