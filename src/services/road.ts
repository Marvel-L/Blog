/**
 * Road 数据辅助：读取配置、解析文章元数据、格式化路径文案。
 */
import { roadConfig, type RoadGraphConfig, type RoadNodeConfig } from '@config/road.config';
import { getInitialPosts } from '@/services/posts';
import type { PostMetadata } from '@/types';
import { getDateTimestamp } from '@/utils/date';

const ROAD_ACTIVE_GRAPH_KEY = 'd-blog-road-active-graph-v1';

export const getRoadGraphs = (): RoadGraphConfig[] => roadConfig.graphs ?? [];

/** 读取上次选中的 Root；无效或存储不可用时回退到第一张图。 */
export const readActiveRoadGraphId = (graphs: RoadGraphConfig[]): string => {
  const fallback = graphs[0]?.id ?? '';
  if (typeof window === 'undefined') {
    return fallback;
  }
  try {
    const saved = window.localStorage.getItem(ROAD_ACTIVE_GRAPH_KEY);
    if (saved && graphs.some((graph) => graph.id === saved)) {
      return saved;
    }
  } catch {
    // 隐私模式等场景下 localStorage 可能抛错，回退到默认 Root。
  }
  return fallback;
};

/** 记住当前 Root，供刷新或离开页面后再进入时恢复。 */
export const writeActiveRoadGraphId = (graphId: string): void => {
  if (typeof window === 'undefined' || !graphId) {
    return;
  }
  try {
    window.localStorage.setItem(ROAD_ACTIVE_GRAPH_KEY, graphId);
  } catch {
    // 写入失败时仅影响下次恢复，不打断当前浏览。
  }
};

export const getRoadGraphById = (id: string): RoadGraphConfig | undefined =>
  getRoadGraphs().find((graph) => graph.id === id);

export interface RoadNodeArticle {
  id: string;
  post?: PostMetadata;
}

export interface RoadNodeArticles {
  articles: RoadNodeArticle[];
  /** 实际用于收录的标签；列表省略时为自动补上的相关标签。 */
  tags: string[];
  /** 实际用于收录的分类；列表省略时为自动补上的相关分类。 */
  categories: string[];
}

const associationKey = (value: string) => value.normalize('NFKC').trim().toLowerCase();

const asAssociationList = (value: string | string[] | undefined): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const items = typeof value === 'string' ? [value] : value;
  return items.map((item) => item.trim()).filter(Boolean);
};

const uniqueLabels = (values: string[]): string[] => {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const value of values) {
    const key = associationKey(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    labels.push(value.trim());
  }
  return labels;
};

const tagKeysOf = (post: PostMetadata) => post.tags.map(associationKey).filter(Boolean);

const matchesAssociation = (post: PostMetadata, tagKeys: Set<string>, categoryKeys: Set<string>) =>
  tagKeysOf(post).some((tag) => tagKeys.has(tag)) || categoryKeys.has(associationKey(post.category));

/**
 * 解析节点要展示的文章。
 * tags、category 命中任一即收录，并与 posts 里的文章 id 合并。
 * 省略 tags 或 category 时，先用已写出的另一项圈定相关文章（两项都省略时用节点 id 与 title），
 * 再把这些文章上的标签和分类全部补上，并收录对应内容。
 */
export const resolveNodeArticles = (
  node: RoadNodeConfig,
  sourcePosts: PostMetadata[] = getInitialPosts(),
): RoadNodeArticles => {
  const explicitIds = (node.posts ?? []).map((postId) => postId.trim()).filter(Boolean);
  const specifiedTags = asAssociationList(node.tags);
  const specifiedCategories = asAssociationList(node.category);

  const identityKeys = new Set([node.id, node.title].map(associationKey).filter(Boolean));
  const specifiedTagKeys = new Set((specifiedTags ?? []).map(associationKey));
  const specifiedCategoryKeys = new Set((specifiedCategories ?? []).map(associationKey));
  const bothOmitted = specifiedTags === undefined && specifiedCategories === undefined;

  const seed = sourcePosts.filter((post) => {
    if (specifiedTags && tagKeysOf(post).some((tag) => specifiedTagKeys.has(tag))) {
      return true;
    }
    if (specifiedCategories && specifiedCategoryKeys.has(associationKey(post.category))) {
      return true;
    }
    if (!bothOmitted) {
      return false;
    }
    return tagKeysOf(post).some((tag) => identityKeys.has(tag)) || identityKeys.has(associationKey(post.category));
  });

  const tags = specifiedTags ?? uniqueLabels(seed.flatMap((post) => post.tags));
  const categories = specifiedCategories ?? uniqueLabels(seed.map((post) => post.category));
  const tagKeys = new Set(tags.map(associationKey));
  const categoryKeys = new Set(categories.map(associationKey));

  const matched = sourcePosts
    .filter((post) => explicitIds.includes(post.id) || matchesAssociation(post, tagKeys, categoryKeys))
    .sort((left, right) => getDateTimestamp(right.date) - getDateTimestamp(left.date));
  const matchedIds = new Set(matched.map((post) => post.id));

  return {
    tags,
    categories,
    articles: [
      ...matched.map((post) => ({ id: post.id, post })),
      ...explicitIds.filter((postId) => !matchedIds.has(postId)).map((postId) => ({ id: postId })),
    ],
  };
};

/** 解析节点关联文章；缺失 id 保留占位，便于配置期可见。 */
export const resolveNodePosts = (node: RoadNodeConfig, sourcePosts?: PostMetadata[]): RoadNodeArticle[] =>
  resolveNodeArticles(node, sourcePosts).articles;

export const formatPathLabels = (path: string[], nodes: RoadNodeConfig[]): string => {
  const titleById = new Map(nodes.map((node) => [node.id, node.title]));
  return path.map((id) => titleById.get(id) ?? id).join(' → ');
};
