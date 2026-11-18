import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Plus, Trash2, X } from 'lucide-react';
import { MAX_DOCUMENTS, type DraftDocument, type DraftLibrary } from './model';
import { copyDocument, newDocument } from './library';

export default function Drafts({
  library,
  onChange,
  children,
}: {
  library: DraftLibrary;
  onChange: (library: DraftLibrary) => void;
  children: (
    doc: DraftDocument,
    update: (doc: DraftDocument) => void,
    onCommentDraft: (pending: boolean) => void,
  ) => React.ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const selected = params.get('document');
  const doc = library.documents.find((item) => item.id === selected) ?? library.documents[0];
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState(false);
  const [filter, setFilter] = useState('');
  const [pendingComment, setPendingComment] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (creating) titleRef.current?.focus();
  }, [creating]);
  const select = (id: string, force = false) => {
    if (!force && id !== doc?.id && pendingComment && !window.confirm('当前评论尚未提交。放弃评论输入并切换定稿？'))
      return false;
    setParams(
      (current) => {
        current.set('document', id);
        return current;
      },
      { replace: true },
    );
    setPendingComment(false);
    return true;
  };
  const update = (next: DraftDocument) =>
    onChange({ version: 2, documents: library.documents.map((item) => (item.id === next.id ? next : item)) });
  const add = (next: DraftDocument) => {
    if (!select(next.id)) return;
    onChange({ version: 2, documents: [...library.documents, next] });
    setFilter('');
    setCreating(false);
    setTitle('');
    selectRef.current?.focus();
  };
  const close = () => {
    setCreating(false);
    createRef.current?.focus();
  };
  const visible = library.documents.filter((item) => item.title.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <>
      <div className="draft-library-bar">
        <label className="sr-only" htmlFor="draft-select">
          选择定稿
        </label>
        <select
          ref={selectRef}
          id="draft-select"
          value={doc?.id ?? ''}
          onChange={(event) => select(event.target.value)}
        >
          {!doc && <option value="">暂无定稿</option>}
          {library.documents.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <input
          aria-label="搜索定稿"
          type="search"
          placeholder="搜索定稿"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <span className="draft-count">{library.documents.length} 份</span>
        <button
          ref={createRef}
          className="resume-button"
          type="button"
          disabled={library.documents.length >= MAX_DOCUMENTS}
          onClick={() => setCreating(true)}
        >
          <Plus size={15} aria-hidden="true" />
          新建定稿
        </button>
      </div>
      {filter && (
        <div className="draft-results" aria-label="定稿搜索结果">
          {visible.length ? (
            visible.map((item) => (
              <button
                className="resume-button"
                type="button"
                key={item.id}
                aria-pressed={doc?.id === item.id}
                onClick={() => {
                  select(item.id);
                  setFilter('');
                }}
              >
                {item.title}
              </button>
            ))
          ) : (
            <p role="status">没有匹配的定稿。</p>
          )}
        </div>
      )}
      {creating && (
        <form
          className="draft-create"
          onSubmit={(event) => {
            event.preventDefault();
            if (library.documents.length < MAX_DOCUMENTS) add(newDocument(title, template));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
        >
          <input
            ref={titleRef}
            aria-label="新定稿名称"
            placeholder="例如：项目面试主稿"
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <label>
            <input type="checkbox" checked={template} onChange={(event) => setTemplate(event.target.checked)} />
            填入面试提纲
          </label>
          <button type="submit" className="resume-button">
            创建
          </button>
          <button type="button" className="resume-button" aria-label="取消新建定稿" onClick={close}>
            <X size={15} />
          </button>
        </form>
      )}
      {doc ? (
        <>
          <div className="draft-document-meta">
            <input
              aria-label="定稿名称"
              value={doc.title}
              maxLength={120}
              onChange={(event) => {
                if (event.target.value.trim()) update({ ...doc, title: event.target.value });
              }}
            />
            <button
              className="resume-button"
              type="button"
              disabled={library.documents.length >= MAX_DOCUMENTS}
              onClick={() => add(copyDocument(doc))}
            >
              <Copy size={14} aria-hidden="true" />
              复制
            </button>
            <button
              className="resume-button"
              type="button"
              onClick={() => {
                if (!window.confirm(`删除「${doc.title}」及其评论？请先备份需要保留的内容。`)) return;
                const next = library.documents.filter((item) => item.id !== doc.id);
                onChange({ version: 2, documents: next });
                select(next[0]?.id ?? '', true);
                selectRef.current?.focus();
              }}
            >
              <Trash2 size={14} aria-hidden="true" />
              删除
            </button>
          </div>
          {children(doc, update, setPendingComment)}
        </>
      ) : (
        <p className="resume-access">新建一份定稿，也可以在创建后导入 Markdown。</p>
      )}
    </>
  );
}
