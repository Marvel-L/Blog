import { useEffect, useState } from 'react';
import { listAnkiDrafts, type AnkiDraft } from './anki-drafts';
import type { NormalizedDashboard } from './anki-api';

export function AnkiDrafts({
  userId,
  dashboard,
  onResume,
  onBack,
}: {
  userId?: string;
  dashboard: NormalizedDashboard;
  onResume: (draft: AnkiDraft) => void;
  onBack: () => void;
}) {
  const [drafts, setDrafts] = useState<AnkiDraft[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () => {
      setDrafts([]);
      if (!userId) return;
      try {
        const result = listAnkiDrafts(userId);
        setDrafts(result.drafts);
        setError(result.damaged ? '部分草稿格式异常，已保留原记录，未覆盖或删除。' : '');
      } catch {
        setError('浏览器草稿存储不可用，无法读取本机草稿。');
      }
    };
    load();
    window.addEventListener('dblog-anki-drafts-change', load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener('dblog-anki-drafts-change', load);
      window.removeEventListener('storage', load);
    };
  }, [userId]);
  return (
    <section aria-label="卡片草稿">
      <button type="button" className="min-h-11 text-sm text-[#087ae9]" onClick={onBack}>
        返回卡片库
      </button>
      <h1 className="mt-3 text-2xl font-semibold">卡片草稿</h1>
      <p className="mt-3 text-sm text-zinc-500">
        保留未收到云端保存确认的内容。草稿只在当前浏览器、当前账号可见，不跨设备同步，不计入学习进度。
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {!userId ? (
        <p role="status" className="mt-6 text-sm">
          尚未确认账号，请先重试账号检查。
        </p>
      ) : drafts.length === 0 ? (
        <p className="py-8 text-sm text-zinc-500">暂无卡片草稿。</p>
      ) : (
        <ul className="mt-6 divide-y divide-zinc-100">
          {drafts.map((draft) => {
            const deck = dashboard.decks.find((item) => item.id === draft.deckId);
            const available = Boolean(deck);
            return (
              <li key={draft.id} className="flex flex-wrap items-center justify-between gap-3 py-5">
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-base font-medium">{draft.question || '未填写问题'}</h2>
                  <p className="mt-2 text-xs text-zinc-500">
                    {deck?.name ?? '原卡片库已不可用'} · {draft.editing ? '编辑草稿' : '新增草稿'} ·{' '}
                    {draft.status === 'failed' ? '保存失败' : '未确认保存'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!available}
                  className="min-h-11 shrink-0 text-sm text-[#087ae9] disabled:opacity-40"
                  onClick={() => onResume(draft)}
                >
                  继续编辑
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
