/**
 * 卡片库详情：学习进度 + 全部卡片（默认仅显示 Q，答案展开式收起，编辑保留排期）。
 */

import { useEffect, useState } from 'react';
import { fetchDeckCards, type AnkiCard, type AnkiDeckSummary } from './anki-api';
import { AnkiMarkdown } from './AnkiMarkdown';

interface AnkiDeckDetailProps {
  deck: AnkiDeckSummary;
  refreshToken?: number;
  categoryName: string;
  onBack: () => void;
  onNewCard: () => void;
  onEditCard: (card: AnkiCard) => void;
  onBrowse: () => void;
  onPractice: () => void;
}

const formatDue = (dueAt: string): string => {
  if (!dueAt) return '—';
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};

export function AnkiDeckDetail({
  deck,
  refreshToken = 0,
  categoryName,
  onBack,
  onNewCard,
  onEditCard,
  onBrowse,
  onPractice,
}: AnkiDeckDetailProps) {
  const [cards, setCards] = useState<AnkiCard[] | null>(null);
  const [error, setError] = useState('');
  const [openAnswer, setOpenAnswer] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetchDeckCards(deck.id, controller.signal)
      .then((loaded) => {
        if (cancelled) return;
        setCards(loaded);
        setError('');
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) return;
        setError('卡片加载失败，请重试。');
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [deck.id, refreshToken]);

  const toggleAnswer = (cardId: string) => {
    setOpenAnswer((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const learnedPct = deck.total > 0 ? Math.round((deck.learned / deck.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <button type="button" className="text-sm font-medium text-[#087ae9] hover:opacity-80" onClick={onBack}>
          返回卡片库
        </button>
        <h1 className="mt-3 text-2xl font-bold text-ink">{deck.name}</h1>
        <p className="mt-1 text-sm text-zinc-400">{categoryName || '未分类'}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="text-sm font-medium text-[#087ae9] hover:opacity-80" onClick={onNewCard}>
            录入卡片
          </button>
          <button
            type="button"
            className="text-sm font-medium text-[#087ae9] hover:opacity-80"
            disabled={deck.total === 0}
            onClick={onBrowse}
          >
            随机浏览
          </button>
          <button
            type="button"
            className="rounded-full border border-[#087ae9] bg-[#087ae9] px-[17px] py-[9px] text-sm font-medium text-white inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm"
            disabled={deck.due === 0}
            onClick={onPractice}
          >
            {deck.due > 0 ? `练习 ${deck.due} 张` : '暂无到期'}
          </button>
        </div>
      </div>

      <section aria-label="学习进度" className="rounded-surface border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-500">
          <span>
            共 <strong className="text-ink">{deck.total}</strong> 张
          </span>
          <span>
            已学 <strong className="text-ink">{deck.learned}</strong>
          </span>
          <span>
            熟练 <strong className="text-ink">{deck.stable}</strong>
          </span>
          <span>
            待练 <strong className="text-ink">{deck.due}</strong>
          </span>
        </div>
        <div
          className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-100"
          role="progressbar"
          aria-label="已学覆盖率"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={learnedPct}
        >
          <div className="h-full rounded-full bg-sky-600" style={{ width: `${learnedPct}%` }} />
        </div>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : !cards ? (
        <p className="text-sm text-zinc-400">正在加载卡片…</p>
      ) : cards.length === 0 ? (
        <div className="rounded-surface border border-dashed border-zinc-300 p-8 text-center">
          <h2 className="text-base font-semibold text-ink">这个卡片库还没有卡片</h2>
          <p className="mt-2 text-sm text-zinc-500">从一个明确的问题开始记录。</p>
          <button
            type="button"
            className="rounded-full border border-[#087ae9] bg-[#087ae9] px-[17px] py-[9px] text-sm font-medium text-white inline-flex items-center justify-center gap-2 whitespace-nowrap mt-4"
            onClick={onNewCard}
          >
            录入第一张卡片
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {cards.map((card) => {
            const isOpen = openAnswer.has(card.id);
            return (
              <li key={card.id} className="rounded-surface border border-zinc-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div role="heading" aria-level={3} className="min-w-0 flex-1">
                    <AnkiMarkdown content={card.question} />
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-full border border-[#e9edf1] bg-white px-3 py-1.5 text-xs font-medium text-[#202124]"
                    onClick={() => onEditCard(card)}
                  >
                    编辑
                  </button>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  下次到期 {formatDue(card.dueAt)} · 已评价 {card.reviewCount} 次
                </p>
                <button
                  type="button"
                  className="mt-2 rounded-full border border-[#e9edf1] bg-white px-3 py-1.5 text-xs font-medium text-[#202124]"
                  aria-expanded={isOpen}
                  onClick={() => toggleAnswer(card.id)}
                >
                  {isOpen ? '收起答案' : '查看答案'}
                </button>
                {isOpen && (
                  <section aria-label="卡片答案" className="mt-2 border-t border-zinc-100 pt-2">
                    <AnkiMarkdown content={card.answer} />
                  </section>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
