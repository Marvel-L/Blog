/**
 * 到期练习会话。
 *
 * 行为约束：
 * - 初始只显示 Q；答案默认不在可访问性树中渲染，自评控件仅在揭示后可用；
 * - 切换卡片自动隐藏答案；
 * - 一次评价 = POST /anki/reviews，携带 card version 与一次性 mutationId：
 *   双击在提交期间被禁用；失败后「重试」复用同一 mutationId，服务端幂等去重，不虚增完成量；
 * - 失败留在当前卡，不推进下一张；
 * - 间隔只展示服务端预览/响应，客户端不推算排期。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasOpenOverlay } from '@/hooks/useModalOverlay';
import {
  fetchDeckQueue,
  newMutationId,
  isUnauthorized,
  readReviewPreview,
  submitReview,
  type AnkiCard,
  type AnkiDeckSummary,
  type AnkiReviewRequest,
  type AnkiRating,
} from './anki-api';

interface AnkiReviewProps {
  decks: AnkiDeckSummary[];
  deckId: string | null;
  onExit: () => void;
  onSessionSettled: () => void;
}

type ReviewPhase = 'loading' | 'active' | 'done' | 'error';

const RATING_LABELS: Array<{ rating: AnkiRating; label: string; hint: string }> = [
  { rating: 'wrong', label: '错误', hint: '没有想起来' },
  { rating: 'hard', label: '模糊', hint: '记得不完整' },
  { rating: 'correct', label: '正确', hint: '能够完整回忆' },
];

const formatNext = (card: AnkiCard): string => (card.intervalDays >= 1 ? `${card.intervalDays} 天后` : '稍后再练');

export function AnkiReview({ decks, deckId, onExit, onSessionSettled }: AnkiReviewProps) {
  const [phase, setPhase] = useState<ReviewPhase>('loading');
  const [error, setError] = useState('');
  const [cards, setCards] = useState<AnkiCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showIntervals, setShowIntervals] = useState(false);
  const [customDays, setCustomDays] = useState('7');
  const [queuePreviews, setQueuePreviews] = useState<unknown>(null);
  const [lastRecord, setLastRecord] = useState('');
  // 失败重试复用同一 mutationId：网络恢复后不会产生第二条记录。
  const retryRef = useRef<AnkiReviewRequest | null>(null);
  const cancelledRef = useRef(false);
  const submittingRef = useRef(false);
  const submitController = useRef<AbortController | null>(null);
  const queueTargets = useRef(deckId ? [deckId] : decks.filter((deck) => deck.due > 0).map((deck) => deck.id));
  const [loadToken, setLoadToken] = useState(0);
  const [queueWarning, setQueueWarning] = useState('');

  useEffect(() => {
    cancelledRef.current = false;
    const controller = new AbortController();
    const targets = queueTargets.current;
    setPhase('loading');
    setError('');
    setQueueWarning('');
    setIndex(0);
    setRevealed(false);
    retryRef.current = null;
    Promise.allSettled(targets.map((targetId) => fetchDeckQueue(targetId, controller.signal)))
      .then((results) => {
        if (cancelledRef.current || controller.signal.aborted) return;
        const failures = results.filter((result) => result.status === 'rejected');
        const loaded = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
        if (failures.some((result) => isUnauthorized(result.reason))) {
          setError('登录已失效，请重新登录');
          setPhase('error');
          return;
        }
        if (failures.length > 0 && loaded.length === 0) {
          setError('到期队列加载失败，请重试。');
          setPhase('error');
          return;
        }
        const allCards = loaded
          .flatMap((result) => result.cards)
          .sort(
            (a, b) =>
              Number(a.reviewCount === 0) - Number(b.reviewCount === 0) ||
              a.dueAt.localeCompare(b.dueAt) ||
              a.id.localeCompare(b.id),
          );
        const previews: Record<string, unknown> = {};
        for (const result of loaded) {
          for (const card of result.cards) {
            const preview = readReviewPreview(result.previews, card.id);
            if (preview) previews[card.id] = preview;
          }
        }
        if (failures.length > 0) {
          const message = '部分卡片库队列加载失败，请返回卡片库后重试未加载的部分。';
          setQueueWarning(message);
          if (allCards.length === 0) {
            setError(message);
            setPhase('error');
            return;
          }
        }
        setQueuePreviews(previews);
        setCards(allCards);
        setPhase(allCards.length > 0 ? 'active' : 'done');
      })
      .catch(() => {
        if (cancelledRef.current || controller.signal.aborted) return;
        setError('到期队列加载失败，请重试。');
        setPhase('error');
      });
    return () => {
      cancelledRef.current = true;
      controller.abort();
      submitController.current?.abort();
    };
  }, [loadToken]);

  const current = cards[index];
  const currentPreview = useMemo(
    () => (current ? readReviewPreview(queuePreviews, current.id) : null),
    [queuePreviews, current],
  );

  const sendReview = useCallback(
    async (payload: AnkiReviewRequest) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      const controller = new AbortController();
      submitController.current = controller;
      setSubmitting(true);
      setError('');
      try {
        const updated = await submitReview(payload, AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]));
        if (cancelledRef.current) return;
        setCards((prev) => prev.map((card) => (card.id === updated.id ? updated : card)));
        retryRef.current = null;
        setLastRecord(`已记录 · 下次 ${formatNext(updated)}`);
        const nextIndex = index + 1;
        setIndex(nextIndex);
        setRevealed(false);
        setCustomDays('7');
        if (nextIndex >= cards.length) {
          setPhase('done');
          onSessionSettled();
        }
      } catch (cause) {
        if (cancelledRef.current) return;
        // 失败留在当前卡，不推进；保留 payload 供重试复用 mutationId。
        retryRef.current = payload;
        setError(cause instanceof Error ? cause.message : '评价提交失败，请重试');
      } finally {
        submittingRef.current = false;
        if (!cancelledRef.current) setSubmitting(false);
      }
    },
    [cards.length, index, onSessionSettled],
  );

  const rate = useCallback(
    (rating: AnkiRating, custom?: number) => {
      if (!current || submitting || !revealed) return;
      const payload: AnkiReviewRequest = {
        cardId: current.id,
        version: current.version,
        mutationId: newMutationId(),
        rating,
        ...(typeof custom === 'number' ? { customDays: custom } : {}),
      };
      void sendReview(payload);
    },
    [current, revealed, submitting, sendReview],
  );

  const rateCustom = useCallback(() => {
    const days = Number(customDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError('自定义天数应为 1–365 之间的整数。');
      return;
    }
    // 自定义天数独立语义：不传 rating，由服务端按自定义间隔排期，不推断答对/答错。
    if (!current || submitting || !revealed) return;
    const payload: AnkiReviewRequest = {
      cardId: current.id,
      version: current.version,
      mutationId: newMutationId(),
      customDays: days,
    };
    void sendReview(payload);
  }, [current, customDays, revealed, submitting, sendReview]);

  // 空格揭示答案（输入框/弹层打开时不触发）。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || phase !== 'active' || revealed || hasOpenOverlay()) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('button,input,select,textarea,a')) return;
      event.preventDefault();
      setRevealed(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, revealed]);

  if (phase === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-zinc-400 dark:text-zinc-500">正在准备今日练习…</p>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="rounded-surface border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-ink dark:text-white">
          {cards.length === 0 ? '暂无到期卡片' : queueWarning ? '已加载卡片练习完成' : '本轮练习完成'}
        </h1>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          答错的卡片会在稍后重新到期；自定义间隔不会推断对错。
        </p>
        {queueWarning && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {queueWarning}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="rounded-full border border-[#087ae9] bg-[#087ae9] px-[17px] py-[9px] text-sm font-medium text-white inline-flex items-center justify-center gap-2 whitespace-nowrap"
            onClick={onExit}
          >
            返回卡片库
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'error' || !current) {
    return (
      <div className="rounded-surface border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-bold text-ink dark:text-white">练习暂时不可用</h1>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400" role="alert">
          {error || '请稍后重试。'}
        </p>
        <button
          type="button"
          className="mt-5 mr-4 text-sm text-[#087ae9]"
          onClick={() => setLoadToken((token) => token + 1)}
        >
          重新加载队列
        </button>
        <button
          type="button"
          className="rounded-full border border-[#087ae9] bg-[#087ae9] px-[17px] py-[9px] text-sm font-medium text-white inline-flex items-center justify-center gap-2 whitespace-nowrap mt-5"
          onClick={onExit}
        >
          返回卡片库
        </button>
      </div>
    );
  }

  const total = cards.length;
  const percent = total > 0 ? Math.round((index / total) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
        <button
          type="button"
          className="rounded-full border border-[#e9edf1] bg-white px-[17px] py-[9px] text-sm font-medium text-[#202124] inline-flex items-center justify-center gap-2 whitespace-nowrap"
          onClick={onExit}
        >
          退出练习
        </button>
        <span aria-live="polite">
          第 {Math.min(index + 1, total)} / {total} 张
        </span>
      </div>

      <div
        className="h-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        role="progressbar"
        aria-label="本轮练习进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full rounded-full bg-sky-600" style={{ width: `${percent}%` }} />
      </div>

      {lastRecord && revealed === false && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400" role="status">
          {lastRecord}
        </p>
      )}

      <article className="rounded-surface border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 md:p-8">
        <span className="text-xs font-semibold text-sky-600" aria-hidden="true">
          Q
        </span>
        <h2 className="mt-1 whitespace-pre-wrap text-xl font-semibold leading-relaxed text-ink dark:text-white md:text-2xl">
          {current.question}
        </h2>
        {/* 答案未揭示时不渲染进 DOM/可访问树，自评控件仅揭示后可用。 */}
        {revealed && (
          <section aria-label="卡片答案" className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
            <div className="text-xs font-semibold text-zinc-400">A · 参考答案</div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
              {current.answer}
            </p>
          </section>
        )}
        <p className="mt-4 text-xs text-zinc-400">
          {revealed ? '已揭示答案，请根据回忆情况评价' : '答案已隐藏，先试着回忆'}
        </p>
      </article>

      {queueWarning && (
        <p role="alert" className="text-sm text-red-600">
          {queueWarning}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-surface border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
          {retryRef.current && (
            <button
              type="button"
              className="ml-3 underline"
              disabled={submitting}
              onClick={() => retryRef.current && void sendReview(retryRef.current)}
            >
              重试
            </button>
          )}
        </div>
      )}

      {!revealed ? (
        <div className="text-center">
          <button
            type="button"
            className="rounded-full border border-[#087ae9] bg-[#087ae9] px-[17px] py-[9px] text-sm font-medium text-white inline-flex items-center justify-center gap-2 whitespace-nowrap min-h-11 px-8"
            onClick={() => setRevealed(true)}
          >
            显示答案
          </button>
          <p className="mt-2 text-xs text-zinc-400">先在心里回答，再点击按钮或按空格键。</p>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={showIntervals}
              onChange={(event) => setShowIntervals(event.target.checked)}
            />
            显示下次间隔
          </label>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="评价这次回忆">
            {RATING_LABELS.map(({ rating, label, hint }) => {
              // SM2 三档映射：错误=10 分钟学习步；hard/correct 本次共用 nextDays（EF 差异影响未来）。
              const preview = rating === 'wrong' ? currentPreview?.againMinutes : currentPreview?.nextDays;
              return (
                <button
                  key={rating}
                  type="button"
                  disabled={submitting}
                  onClick={() => rate(rating)}
                  className="rounded-surface border border-zinc-200 bg-white px-2 py-3 text-center transition-colors hover:border-sky-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <strong className="block text-sm text-ink dark:text-white">{label}</strong>
                  <small className="mt-0.5 block text-xs text-zinc-400">
                    {showIntervals && typeof preview === 'number'
                      ? rating === 'wrong'
                        ? `${preview} 分钟后`
                        : `${preview} 天后`
                      : hint}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <label htmlFor="anki-custom-days" className="shrink-0">
              或自行指定
            </label>
            <input
              id="anki-custom-days"
              type="number"
              min={1}
              max={365}
              step={1}
              value={customDays}
              onChange={(event) => setCustomDays(event.target.value)}
              className="editorial-input w-24"
              aria-label="自定义复习天数"
            />
            <span>天后</span>
            <button
              type="button"
              className="text-sm font-medium text-[#087ae9] hover:opacity-80"
              disabled={submitting}
              onClick={rateCustom}
            >
              按此间隔继续
            </button>
          </div>
          <p className="text-xs text-zinc-400">服务端按自评或自定义间隔排期；自定义间隔不推断答对或答错。</p>
        </div>
      )}
    </div>
  );
}
