import { describe, expect, it } from 'vitest';
import contentConfig from '@config/content.config.json';
import { isPostRank, POST_RANKS, RANK_SLUG } from './postRank';

describe('postRank', () => {
  it('分级白名单与 content.config.json 一致', () => {
    expect(contentConfig.postRanks).toEqual([...POST_RANKS]);
  });

  it('只接受六档分级', () => {
    for (const rank of POST_RANKS) {
      expect(isPostRank(rank)).toBe(true);
    }
    expect(isPostRank('传说')).toBe(false);
    expect(isPostRank('')).toBe(false);
    expect(isPostRank(undefined)).toBe(false);
    expect(isPostRank(1)).toBe(false);
  });

  it('每档都有独立样式 slug', () => {
    const slugs = POST_RANKS.map((rank) => RANK_SLUG[rank]);
    expect(new Set(slugs).size).toBe(POST_RANKS.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z]+$/);
    }
  });
});
