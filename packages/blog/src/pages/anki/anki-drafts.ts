import type { AnkiCard } from './anki-api';

export interface AnkiDraft {
  id: string;
  deckId: string;
  question: string;
  answer: string;
  tags: string[];
  resetProgress: boolean;
  editing?: AnkiCard;
  status: 'pending' | 'failed';
  updatedAt: number;
}

const PREFIX = 'dblog:anki:draft:v1:';
const ownerPrefix = (userId: string) => `${PREFIX}${encodeURIComponent(userId)}:`;
const key = (userId: string, id: string) => `${ownerPrefix(userId)}${encodeURIComponent(id)}`;

function parseDraft(raw: string): AnkiDraft {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('草稿格式异常，原记录未删除。');
  const d = value as Record<string, unknown>;
  if (
    typeof d.id !== 'string' ||
    !d.id ||
    typeof d.deckId !== 'string' ||
    typeof d.question !== 'string' ||
    typeof d.answer !== 'string' ||
    !Array.isArray(d.tags) ||
    !d.tags.every((tag) => typeof tag === 'string') ||
    typeof d.resetProgress !== 'boolean' ||
    (d.status !== 'pending' && d.status !== 'failed') ||
    typeof d.updatedAt !== 'number' ||
    !Number.isFinite(d.updatedAt)
  )
    throw new Error('草稿格式异常，原记录未删除。');
  if (d.editing != null) {
    if (typeof d.editing !== 'object') throw new Error('编辑草稿格式异常。');
    const card = d.editing as Record<string, unknown>;
    if (
      typeof card.id !== 'string' ||
      !card.id ||
      typeof card.deckId !== 'string' ||
      typeof card.question !== 'string' ||
      typeof card.answer !== 'string' ||
      typeof card.version !== 'number' ||
      !Number.isInteger(card.version) ||
      card.version < 1
    )
      throw new Error('编辑草稿格式异常，原记录未删除。');
  }
  return d as unknown as AnkiDraft;
}

/** 每份草稿独立存储，避免多标签页覆盖整个列表。仅保存未获云端确认的内容。 */
export function saveAnkiDraft(userId: string, draft: AnkiDraft): void {
  if (!userId) throw new Error('尚未确认账号，不能保存账号草稿。');
  const storageKey = key(userId, draft.id);
  const existing = localStorage.getItem(storageKey);
  if (existing != null) parseDraft(existing); // 不覆盖损坏记录
  localStorage.setItem(storageKey, JSON.stringify(draft));
  window.dispatchEvent(new Event('dblog-anki-drafts-change'));
}

export function removeAnkiDraft(userId: string, id: string): void {
  localStorage.removeItem(key(userId, id));
  window.dispatchEvent(new Event('dblog-anki-drafts-change'));
}

export function listAnkiDrafts(userId: string): { drafts: AnkiDraft[]; damaged: number } {
  if (!userId) return { drafts: [], damaged: 0 };
  const drafts: AnkiDraft[] = [];
  let damaged = 0;
  const prefix = ownerPrefix(userId);
  for (let i = 0; i < localStorage.length; i += 1) {
    const storageKey = localStorage.key(i);
    if (!storageKey?.startsWith(prefix)) continue;
    const raw = localStorage.getItem(storageKey);
    if (raw == null) continue;
    try {
      const draft = parseDraft(raw);
      if (key(userId, draft.id) !== storageKey) throw new Error('草稿标识异常。');
      drafts.push(draft);
    } catch {
      damaged += 1;
    }
  }
  return { drafts: drafts.sort((a, b) => b.updatedAt - a.updatedAt), damaged };
}
