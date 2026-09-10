/**
 * 学习路线（Road）配置。
 *
 * 数据源为同目录 road.config.json —— 本地编辑即可在 /road 展示有向图。
 * graphs：左侧可切换的 Root 视图；nodes：图中节点；parents：入边来源；
 * posts：节点关联的文章 id（对应 posts/*.md 的 front matter id）。
 */
import roadConfigJson from './road.config.json';

export interface RoadNodeConfig {
  id: string;
  title: string;
  description?: string;
  /** 父节点 id 列表；空/省略表示该图的根节点。 */
  parents?: string[];
  /** 关联文章 id（posts front matter 的 id）。 */
  posts?: string[];
}

export interface RoadGraphConfig {
  id: string;
  title: string;
  description?: string;
  nodes: RoadNodeConfig[];
}

export interface RoadConfig {
  graphs: RoadGraphConfig[];
}

export const roadConfig = roadConfigJson as RoadConfig;
