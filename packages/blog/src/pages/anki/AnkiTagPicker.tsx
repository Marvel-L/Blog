import { useEffect, useState } from 'react';
import { fetchDeckTags, type AnkiTag } from './anki-api';

export function AnkiTagPicker({
  deckId,
  value,
  onChange,
  disabled,
  onReady,
}: {
  deckId: string;
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  onReady: (ready: boolean) => void;
}) {
  const [tags, setTags] = useState<AnkiTag[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setTags(null);
    setError('');
    onReady(false);
    fetchDeckTags(deckId, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setTags(loaded);
        onReady(true);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '标签加载失败');
      });
    return () => controller.abort();
  }, [deckId, reload, onReady]);
  const selected = new Set(value.map((name) => name.toLowerCase()));
  const unavailable = tags
    ? value.filter((name) => !tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase()))
    : [];
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-xs text-zinc-500">卡片标签（点击多选）</legend>
      <p className="text-xs text-zinc-400">这里只选择已有标签；新增、改名或删除请到卡片库的“管理标签”。</p>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}{' '}
          <button type="button" onClick={() => setReload((n) => n + 1)}>
            重新加载标签
          </button>
        </p>
      ) : !tags ? (
        <p role="status" className="text-xs text-zinc-400">
          正在加载标签…
        </p>
      ) : tags.length === 0 ? (
        <p className="text-xs text-zinc-400">当前库没有标签，可以先保存无标签卡片，或返回卡片库管理标签。</p>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="选择已有标签">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="anki-tag"
              aria-pressed={selected.has(tag.name.toLowerCase())}
              onClick={() =>
                onChange(
                  selected.has(tag.name.toLowerCase())
                    ? value.filter((name) => name.toLowerCase() !== tag.name.toLowerCase())
                    : [...value, tag.name],
                )
              }
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
      {unavailable.length > 0 && (
        <div role="alert" className="text-xs text-red-600">
          以下标签不属于当前库或已删除，请移除后再保存。
          {unavailable.map((name) => (
            <button
              key={name}
              type="button"
              className="anki-tag ml-2"
              onClick={() => onChange(value.filter((item) => item !== name))}
            >
              移除 {name}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
