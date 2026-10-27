import { useEffect, useRef, useState } from 'react';
import { newMutationId, submitPractice, type AnkiCard, type AnkiRating, type AnkiReviewRequest } from './anki-api';

/** 仅主动揭示后挂载；失败重试复用 payload，成功才刷新计数与排期，卸载取消。 */
export function AnkiPracticeActions({ card, onRecorded }: { card: AnkiCard; onRecorded: (card: AnkiCard) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const retry = useRef<(AnkiReviewRequest & { rating: AnkiRating }) | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  const send = async (payload: AnkiReviewRequest & { rating: AnkiRating }) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    retry.current = payload;
    try {
      const updated = await submitPractice(payload, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      retry.current = null;
      onRecorded(updated);
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '练习记录失败，请重试。');
    } finally {
      if (request.current === controller) request.current = null;
      if (mounted.current && !controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <div className="mt-5 border-t border-zinc-100 pt-4">
      <p className="mb-3 text-xs text-zinc-500">按本次回忆情况自评；计入练习并更新下次复习安排。</p>
      <div role="group" aria-label="评价这张卡片的回忆" className="flex flex-wrap gap-3">
        {(
          [
            { rating: 'correct', label: '熟悉' },
            { rating: 'hard', label: '模糊' },
            { rating: 'wrong', label: '忘记' },
          ] as const
        ).map(({ rating, label }) => (
          <button
            key={rating}
            type="button"
            className="anki-rating-button"
            disabled={busy || Boolean(error)}
            onClick={() => void send({ cardId: card.id, version: card.version, mutationId: newMutationId(), rating })}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}{' '}
          <button
            type="button"
            disabled={busy}
            className="underline"
            onClick={() => retry.current && void send(retry.current)}
          >
            重试记录
          </button>
        </p>
      )}
      {busy && (
        <p role="status" className="mt-2 text-xs text-zinc-500">
          正在保存练习结果…
        </p>
      )}
    </div>
  );
}
