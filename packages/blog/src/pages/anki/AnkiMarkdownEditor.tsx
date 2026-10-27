import { useId, type RefObject } from 'react';
import { AnkiMarkdown } from './AnkiMarkdown';

/** 源码与预览始终并存，输入即时同步；不修改源码、不发网络请求。 */
export function AnkiMarkdownEditor({
  label,
  value,
  onChange,
  maxLength,
  rows,
  placeholder,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  rows: number;
  placeholder: string;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const id = useId();
  return (
    <section className="anki-editor-field" aria-label={`${label} 编辑与实时预览`}>
      <div className="anki-editor-column">
        <label htmlFor={id} className="anki-editor-label">
          {label} · Markdown 源码
        </label>
        <textarea
          id={id}
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={maxLength}
          required
          rows={rows}
          className="anki-input anki-editor-source"
          placeholder={placeholder}
          aria-describedby={`${id}-hint`}
          aria-label={label}
        />
        <p id={`${id}-hint`} className="mt-1 text-xs text-zinc-400">
          {value.length}/{maxLength} · 输入后自动预览
        </p>
      </div>
      <div className="anki-editor-column">
        <span className="anki-editor-label">{label} · 实时预览</span>
        <div role="region" aria-label={`${label} Markdown 预览`} className="anki-preview" aria-live="off">
          {value.trim() ? (
            <AnkiMarkdown content={value} />
          ) : (
            <p className="text-sm text-zinc-400">还没有内容，请先编辑。</p>
          )}
        </div>
      </div>
    </section>
  );
}
