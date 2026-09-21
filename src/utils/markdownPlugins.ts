/**
 * 全站共用的 Markdown remark 插件列表，避免文章 / 说说 / 积累页漏接扩展。
 */
import remarkGfm from 'remark-gfm';
import type { Pluggable } from 'unified';
import { remarkCodeMeta } from './remarkCodeMeta';
import { remarkTyporaMarks } from './remarkTyporaMarks';

/** 说说、积累页等轻量正文：GFM + Typora 下划线/高亮。 */
export const remarkCommonPlugins: Pluggable[] = [remarkGfm, remarkTyporaMarks];

/** 文章正文基线：在共用插件上再挂代码块 meta 透传。 */
export const remarkPostBasePlugins: Pluggable[] = [...remarkCommonPlugins, remarkCodeMeta];
