import { normalizeTags } from './anki-tags';

export function AnkiCardTags({ tags, onSelect }: { tags?: string[]; onSelect?: (tag: string) => void }) {
  const names = normalizeTags(tags);
  if (!names.length) return null;
  return (
    <div className="anki-tags" role="group" aria-label="卡片标签">
      {names.map((name) =>
        onSelect ? (
          <button
            key={name.toLowerCase()}
            type="button"
            className="anki-tag"
            onClick={() => onSelect(name)}
            aria-label={`筛选标签 ${name}`}
          >
            {name}
          </button>
        ) : (
          <span key={name.toLowerCase()} className="anki-tag">
            {name}
          </span>
        ),
      )}
    </div>
  );
}
