import { useRef, useState, type FormEvent } from 'react';
import { Feather } from 'lucide-react';
import { validCategoryName, type ConfessionEntry, type ConfessionState } from './model';
export function NewTombstone({
  state,
  busy,
  onSave,
}: {
  state: ConfessionState;
  busy: boolean;
  onSave: (state: ConfessionState) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const draft = useRef<{ name: string; id: string } | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = name.trim();
    if (!validCategoryName(text)) {
      setError('请填写1–24字的分类名称');
      return;
    }
    if (state.categories.some((category) => category.name === text && category.id !== draft.current?.id)) {
      setError('这座墓碑已经存在');
      return;
    }
    try {
      if (draft.current?.name !== text) draft.current = { name: text, id: crypto.randomUUID() };
      await onSave({
        ...state,
        categories: [
          ...state.categories.filter((category) => category.id !== draft.current?.id),
          { id: draft.current.id, name: text },
        ],
      });
    } catch {
      setError('无法创建墓碑，请重试');
    }
  };
  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      className="confession-form"
    >
      <p>为已经归档的过错，留一个名字。墓碑是一种分类，不是对自己的判决。</p>
      <label htmlFor="confession-category-name">墓碑名称</label>
      <input
        id="confession-category-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="例如：放弃、失败、贪吃、暴怒"
        maxLength={24}
        required
        disabled={busy}
      />
      <p className="confession-form-error" role="status">
        {error}
      </p>
      <button type="submit" className="confession-primary" disabled={busy || state.categories.length >= 100}>
        {busy ? '保存中…' : '立一座墓碑'}
      </button>
    </form>
  );
}
export function ConfessionEntryForm({
  state,
  busy,
  initialCategory,
  onSave,
}: {
  state: ConfessionState;
  busy: boolean;
  initialCategory?: string;
  onSave: (state: ConfessionState) => Promise<boolean>;
}) {
  const [categoryId, setCategoryId] = useState(initialCategory ?? state.categories[0]?.id ?? '');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const draft = useRef<ConfessionEntry | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = content.trim();
    if (!text || [...text].length > 10000) {
      setError('请写下1–10000字的内容');
      return;
    }
    if (!state.categories.some((category) => category.id === categoryId)) {
      setError('请先选择或新增一座墓碑');
      return;
    }
    try {
      if (draft.current?.content !== text || draft.current?.categoryId !== categoryId)
        draft.current = { id: crypto.randomUUID(), categoryId, content: text, createdAt: new Date().toISOString() };
      await onSave({
        ...state,
        entries: [...state.entries.filter((entry) => entry.id !== draft.current?.id), draft.current],
      });
    } catch {
      setError('无法保存记录，输入仍保留，请重试');
    }
  };
  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      className="confession-form"
    >
      <p>不用组织成完美的句子。把今天想说的，写在这里。</p>
      <label htmlFor="confession-entry-category">归入哪座墓碑</label>
      <select
        id="confession-entry-category"
        value={categoryId}
        onChange={(event) => setCategoryId(event.target.value)}
        disabled={busy}
        required
      >
        {state.categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <label htmlFor="confession-content">你的记事</label>
      <textarea
        id="confession-content"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={7}
        maxLength={10000}
        required
        disabled={busy}
        placeholder="我今天想忏悔的是…"
      />
      <div className="confession-form-foot">
        <span>仅本人可见 · 不在本机留存内容</span>
        <span>{[...content].length} / 10000</span>
      </div>
      <p className="confession-form-error" role="status">
        {error}
      </p>
      <button type="submit" className="confession-primary" disabled={busy || state.entries.length >= 2000}>
        <Feather size={16} />
        {busy ? '保存中…' : '写下，归档'}
      </button>
    </form>
  );
}
