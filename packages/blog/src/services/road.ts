/**
 * Road 数据辅助：读取配置、解析文章元数据、持久化浏览状态。
 */
import { roadConfig, type RoadGraphConfig, type RoadNodeConfig } from '@config/road.config';
import { getInitialPosts } from '@/services/posts';
import type { PostMetadata } from '@/types';
import { getDateTimestamp } from '@/utils/date';

const ROAD_ACTIVE_GRAPH_KEY = 'd-blog-road-active-graph-v1';
const ROAD_VIEWPORT_KEY_PREFIX = 'd-blog-road-viewport-v1:';

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

export interface RoadViewportState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const getRoadViewportKey = (graphId: string) => `${ROAD_VIEWPORT_KEY_PREFIX}${graphId}`;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** 读取某个 Root 的画布位置与缩放；存储缺失/损坏时返回 null。 */
export const readRoadViewport = (graphId: string): RoadViewportState | null => {
  if (typeof window === 'undefined' || !graphId) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getRoadViewportKey(graphId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<RoadViewportState>;
    if (!isFiniteNumber(parsed.scale) || !isFiniteNumber(parsed.offsetX) || !isFiniteNumber(parsed.offsetY)) {
      return null;
    }
    return {
      scale: parsed.scale,
      offsetX: parsed.offsetX,
      offsetY: parsed.offsetY,
    };
  } catch {
    return null;
  }
};

/** 记住某个 Root 的画布位置与缩放，刷新后恢复当前阅读位置。 */
export const writeRoadViewport = (graphId: string, viewport: RoadViewportState): void => {
  if (typeof window === 'undefined' || !graphId) {
    return;
  }

  try {
    window.localStorage.setItem(getRoadViewportKey(graphId), JSON.stringify(viewport));
  } catch {
    // 写入失败时仅影响下次恢复，不打断当前浏览。
  }
};

export interface RoadNodeArticle {
  id: string;
  post?: PostMetadata;
}

export interface RoadNodeArticles {
  articles: RoadNodeArticle[];
  /** 实际用于收录的标签；仅来自节点显式配置。 */
  tags: string[];
  /** 实际用于收录的分类；仅来自节点显式配置。 */
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
 * 仅使用节点显式写出的 tags、category、posts 进行关联，命中任一即收录。
 */
export const resolveNodeArticles = (
  node: RoadNodeConfig,
  sourcePosts: PostMetadata[] = getInitialPosts(),
): RoadNodeArticles => {
  const explicitIds = (node.posts ?? []).map((postId) => postId.trim()).filter(Boolean);
  const tags = uniqueLabels(asAssociationList(node.tags) ?? []);
  const categories = uniqueLabels(asAssociationList(node.category) ?? []);
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
