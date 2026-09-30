import { beforeEach, describe, expect, it } from 'vitest';
import type { RoadGraphConfig } from '@config/road.config';
import { readActiveRoadGraphId, readRoadViewport, resolveNodeArticles, writeActiveRoadGraphId, writeRoadViewport } from './road';
import type { PostMetadata } from '@/types';

const graphs: RoadGraphConfig[] = [
  { id: 'golang', title: 'Golang', nodes: [] },
  { id: '程序员', title: '程序员', nodes: [] },
];

const memoryStore = new Map<string, string>();

beforeEach(() => {
  memoryStore.clear();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memoryStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryStore.set(key, String(value));
      },
      removeItem: (key: string) => {
        memoryStore.delete(key);
      },
      clear: () => {
        memoryStore.clear();
      },
    },
  });
});

describe('road active graph', () => {
  it('没有记录时回退到第一张图', () => {
    expect(readActiveRoadGraphId(graphs)).toBe('golang');
  });

  it('写入后能读回上次选中的 Root', () => {
    writeActiveRoadGraphId('程序员');
    expect(readActiveRoadGraphId(graphs)).toBe('程序员');
  });

  it('配置里已删除的 Root 回退到第一张图', () => {
    writeActiveRoadGraphId('missing');
    expect(readActiveRoadGraphId(graphs)).toBe('golang');
  });
});

describe('road viewport persistence', () => {
  it('写入后能读回 Root 对应的画布位置与缩放', () => {
    writeRoadViewport('程序员', { scale: 1.2, offsetX: 180, offsetY: 96 });
    expect(readRoadViewport('程序员')).toEqual({ scale: 1.2, offsetX: 180, offsetY: 96 });
  });

  it('损坏的存储值回退为 null', () => {
    window.localStorage.setItem('d-blog-road-viewport-v1:程序员', '{"scale":"bad"}');
    expect(readRoadViewport('程序员')).toBeNull();
  });
});

const makePost = (partial: Pick<PostMetadata, 'id' | 'title' | 'date' | 'tags' | 'category'>): PostMetadata => ({
  excerpt: '',
  filePath: '',
  readTime: '1 分钟',
  ...partial,
});

const samplePosts: PostMetadata[] = [
  makePost({ id: 'go-job', title: '社招', date: '2026-01-02', tags: ['工作'], category: '求职心得' }),
  makePost({ id: 'beijing', title: '北京', date: '2026-01-03', tags: ['life', '工作'], category: '重要决策' }),
  makePost({ id: 'people', title: '同路人', date: '2026-01-01', tags: ['发展'], category: '其他' }),
];

describe('resolveNodeArticles', () => {
  it('按写出的标签和分类取并集，不额外扩散', () => {
    const resolved = resolveNodeArticles(
      { id: '算法', title: '算法', tags: ['工作'], category: ['求职心得'] },
      samplePosts,
    );
    expect(resolved.tags).toEqual(['工作']);
    expect(resolved.categories).toEqual(['求职心得']);
    expect(resolved.articles.map((article) => article.id)).toEqual(['beijing', 'go-job']);
  });

  it('标签和分类都省略时，不按节点名自动推断', () => {
    const resolved = resolveNodeArticles({ id: '工作', title: '工作' }, samplePosts);
    expect(resolved.tags).toEqual([]);
    expect(resolved.categories).toEqual([]);
    expect(resolved.articles).toEqual([]);
  });

  it('只配分类时，仅按显式分类匹配，不自动补标签', () => {
    const resolved = resolveNodeArticles({ id: '算法', title: '算法', category: ['求职心得'] }, samplePosts);
    expect(resolved.categories).toEqual(['求职心得']);
    expect(resolved.tags).toEqual([]);
    expect(resolved.articles.map((article) => article.id)).toEqual(['go-job']);
  });

  it('显式文章 id 会合并进来，找不到的 id 保留占位', () => {
    const resolved = resolveNodeArticles(
      { id: '算法', title: '算法', tags: [], category: [], posts: ['people', '', 'missing'] },
      samplePosts,
    );
    expect(resolved.articles.map((article) => article.id)).toEqual(['people', 'missing']);
    expect(resolved.articles[1]?.post).toBeUndefined();
  });
});
