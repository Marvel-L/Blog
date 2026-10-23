import { useMemo } from 'react';
import type { PostSearchResult } from '@/services/posts';
import { splitSearchHighlight } from '@/utils/searchHighlight';

type SearchMatch = NonNullable<PostSearchResult['searchMatch']>;

export const KeywordHighlight = ({ text, terms }: { text: string; terms: string[] }) => {
  const parts = useMemo(() => splitSearchHighlight(text, terms), [text, terms]);
  return (
    <>
      {parts.map((part, index) =>
        part.matched ? (
          <mark key={index} className="rounded-sm bg-amber-100 px-0.5 text-inherit dark:bg-amber-400/25">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
};

export const SearchMatchPreview = ({ match }: { match: SearchMatch }) => (
  <div className="mt-2 text-xs leading-6 text-zinc-600 dark:text-zinc-300">
    <span className="mr-1.5 font-semibold text-zinc-500 dark:text-zinc-400">{match.label}命中</span>
    <KeywordHighlight text={match.snippet} terms={match.terms} />
  </div>
);
