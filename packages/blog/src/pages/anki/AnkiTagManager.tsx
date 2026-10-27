import { useEffect, useRef, useState } from 'react';
import { createDeckTag, deleteDeckTag, fetchDeckTags, renameDeckTag, type AnkiTag } from './anki-api';

/** 独立标签目录管理；卡片编辑不能从此输入隐式建标签。 */
export function AnkiTagManager({ deckId, onChanged }: { deckId: string; onChanged: () => void }) {
  const [tags, setTags] = useState<AnkiTag[] | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<AnkiTag | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const write = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      write.current?.abort();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetchDeckTags(deckId, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setTags(loaded);
          setError('');
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '标签加载失败');
      });
    return () => controller.abort();
  }, [deckId, reload]);

  const mutate = async (remove?: AnkiTag) => {
    if (write.current) return;
    const trimmed = name.trim();
    if (!remove && (!trimmed || [...trimmed].length > 30 || /[,，\n\r\t]/.test(trimmed))) {
      setError('标签名需为 1–30 个字，不含逗号或换行。');
      return;
    }
    if (!remove && tags?.some((tag) => tag.id !== editing?.id && tag.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('标签已存在（忽略大小写），请直接选择已有标签。');
      return;
    }
    const controller = new AbortController();
    write.current = controller;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (remove) await deleteDeckTag(deckId, remove.id, controller.signal);
      else if (editing) await renameDeckTag(deckId, editing.id, trimmed, controller.signal);
      else await createDeckTag(deckId, trimmed, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setName('');
      setEditing(null);
      setMessage(remove ? '标签已删除，卡片及复习进度保留。' : '标签已保存。');
      setReload((n) => n + 1);
      onChanged();
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '标签操作失败');
    } finally {
      if (write.current === controller) write.current = null;
      if (mounted.current && !controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <section aria-label="标签管理" className="mt-4 space-y-4">
      <p className="text-sm text-zinc-500">
        标签属于当前卡片库。新增或编辑卡片时只选择这里已有的标签；删除只解除关联，不删除卡片。
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void mutate();
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="text-xs text-zinc-500">{editing ? '修改标签名称' : '新增标签名称'}</span>
          <input
            aria-label="标签名称"
            className="anki-input mt-1"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={30}
            disabled={busy}
            placeholder="例如：GC"
          />
        </label>
        <button type="submit" disabled={busy || !tags} className="anki-rating-button">
          {editing ? '保存标签名称' : '新增标签'}
        </button>
        {editing && (
          <button
            type="button"
            disabled={busy}
            className="anki-rating-button"
            onClick={() => {
              setEditing(null);
              setName('');
            }}
          >
            取消改名
          </button>
        )}
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}{' '}
          <button type="button" disabled={busy} onClick={() => setReload((n) => n + 1)}>
            重新加载
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-sky-700">
          {message}
        </p>
      )}
      {!tags ? (
        <p className="text-sm text-zinc-400">正在加载标签…</p>
      ) : tags.length === 0 ? (
        <p className="text-sm text-zinc-400">还没有标签，先创建一个。</p>
      ) : (
        <ul>
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center justify-between gap-3 border-b border-zinc-100 py-3">
              <span className="min-w-0 break-words">
                {tag.name}
                <small className="ml-3 text-zinc-400">{tag.cardCount} 张卡片</small>
              </span>
              <span className="flex shrink-0 gap-3">
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`重命名标签 ${tag.name}`}
                  onClick={() => {
                    setEditing(tag);
                    setName(tag.name);
                    setError('');
                  }}
                >
                  重命名
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`删除标签 ${tag.name}`}
                  onClick={() => void mutate(tag)}
                >
                  删除
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
