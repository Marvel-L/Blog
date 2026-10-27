/**
 * Anki 弹层表单：新建卡片库、录入/编辑 Q & A、每日目标。
 *
 * 复用 SlideModal（焦点陷阱/滚动锁/Escape/焦点还原）。
 * 编辑卡片默认保留原复习排期；用户显式勾选「重新学习」才传 resetProgress=true。
 */

import { useEffect, useRef, useState } from 'react';
import { SlideModal } from '@/components/SlideModal';
import { AnkiMarkdownEditor } from './AnkiMarkdownEditor';
import { AnkiTagPicker } from './AnkiTagPicker';
import { AnkiTagManager } from './AnkiTagManager';
import './anki.css';
import {
  createCard,
  createCategory,
  createDeck,
  fetchDashboard,
  updateCard,
  updateGoal,
  type AnkiCard,
  type NormalizedDashboard,
} from './anki-api';

export type AnkiDialogState =
  | { kind: 'deck' }
  | { kind: 'card'; deckId?: string; card?: AnkiCard }
  | { kind: 'goal' }
  | { kind: 'tags'; deckId: string };

interface AnkiDialogsProps {
  state: AnkiDialogState | null;
  dashboard: NormalizedDashboard;
  onClose: () => void;
  onDone: (message: string) => void;
  onTagsChanged?: () => void;
}

export function AnkiDialogs({ state, dashboard, onClose, onDone, onTagsChanged }: AnkiDialogsProps) {
  if (!state) return null;
  const title =
    state.kind === 'deck'
      ? '新建卡片库'
      : state.kind === 'card'
        ? state.card
          ? '编辑 Q & A 卡片'
          : '录入 Q & A 卡片'
        : state.kind === 'tags'
          ? '管理标签'
          : '每日练习目标';
  return (
    <SlideModal
      isOpen
      onClose={onClose}
      ariaLabelledby="anki-dialog-title"
      className={`anki-dialog-panel ${state.kind === 'card' ? 'anki-card-dialog' : ''}`}
    >
      <div className="p-5">
        <h2 id="anki-dialog-title" className="text-lg font-semibold text-ink">
          {title}
        </h2>
        {state.kind === 'deck' && <DeckForm dashboard={dashboard} onClose={onClose} onDone={onDone} />}
        {state.kind === 'card' && <CardForm state={state} dashboard={dashboard} onClose={onClose} onDone={onDone} />}
        {state.kind === 'tags' && (
          <>
            <AnkiTagManager key={state.deckId} deckId={state.deckId} onChanged={() => onTagsChanged?.()} />
            <button type="button" className="anki-rating-button mt-5" onClick={onClose}>
              关闭标签管理
            </button>
          </>
        )}
        {state.kind === 'goal' && <GoalForm dashboard={dashboard} onClose={onClose} onDone={onDone} />}
      </div>
    </SlideModal>
  );
}

function FieldError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-surface border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

interface FormProps {
  dashboard: NormalizedDashboard;
  onClose: () => void;
  onDone: (message: string) => void;
}

function useFormRequest() {
  const mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  return {
    begin: () => {
      if (inFlight.current) return null;
      inFlight.current = true;
      controller.current = new AbortController();
      return AbortSignal.any([controller.current.signal, AbortSignal.timeout(10000)]);
    },
    active: () => mounted.current && !controller.current?.signal.aborted,
    finish: () => {
      inFlight.current = false;
    },
  };
}

