/**
 * Road 页：全画布沉浸式有向图；左侧 Root、底部 Paths 为浮层，无页面大标题。
 */
import { useLayoutEffect, useMemo, useState } from 'react';
import { siteConfig } from '@config/site.config';
import { Seo, buildSiteSchemas } from '@/components/Seo';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { formatPathLabels, getRoadGraphs, readActiveRoadGraphId, writeActiveRoadGraphId } from '@/services/road';
import { enumeratePaths, resolveGraphRootId } from '@/pages/road/layout';
import { RoadGraph } from '@/pages/road/RoadGraph';
import { NodeArticlesModal } from '@/pages/road/NodeArticlesModal';
import type { RoadNodeConfig } from '@config/road.config';

const pageDescription = '以有向图形式浏览学习路线：按 Root 切换识图，点击节点查看关联文章。';

export const Road = () => {
  const graphs = useMemo(() => getRoadGraphs(), []);
  const [activeGraphId, setActiveGraphId] = useState(graphs[0]?.id ?? '');
  const [selectedNode, setSelectedNode] = useState<RoadNodeConfig | null>(null);
  const [activePathIndex, setActivePathIndex] = useState<number | null>(null);

  useLayoutEffect(() => {
    const saved = readActiveRoadGraphId(graphs);
    if (saved) {
      setActiveGraphId(saved);
    }
  }, [graphs]);

  const activeGraph = graphs.find((graph) => graph.id === activeGraphId) ?? graphs[0];
  const nodes = activeGraph?.nodes ?? [];
  const rootId = activeGraph ? resolveGraphRootId(nodes, activeGraph.id) : '';

  const paths = useMemo(() => (rootId ? enumeratePaths(nodes, rootId) : []), [nodes, rootId]);
  const highlightedPath = activePathIndex !== null && paths[activePathIndex] ? paths[activePathIndex] : null;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `Road - ${siteConfig.title}`,
    description: pageDescription,
    url: absoluteSiteUrl('/road', siteConfig.url),
    inLanguage: 'zh-CN',
    isPartOf: {
      '@type': 'WebSite',
      name: siteConfig.title,
      url: absoluteSiteUrl('/', siteConfig.url),
    },
  };

  const handleSelectGraph = (graphId: string) => {
    setActiveGraphId(graphId);
    writeActiveRoadGraphId(graphId);
    setActivePathIndex(null);
    setSelectedNode(null);
  };

  return (
    <div className="road-page relative -mx-3 h-[calc(100dvh-6.5rem-env(safe-area-inset-top,0px)-var(--tab-bar-height,0px))] min-h-[28rem] w-[calc(100%+1.5rem)] overflow-hidden rounded-none border border-zinc-200/70 bg-[#f7f6f2] dark:border-zinc-800 dark:bg-zinc-950 sm:-mx-6 sm:w-[calc(100%+3rem)] md:h-[calc(100dvh-7.5rem-env(safe-area-inset-top,0px))]">
      <Seo
        title="Road"
        description={pageDescription}
        url="/road"
        structuredData={[...buildSiteSchemas(pageDescription), schema]}
      />

      {/* 无障碍标题：视觉隐藏，避免页面再出现「学习路线」大标题 */}
      <h1 className="sr-only">Road</h1>

      {graphs.length === 0 ? (
        <div className="flex h-full items-center justify-center px-6 text-sm text-zinc-500">
          编辑 config/road.config.json 后刷新
        </div>
      ) : (
        <>
          <aside className="absolute left-3 top-3 z-20 w-36 sm:left-4 sm:top-4">
            <div className="rounded-lg border border-zinc-200/80 bg-paper/95 p-2 shadow-sm backdrop-blur dark:border-zinc-700/80 dark:bg-zinc-900/95">
              <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Root</p>
              <ul className="space-y-0.5">
                {graphs.map((graph) => {
                  const active = graph.id === activeGraph?.id;
                  return (
                    <li key={graph.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectGraph(graph.id)}
                        className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                          active
                            ? 'bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900'
                            : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {graph.title}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>

          <div className="absolute inset-0 z-0">
            <RoadGraph
              nodes={nodes}
              rootId={rootId}
              selectedNodeId={selectedNode?.id}
              highlightedPath={highlightedPath}
              onSelectNode={setSelectedNode}
            />
          </div>

          <aside className="absolute bottom-3 left-3 right-3 z-20 sm:bottom-4 sm:left-auto sm:right-4 sm:w-72">
            <div className="rounded-lg border border-zinc-200/80 bg-paper/95 p-2 shadow-sm backdrop-blur dark:border-zinc-700/80 dark:bg-zinc-900/95">
              <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Paths</p>
              {paths.length === 0 ? (
                <p className="px-2 py-2 text-xs text-zinc-400">暂无路径</p>
              ) : (
                <ul className="max-h-36 space-y-0.5 overflow-y-auto sm:max-h-48">
                  {paths.map((path, index) => {
                    const active = activePathIndex === index;
                    return (
                      <li key={`${path.join('-')}-${index}`}>
                        <button
                          type="button"
                          onClick={() => setActivePathIndex(active ? null : index)}
                          className={`w-full rounded-md px-2 py-1.5 text-left text-[12px] leading-snug transition-colors ${
                            active
                              ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                              : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200'
                          }`}
                        >
                          {formatPathLabels(path, nodes)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        </>
      )}

      <NodeArticlesModal node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
};

export default Road;
