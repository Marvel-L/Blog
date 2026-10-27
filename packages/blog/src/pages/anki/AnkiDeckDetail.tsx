/**
 * 卡片库详情：学习进度 + 全部卡片（默认仅显示 Q，答案展开式收起，编辑保留排期）。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnkiCardTags } from './AnkiTags';
import { matchesTag } from './anki-tags';
import { fetchDeckCards, fetchDeckTags, type AnkiTag, type AnkiCard, type AnkiDeckSummary } from './anki-api';
import { AnkiMarkdown } from './AnkiMarkdown';
import { AnkiCardCounts } from './AnkiCardCounts';
import { AnkiAIDialog } from './AnkiAIDialog';
import { AnkiPracticeActions } from './AnkiPracticeActions';

interface AnkiDeckDetailProps {
  deck: AnkiDeckSummary;
  refreshToken?: number;
  categoryName: string;
  onBack: () => void;
  onNewCard: () => void;
  onEditCard: (card: AnkiCard) => void;
  onBrowse: (tag: string | null) => void;
  onPractice: (tag: string | null) => void;
  initialTag?: string | null;
  onRecorded?: () => void;
  onManageTags?: () => void;
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
  onRecorded,
  initialTag = null,
  onManageTags,
}: AnkiDeckDetailProps) {
  const [aiCard, setAICard] = useState<AnkiCard | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag);
  const [cards, setCards] = useState<AnkiCard[] | null>(null);
  const [error, setError] = useState('');
  const [openAnswer, setOpenAnswer] = useState<Set<string>>(new Set());
  const [recordMessage, setRecordMessage] = useState('');
  const [tags, setTags] = useState<AnkiTag[]>([]);
  const [tagError, setTagError] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    fetchDeckTags(deck.id, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setTags(loaded);
        setTagError('');
        setSelectedTag((current) =>
          current && !loaded.some((tag) => tag.name.toLowerCase() === current.toLowerCase()) ? null : current,
        );
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setTagError(cause instanceof Error ? cause.message : '标签加载失败');
      });
    return () => controller.abort();
  }, [deck.id, refreshToken]);

  useEffect(() => {
    const controller = new AbortController();
    const currentGeneration = ++generation.current;
    let cancelled = false;
    fetchDeckCards(deck.id, controller.signal)
      .then((loaded) => {
        if (cancelled || currentGeneration !== generation.current) return;
        setCards(loaded);
        setError('');
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted || currentGeneration !== generation.current) return;
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

  const tagOptions = useMemo(() => tags.map((tag) => tag.name), [tags]);
  const visibleCards = useMemo(
    () => (cards ?? []).filter((card) => matchesTag(card, selectedTag)),
    [cards, selectedTag],
  );
  const selectTag = (tag: string | null) => {
    setSelectedTag(tag);
    setOpenAnswer(new Set());
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
          {onManageTags && (
            <button
              type="button"
              className="text-sm font-medium text-[#087ae9] hover:opacity-80"
              onClick={onManageTags}
            >
              管理标签
            </button>
          )}
          <button type="button" className="text-sm font-medium text-[#087ae9] hover:opacity-80" onClick={onNewCard}>
            录入卡片
          </button>
          <button
            type="button"
            className="text-sm font-medium text-[#087ae9] hover:opacity-80"
            disabled={deck.total === 0 || (selectedTag !== null && visibleCards.length === 0)}
            onClick={() => onBrowse(selectedTag)}
          >
            随机浏览
          </button>
          <button
            type="button"
            className="rounded-full border border-[#087ae9] bg-[#087ae9] px-[17px] py-[9px] text-sm font-medium text-white inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm"
            disabled={deck.due === 0 || (selectedTag !== null && visibleCards.length === 0)}
            onClick={() => onPractice(selectedTag)}
          >
            {deck.due === 0 ? '暂无到期' : selectedTag !== null ? '按标签练习' : `练习 ${deck.due} 张`}
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

      {tagError && (
        <p role="alert" className="text-sm text-red-600">
          {tagError}
        </p>
      )}
      {cards && !error && (cards.length > 0 || tags.length > 0) && (
        <section aria-label="按标签筛选" className="border-y border-zinc-100 py-4">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="标签筛选选项">
            {[
              { value: null, label: '全部标签' },
              { value: '', label: '无标签' },
              ...tagOptions.map((tag) => ({ value: tag, label: tag })),
            ].map(({ value, label }) => (
              <button
                key={value === null ? 'all' : `tag-${value}`}
                type="button"
                className="anki-tag"
                aria-pressed={selectedTag === value}
                onClick={() => selectTag(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p role="status" className="mt-3 text-xs text-zinc-400">
            {visibleCards.length} / {cards.length} 张卡片{selectedTag !== null ? ` · ${selectedTag || '无标签'}` : ''}
          </p>
        </section>
      )}
      {recordMessage && (
        <p role="status" className="text-sm text-sky-700">
          {recordMessage}
        </p>
      )}
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
      ) : visibleCards.length === 0 ? (
        <p className="py-8 text-sm text-zinc-400">当前标签下没有卡片，选择全部标签查看。</p>
      ) : (
        <ul className="space-y-3">
          {visibleCards.map((card) => {
            const isOpen = openAnswer.has(card.id);
            return (
              <li key={card.id} className="rounded-surface border border-zinc-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div role="heading" aria-level={3} className="min-w-0 flex-1">
                    <AnkiMarkdown content={card.question} />
                  </div>
                  <div className="anki-card-ai-tools">
                    <button type="button" className="anki-card-tool-button" onClick={() => onEditCard(card)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className="anki-card-tool-button anki-card-ai-check"
                      onClick={() => setAICard(card)}
                    >
                      Ai Check
                    </button>
                  </div>
                </div>
                <AnkiCardTags tags={card.tags} onSelect={selectTag} />
                <p className="mt-1 text-xs text-zinc-400">下次到期 {formatDue(card.dueAt)}</p>
                <AnkiCardCounts card={card} />
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
                    <AnkiPracticeActions
                      key={`${card.id}-${card.version}`}
                      card={card}
                      onRecorded={(updated) => {
                        generation.current += 1;
                        setCards(
                          (current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? null,
                        );
                        setOpenAnswer((current) => {
                          const next = new Set(current);
                          next.delete(updated.id);
                          return next;
                        });
                        setRecordMessage('练习已记录，下次复习安排和结果次数已更新。');
                        onRecorded?.();
                      }}
                    />
                  </section>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {aiCard && <AnkiAIDialog key={aiCard.id} card={aiCard} onClose={() => setAICard(null)} />}
    </div>
  );
}
