/**
 * 随机浏览（只读）。
 *
 * 边界：
 * - 包含库内全部卡片（含未到期），不依赖 dueAt；
 * - 纯客户端 Fisher–Yates 洗牌；切卡/重洗自动隐藏答案；
 * - 不发起任何写请求：不自评、不改排期、不计入每日进度。
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, Shuffle } from 'lucide-react';
import { fetchDeckCards, type AnkiCard } from './anki-api';
import { AnkiMarkdown } from './AnkiMarkdown';
import { AnkiCardTags } from './AnkiTags';
import { matchesTag } from './anki-tags';
import { AnkiCardCounts } from './AnkiCardCounts';

interface AnkiBrowseProps {
  deckId: string;
  deckName: string;
  refreshToken?: number;
  tag?: string | null;
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

export function AnkiBrowse({ deckId, deckName, refreshToken = 0, tag = null, onExit }: AnkiBrowseProps) {
  const [cards, setCards] = useState<AnkiCard[] | null>(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [motion, setMotion] = useState({ kind: 'idle', sequence: 0 });
  const cardRef = useRef<HTMLElement>(null);

  // 切卡仅滚动当前卡牌，不影响页面或复习状态。
  useEffect(() => {
    cardRef.current?.scrollTo?.({ top: 0, behavior: 'instant' });
  }, [index, motion.sequence]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetchDeckCards(deckId, controller.signal)
      .then((loaded) => {
        if (cancelled) return;
        setCards(shuffle(loaded.filter((card) => matchesTag(card, tag))));
        setError('');
        setIndex(0);
        setRevealed(false);
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) return;
        setError('卡片加载失败，请重试。');
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [deckId, refreshToken, tag]);

  const reshuffle = () => {
    if (!cards || cards.length === 0) return;
    setCards(shuffle(cards));
    setIndex(0);
    setRevealed(false);
    setMotion((value) => ({ kind: 'shuffle', sequence: value.sequence + 1 }));
  };

  const goTo = (next: number) => {
    if (!cards || next < 0 || next >= cards.length) return;
    setMotion((value) => ({ kind: next > index ? 'next' : 'previous', sequence: value.sequence + 1 }));
    setIndex(next);
    setRevealed(false);
  };

  if (error) {
    return (
      <div className="rounded-surface border border-zinc-200 bg-white p-8 text-center">
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
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

  if (!cards) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-zinc-400">正在加载卡片…</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-surface border border-zinc-200 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-ink">
          {tag === null ? '这个卡片库还没有卡片' : '当前标签下没有卡片'}
        </h2>
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

  const current = cards[index];

  return (
    <div className="anki-browse" aria-label="沉浸式随机浏览">
      <div className="anki-browse-toolbar">
        <button type="button" className="anki-browse-exit" onClick={onExit}>
          <ArrowLeft size={16} aria-hidden="true" /> 返回卡片库
        </button>
        <div className="anki-browse-context">
          <span>
            {deckName}
            {tag !== null ? ` · ${tag || '无标签'}` : ''}
          </span>
          <span aria-live="polite" className="tabular-nums">
            随机浏览 · {index + 1} / {cards.length}
          </span>
        </div>
        <button type="button" className="anki-browse-shuffle" onClick={reshuffle}>
          <Shuffle size={16} aria-hidden="true" /> 重新洗牌
        </button>
      </div>

      <div className="anki-browse-stage">
        <div key={motion.sequence} className="anki-browse-stack" data-motion={motion.kind}>
          <span className="anki-browse-layer anki-browse-layer-back" aria-hidden="true" />
          <span className="anki-browse-layer anki-browse-layer-front" aria-hidden="true" />
          <article ref={cardRef} className="anki-browse-card" aria-label="当前卡牌">
            <div className="anki-browse-card-head">
              <span className="anki-browse-question-label">Q · 试着回忆</span>
              <span className="tabular-nums">{String(index + 1).padStart(2, '0')}</span>
            </div>
            <div className="anki-browse-content">
              <div role="heading" aria-level={2}>
                <AnkiMarkdown content={current.question} className="anki-question" />
              </div>
              {revealed && (
                <section aria-label="卡片答案" className="anki-browse-answer">
                  <div className="anki-browse-answer-label">A · 参考答案</div>
                  <AnkiMarkdown content={current.answer} className="mt-3" />
                </section>
              )}
            </div>
            <div className="anki-browse-card-foot">
              <AnkiCardTags tags={current.tags} />
              <AnkiCardCounts card={current} />
              <p className="mt-4 text-xs text-zinc-400">{revealed ? '答案已展开' : '答案已隐藏，先试着回忆'}</p>
            </div>
          </article>
        </div>
      </div>

      <div className="anki-browse-controls">
        <button type="button" className="anki-browse-step" disabled={index === 0} onClick={() => goTo(index - 1)}>
          <ArrowLeft size={18} aria-hidden="true" /> 上一张
        </button>
        <button type="button" className="anki-browse-reveal" onClick={() => setRevealed((value) => !value)}>
          <RotateCcw size={17} aria-hidden="true" /> {revealed ? '收起答案' : '显示答案'}
        </button>
        <button
          type="button"
          className="anki-browse-step"
          disabled={index >= cards.length - 1}
          onClick={() => goTo(index + 1)}
        >
          下一张 <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="anki-browse-note">自由查看全部卡片，不改变复习排期，也不计入每日练习进度。</p>
    </div>
  );
}