function DeckForm({ dashboard, onClose, onDone }: FormProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useFormRequest();
  const nameRef = useRef<HTMLInputElement>(null);
  const createdCategories = useRef(new Map<string, string>());

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
    const signal = request.begin();
    if (!signal) return;
    setBusy(true);
    setError('');
    try {
      const categoryKey = trimmedCategory.toLowerCase();
      const existing = dashboard.categories.find((cat) => cat.name.toLowerCase() === categoryKey);
      let categoryId = existing?.id ?? createdCategories.current.get(categoryKey);
      if (!categoryId) {
        try {
          categoryId = (await createCategory(trimmedCategory, signal)).id;
        } catch (cause) {
          // 请求可能已经落库但响应丢失；从权威列表确认，而不是重复创建。
          if (!request.active()) return;
          const current = await fetchDashboard(signal);
          categoryId = current.categories.find((cat) => cat.name.toLowerCase() === categoryKey)?.id;
          if (!categoryId) throw cause;
        }
        createdCategories.current.set(categoryKey, categoryId);
      }
      if (!request.active()) return;
      await createDeck(categoryId, trimmedName, signal);
      if (request.active()) onDone('卡片库已创建。');
    } catch (cause) {
      if (request.active()) setError(cause instanceof Error ? cause.message : '创建失败，请重试。');
    } finally {
      request.finish();
      if (request.active()) setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="block">
        <span className="text-xs text-zinc-500">卡片库名称</span>
        <input
          ref={nameRef}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={50}
          required
          className="anki-input mt-1"
          placeholder="例如：Go 并发编程"
        />
      </label>
      <label className="block">
        <span className="text-xs text-zinc-500">所属分类</span>
        <input
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          maxLength={30}
          required
          list="anki-category-options"
          className="anki-input mt-1"
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
        <button
          type="button"
          className="rounded-full border border-[#e9edf1] bg-white px-[17px] py-[9px] text-sm font-medium text-[#202124] inline-flex items-center justify-center gap-2 whitespace-nowrap"
          onClick={onClose}
        >
          取消
        </button>
        <button
          type="submit"
          className="rounded-full border border-[#087ae9] bg-[#087ae9] px-[17px] py-[9px] text-sm font-medium text-white inline-flex items-center justify-center gap-2 whitespace-nowrap"
          disabled={busy}
        >
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
  const [deckId, setDeckId] = useState(editing?.deckId ?? state.deckId ?? dashboard.decks[0]?.id ?? '');
  const [question, setQuestion] = useState(editing?.question ?? '');
  const [answer, setAnswer] = useState(editing?.answer ?? '');
  const [tags, setTags] = useState<string[]>(editing?.tags ?? []);
  const [tagsReady, setTagsReady] = useState(false);
  const [resetProgress, setResetProgress] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useFormRequest();
  const firstRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    // 校验空白但保留源码缩进/尾部换行，避免破坏缩进代码块等 Markdown 语义。
    const q = question;
    const a = answer;
    if (!q.trim() || !a.trim()) {
      setError('问题和答案不能为空或仅为空格。');
      return;
    }
    if (!tagsReady) {
      setError('标签目录尚未加载，请重试后保存。');
      return;
    }
    if (tags.length > 20 || tags.some((tag) => [...tag].length > 30 || /[\t]/.test(tag))) {
      setError('最多添加 20 个标签，每个标签不超过 30 个字且不能含制表符。');
      return;
    }
    if (!deckId) {
      setError('请先创建一个卡片库。');
      return;
    }
    const signal = request.begin();
    if (!signal) return;
    setBusy(true);
    setError('');
    try {
      if (editing) {
        await updateCard(
          editing.id,
          { deckId, question: q, answer: a, tags, resetProgress, version: editing.version },
          signal,
        );
        if (request.active())
          onDone(resetProgress ? '卡片已保存，已重新学习，历史记录保留。' : '卡片已保存，复习排期已保留。');
      } else {
        await createCard(deckId, q, a, signal, tags);
        if (request.active()) onDone('卡片已录入。');
      }
    } catch (cause) {
      if (request.active()) setError(cause instanceof Error ? cause.message : '保存失败，请重试。');
    } finally {
      request.finish();
      if (request.active()) setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="anki-card-form mt-4 space-y-5">
      <label className="block">
        <span className="text-xs text-zinc-500">所属卡片库</span>
        <select
          value={deckId}
          onChange={(event) => {
            setDeckId(event.target.value);
            setTags([]);
            setTagsReady(false);
          }}
          required
          className="anki-input mt-1"
        >
          {dashboard.decks.length === 0 && <option value="">请先创建卡片库</option>}
          {dashboard.decks.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.name}
            </option>
          ))}
        </select>
      </label>
      <AnkiTagPicker deckId={deckId} value={tags} onChange={setTags} disabled={busy} onReady={setTagsReady} />
      <AnkiMarkdownEditor
        label="Q · 问题"
        inputRef={firstRef}
        value={question}
        onChange={setQuestion}
        maxLength={3000}
        rows={7}
        placeholder="写下一个具体的问题，可使用 **加粗**、列表或代码块"
      />
      <AnkiMarkdownEditor
        label="A · 答案"
        value={answer}
        onChange={setAnswer}
        maxLength={10000}
        rows={14}
        placeholder="写下便于核对的答案，可使用标题、列表、表格或代码块"
      />
      {editing && (
        <label className="flex items-center gap-2 text-sm text-zinc-500">
          <input type="checkbox" checked={resetProgress} onChange={(event) => setResetProgress(event.target.checked)} />
          重新学习这张卡片（保留历史记录，默认保留排期）
        </label>
      )}
      <p className="text-xs text-zinc-400">
        以 Markdown 源码保存；支持标题、加粗、==高亮==、列表、引用、链接、表格和代码块，不执行 HTML；答案默认隐藏。
      </p>
      <FieldError message={error} />
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          className="rounded-full border border-[#e9edf1] bg-white px-[17px] py-[9px] text-sm font-medium text-[#202124] inline-flex items-center justify-center gap-2 whitespace-nowrap"
          onClick={onClose}
        >
          取消
        </button>
        <button
          type="submit"
          className="rounded-full border border-[#087ae9] bg-[#087ae9] px-[17px] py-[9px] text-sm font-medium text-white inline-flex items-center justify-center gap-2 whitespace-nowrap"
          disabled={busy}
        >
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
  const request = useFormRequest();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(goal);
    if (!Number.isInteger(value) || value < 1 || value > 500) {
      setError('目标应为 1–500 之间的整数。');
      return;
    }
    const signal = request.begin();
    if (!signal) return;
    setBusy(true);
    setError('');
    try {
      await updateGoal(value, signal);
      if (request.active()) onDone('每日目标已更新。');
    } catch (cause) {
      if (request.active()) setError(cause instanceof Error ? cause.message : '保存失败，请重试。');
    } finally {
      request.finish();
      if (request.active()) setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="block">
        <span className="text-xs text-zinc-500">每天想练习多少张不同卡片？</span>
        <input
          type="number"
          min={1}
          max={500}
          step={1}
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          required
          className="anki-input mt-1"
        />
      </label>
      <p className="text-xs text-zinc-400">目标只影响展示，不限制练习；重复评价同一卡片只计一张完成量。</p>
      <FieldError message={error} />
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          className="rounded-full border border-[#e9edf1] bg-white px-[17px] py-[9px] text-sm font-medium text-[#202124] inline-flex items-center justify-center gap-2 whitespace-nowrap"
          onClick={onClose}
        >
          取消
        </button>
        <button
          type="submit"
          className="rounded-full border border-[#087ae9] bg-[#087ae9] px-[17px] py-[9px] text-sm font-medium text-white inline-flex items-center justify-center gap-2 whitespace-nowrap"
          disabled={busy}
        >
          保存目标
        </button>
      </div>
    </form>
  );
}
