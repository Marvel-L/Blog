import { siteConfig } from '@config/site.config';
import type { PostMetadata } from '@/types';
import { createHiddenContentMatcher, normalizeHiddenContentConfig, isHiddenPost as isHiddenPostCore } from './hidden-content-core.mjs';

export interface HiddenContentConfig {
  categories?: string[];
  tags?: string[];
}

const getHiddenContentMatcher = () => createHiddenContentMatcher(siteConfig.hiddenContent);

export const getHiddenContentConfig = () => normalizeHiddenContentConfig(siteConfig.hiddenContent);

export const isHiddenCategory = (category: string) => getHiddenContentMatcher().hasHiddenCategory(category);

export const isHiddenTag = (tag: string) => getHiddenContentMatcher().hasHiddenTag(tag);

export const isHiddenPost = (post: Pick<PostMetadata, 'category' | 'tags'> & { needHidden?: boolean }) =>
  isHiddenPostCore(post, getHiddenContentMatcher());
