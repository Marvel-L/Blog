import type { AnkiCard } from './anki-api';

export function AnkiCardCounts({ card }: { card: AnkiCard }) {
  if (typeof card.practiceCount !== 'number') {
    return <p className="mt-2 text-xs text-zinc-500">当前学习周期已练 {card.reviewCount} 次 · 终身结果统计暂不可用</p>;
  }
  return (
    <p aria-label="卡片练习统计" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
      <span>练习 {card.practiceCount} 次</span>
      <span>熟悉 {card.correctCount ?? '—'} 次</span>
      <span>模糊 {card.hardCount ?? '—'} 次</span>
      <span>忘记 {card.wrongCount ?? '—'} 次</span>
      <span>自定义 {card.customCount ?? '—'} 次</span>
    </p>
  );
}
