/**
 * Anki 弹层表单：新建卡片库、录入/编辑 Q & A、每日目标。
 *
 * 复用 SlideModal（焦点陷阱/滚动锁/Escape/焦点还原）。
 * 编辑卡片默认保留原复习排期；用户显式勾选「重新学习」才传 resetProgress=true。
 */

import { useEffect, useRef, useState } from 'react';
import { SlideModal } from '@/components/SlideModal';
import {
  createCard,
  createCategory,
  createDeck,
  updateCard,
  updateGoal,
  type AnkiCard,
  type NormalizedDashboard,
} from './anki-api';

export type AnkiDialogState = { kind: 'deck' } | { kind: 'card'; deckId?: string; card?: AnkiCard } | { kind: 'goal' };

interface AnkiDialogsProps {
  state: AnkiDialogState | null;
  dashboard: NormalizedDashboard;
  onClose: () => void;
  onDone: (message: string) => void;
}

export function AnkiDialogs({ state, dashboard, onClose, onDone }: AnkiDialogsProps) {
  if (!state) return null;
  const title =
    state.kind === 'deck'
      ? '新建卡片库'
      : state.kind === 'card'
        ? state.card
          ? '编辑 Q & A 卡片'
          : '录入 Q & A 卡片'
        : '每日练习目标';
  return (
    <SlideModal isOpen onClose={onClose} ariaLabelledby="anki-dialog-title">
      <div className="p-5">
        <h2 id="anki-dialog-title" className="text-lg font-semibold text-ink dark:text-white">
          {title}
        </h2>
        {state.kind === 'deck' && <DeckForm dashboard={dashboard} onClose={onClose} onDone={onDone} />}
        {state.kind === 'card' && <CardForm state={state} dashboard={dashboard} onClose={onClose} onDone={onDone} />}
        {state.kind === 'goal' && <GoalForm dashboard={dashboard} onClose={onClose} onDone={onDone} />}
      </div>
    </SlideModal>
  );
}

function FieldError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-surface border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
    >
      {message}
    </div>
  );
}

interface FormProps {
  dashboard: NormalizedDashboard;
  onClose: () => void;
  onDone: (message: string) => void;
}

function DeckForm({ dashboard, onClose, onDone }: FormProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedCategory = category.trim();
    if (!trimmedName || !trimmedCategory) {
      setError('卡片库名称和分类名称不能仅为空格。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const existing = dashboard.categories.find((cat) => cat.name === trimmedCategory);
      const categoryId = existing ? existing.id : (await createCategory(trimmedCategory)).id;
      await createDeck(categoryId, trimmedName);
      onDone('卡片库已创建。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="block">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">卡片库名称</span>
        <input
          ref={nameRef}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={50}
          required
          className="editorial-input mt-1"
          placeholder="例如：Go 并发编程"
        />
      </label>
      <label className="block">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">所属分类</span>
        <input
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          maxLength={30}
          required
          list="anki-category-options"
          className="editorial-input mt-1"
          placeholder="选择已有分类，或输入新分类"
        />
        <datalist id="anki-category-options">
          {dashboard.categories.map((cat) => (
            <option key={cat.id} value={cat.name} />
          ))}
        </datalist>
      </label>
      <FieldError message={error} />
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="editorial-button" onClick={onClose}>
          取消
        </button>
        <button type="submit" className="editorial-button-primary" disabled={busy}>
          创建卡片库
        </button>
      </div>
    </form>
  );
}

interface CardFormProps {
  state: Extract<AnkiDialogState, { kind: 'card' }>;
  dashboard: NormalizedDashboard;
  onClose: () => void;
  onDone: (message: string) => void;
}

function CardForm({ state, dashboard, onClose, onDone }: CardFormProps) {
  const editing = state.card;
  const [deckId, setDeckId] = useState(state.deckId ?? dashboard.decks[0]?.id ?? '');
  const [question, setQuestion] = useState(editing?.question ?? '');
  const [answer, setAnswer] = useState(editing?.answer ?? '');
  const [resetProgress, setResetProgress] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a) {
      setError('问题和答案不能为空或仅为空格。');
      return;
    }
    if (!deckId) {
      setError('请先创建一个卡片库。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (editing) {
        await updateCard(editing.id, { question: q, answer: a, resetProgress, version: editing.version });
        onDone('卡片已保存，复习排期已保留。');
      } else {
        await createCard(deckId, q, a);
        onDone('卡片已录入。');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="block">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">所属卡片库</span>
        <select
          value={deckId}
          onChange={(event) => setDeckId(event.target.value)}
          required
          className="editorial-input mt-1"
        >
          {dashboard.decks.length === 0 && <option value="">请先创建卡片库</option>}
          {dashboard.decks.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Q · 问题</span>
        <textarea
          ref={firstRef}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={3000}
          required
          rows={3}
          className="editorial-input mt-1"
          placeholder="写下一个具体、可回忆的问题"
        />
      </label>
      <label className="block">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">A · 答案</span>
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          maxLength={10000}
          required
          rows={4}
          className="editorial-input mt-1"
          placeholder="写下便于核对的答案"
        />
      </label>
      {editing && (
        <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <input type="checkbox" checked={resetProgress} onChange={(event) => setResetProgress(event.target.checked)} />
          重新学习这张卡片（保留历史记录，默认保留排期）
        </label>
      )}
      <p className="text-xs text-zinc-400">以纯文本保存；练习和浏览列表中答案默认隐藏。</p>
      <FieldError message={error} />
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="editorial-button" onClick={onClose}>
          取消
        </button>
        <button type="submit" className="editorial-button-primary" disabled={busy}>
          保存卡片
        </button>
      </div>
    </form>
  );
}

function GoalForm({ dashboard, onClose, onDone }: FormProps) {
  const [goal, setGoal] = useState(String(dashboard.goal));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(goal);
    if (!Number.isInteger(value) || value < 1 || value > 500) {
      setError('目标应为 1–500 之间的整数。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await updateGoal(value);
      onDone('每日目标已更新。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="block">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">每天想练习多少张不同卡片？</span>
        <input
          type="number"
          min={1}
          max={500}
          step={1}
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          required
          className="editorial-input mt-1"
        />
      </label>
      <p className="text-xs text-zinc-400">目标只影响展示，不限制练习；重复评价同一卡片只计一张完成量。</p>
      <FieldError message={error} />
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="editorial-button" onClick={onClose}>
          取消
        </button>
        <button type="submit" className="editorial-button-primary" disabled={busy}>
          保存目标
        </button>
      </div>
    </form>
  );
}
