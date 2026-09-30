/**
 * 学习路线（Road）配置。
 *
 * 数据源为同目录 road.config.json —— 本地编辑即可在 /road 展示有向图。
 * graphs：左侧可切换的 Root 视图（id 只需在视图间唯一，不必等于根节点 id）；
 * nodes：图中节点；parents：入边来源，省略表示该图的根节点；
 * tags / category：节点收录的文章标签与分类，命中任一即展示；
 * 未显式填写 tags / category / posts 时，该节点不收录任何文章。
 * posts：额外指定的文章 id（对应 posts/ 下任意嵌套 .md 的 front matter id）。
 */
import roadConfigJson from './road.config.json';

export interface RoadNodeConfig {
  id: string;
  title: string;
  /** 父节点 id 列表；空/省略表示该图的根节点。 */
  parents?: string[];
  /** 命中任一标签的文章。 */
  tags?: string[];
  /** 命中任一分类的文章，可写单个分类或列表。 */
  category?: string | string[];
  /** 额外关联的文章 id（posts front matter 的 id）。 */
  posts?: string[];
}

export interface RoadGraphConfig {
  id: string;
  title: string;
  nodes: RoadNodeConfig[];
}

export interface RoadConfig {
  /** 给编辑配置的人看的说明，页面不展示。 */
  note?: string;
  graphs: RoadGraphConfig[];
}

export const roadConfig = roadConfigJson as RoadConfig;
