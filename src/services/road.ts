/**
 * Road 数据辅助：读取配置、解析文章元数据、格式化路径文案。
 */
import { roadConfig, type RoadGraphConfig, type RoadNodeConfig } from '@config/road.config';
import { getInitialPosts } from '@/services/posts';
import type { PostMetadata } from '@/types';

export const getRoadGraphs = (): RoadGraphConfig[] => roadConfig.graphs ?? [];

export const getRoadGraphById = (id: string): RoadGraphConfig | undefined =>
  getRoadGraphs().find((graph) => graph.id === id);

/** 解析节点关联文章；缺失 id 保留占位，便于配置期可见。 */
export const resolveNodePosts = (node: RoadNodeConfig): Array<{ id: string; post?: PostMetadata }> => {
  const posts = getInitialPosts();
  const byId = new Map(posts.map((post) => [post.id, post]));
  return (node.posts ?? []).map((postId) => ({
    id: postId,
    post: byId.get(postId),
  }));
};

export const formatPathLabels = (path: string[], nodes: RoadNodeConfig[]): string => {
  const titleById = new Map(nodes.map((node) => [node.id, node.title]));
  return path.map((id) => titleById.get(id) ?? id).join(' → ');
};
