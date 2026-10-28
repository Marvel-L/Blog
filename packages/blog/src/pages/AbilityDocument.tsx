import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getAbilityData } from '@/services/abilities';
import { abilityDocumentRoute } from '@/abilities/ability-core.mjs';
import { MarkdownBody } from '@/components/markdown/MarkdownBody';
import { Seo, buildSiteSchemas } from '@/components/Seo';
import { NotFoundState } from '@/components/NotFoundState';
import '@/abilities/abilities.css';

export function AbilityDocumentPage() {
  const { dimension, filename } = useParams<{ dimension: string; filename: string }>();
  const [source, setSource] = useState(false);
  const document = getAbilityData().documents.find(
    (item) => item.dimension === dimension && item.filename === filename,
  );
  const content = useMemo(() => document?.content ?? '', [document]);
  if (!document)
    return (
      <NotFoundState
        title="文档未找到"
        description="这个维度尚未添加对应文档，或文件已经移除。"
        backLabel="返回关于页"
        backTo="/about"
      />
    );
  return (
    <div className="mx-auto max-w-4xl pb-16 pt-6 md:pt-10">
      <Seo
        title={`${document.dimension} · ${document.title}`}
        description={`${document.dimension}的能力记录：${document.title}`}
        url={abilityDocumentRoute(document.dimension, document.filename)}
        structuredData={buildSiteSchemas(document.title)}
      />
      <nav className="ability-reader-toolbar" aria-label="能力文档导航">
        <Link to="/about" className="editorial-button">
          <ArrowLeft size={16} />
          返回能力雷达
        </Link>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {document.dimension} / {document.filename}
        </span>
        <button
          type="button"
          className="editorial-button"
          aria-pressed={source}
          onClick={() => setSource((current) => !current)}
        >
          {source ? '返回正文' : '查看 Markdown 原文'}
        </button>
      </nav>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-4xl">
          {document.title}
        </h1>
      </header>
      {source ? (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words text-sm">{content}</pre>
      ) : (
        <MarkdownBody content={content} filePath={document.filePath} />
      )}
    </div>
  );
}
