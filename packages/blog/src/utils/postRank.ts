/**
 * 文章分级：青铜 → 王者。
 * 白名单以 config/content.config.json 的 postRanks 为准，本文件的顺序与样式 slug 必须与之保持一致。
 * 未配置 rank 的文章不进入任何分级样式。
 */

export const POST_RANKS = ['青铜', '白银', '黄金', '钻石', '星耀', '王者'] as const;

export type PostRank = (typeof POST_RANKS)[number];

/** 样式类后缀。中文档位不进 class，避免选择器与编码问题。 */
export const RANK_SLUG: Record<PostRank, string> = {
  青铜: 'bronze',
  白银: 'silver',
  黄金: 'gold',
  钻石: 'diamond',
  星耀: 'star',
  王者: 'king',
};

export const isPostRank = (value: unknown): value is PostRank =>
  typeof value === 'string' && (POST_RANKS as readonly string[]).includes(value);
