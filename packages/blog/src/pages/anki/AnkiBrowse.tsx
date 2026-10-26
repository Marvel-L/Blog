/**
 * 随机浏览（只读）。
 *
 * 边界：
 * - 包含库内全部卡片（含未到期），不依赖 dueAt；
 * - 纯客户端 Fisher–Yates 洗牌；切卡/重洗自动隐藏答案；
 * - 不发起任何写请求：不自评、不改排期、不计入每日进度。
 */

import { useEffect, useState } from 'react';
import { fetchDeckCards, type AnkiCard } from './anki-api';

interface AnkiBrowseProps {
  deckId: string;
  deckName: string;
  onExit: () => void;
}

const shuffle = <T,>(input: T[]): T[] => {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export function AnkiBrowse({ deckId, deckName, onExit }: AnkiBrowseProps) {
  const [cards, setCards] = useState<AnkiCard[] | null>(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetchDeckCards(deckId, controller.signal)
      .then((loaded) => {
        if (cancelled) return;
        setCards(shuffle(loaded));
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) return;
        setError('卡片加载失败，请重试。');
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [deckId]);

  const reshuffle = () => {
    if (!cards || cards.length <= 1) return;
    setCards(shuffle(cards));
    setIndex(0);
    setRevealed(false);
  };

  const goTo = (next: number) => {
    setIndex(next);
    setRevealed(false);
  };

  if (error) {
    return (
      <div className="rounded-surface border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
        <button type="button" className="editorial-button-primary mt-5" onClick={onExit}>
          返回卡片库
        </button>
      </div>
    );
  }

  if (!cards) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-zinc-400 dark:text-zinc-500">正在加载卡片…</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-surface border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-ink dark:text-white">这个卡片库还没有卡片</h2>
        <button type="button" className="editorial-button-primary mt-5" onClick={onExit}>
          返回卡片库
        </button>
      </div>
    );
  }

  const current = cards[index];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
        <button type="button" className="editorial-button" onClick={onExit}>
          返回卡片库
        </button>
        <span aria-live="polite">
          随机浏览 · {index + 1} / {cards.length}
        </span>
      </div>

      <p className="text-xs text-zinc-400">不受到期限制 · {deckName}</p>

      <article className="rounded-surface border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 md:p-8">
        <span className="text-xs font-semibold text-sky-600" aria-hidden="true">
          Q
        </span>
        <h2 className="mt-1 whitespace-pre-wrap text-xl font-semibold leading-relaxed text-ink dark:text-white md:text-2xl">
          {current.question}
        </h2>
        {revealed && (
          <section aria-label="卡片答案" className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
            <div className="text-xs font-semibold text-zinc-400">A · 参考答案</div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
              {current.answer}
            </p>
          </section>
        )}
        <p className="mt-4 text-xs text-zinc-400">{revealed ? '答案已展开' : '答案已隐藏，先试着回忆'}</p>
      </article>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" className="editorial-button" disabled={index === 0} onClick={() => goTo(index - 1)}>
          上一张
        </button>
        <button type="button" className="editorial-button-primary" onClick={() => setRevealed((value) => !value)}>
          {revealed ? '收起答案' : '显示答案'}
        </button>
        <button
          type="button"
          className="editorial-button"
          disabled={index >= cards.length - 1}
          onClick={() => goTo(index + 1)}
        >
          下一张
        </button>
        <button type="button" className="editorial-button" onClick={reshuffle}>
          重新洗牌
        </button>
      </div>

      <p className="text-center text-xs text-zinc-400">自由查看全部卡片，不改变复习排期，也不计入每日练习进度。</p>
    </div>
  );
}
