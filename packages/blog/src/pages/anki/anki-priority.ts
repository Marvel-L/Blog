import type { AnkiCard } from './anki-api';

/** 推荐顺序，不计算记忆概率或修改排期。时钟/到期集合只取服务端队列。 */
export function prioritizeCards(cards: AnkiCard[], dueIds: ReadonlySet<string>, serverNow: string): AnkiCard[] {
  const now = Date.parse(serverNow);
  const priority = (card: AnkiCard) => {
    if (card.reviewCount === 0) return { tier: 1, urgency: 0 };
    const due = Date.parse(card.dueAt);
    const urgency =
      Number.isFinite(now) && Number.isFinite(due) ? (now - due) / Math.max(card.intervalDays * 86400000, 600000) : 0;
    return { tier: dueIds.has(card.id) ? 0 : 2, urgency };
  };
  // 先洗牌再稳定排序：同优先级随机，一轮覆盖全部卡且不重复。
  const shuffled = [...new Map(cards.map((card) => [card.id, card])).values()];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.sort((a, b) => {
    const left = priority(a);
    const right = priority(b);
    return (
      left.tier - right.tier || right.urgency - left.urgency || (left.tier !== 1 ? a.dueAt.localeCompare(b.dueAt) : 0)
    );
  });
}
