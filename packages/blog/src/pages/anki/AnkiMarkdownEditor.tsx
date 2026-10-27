import { useId, useState, type RefObject } from 'react';
import { AnkiMarkdown } from './AnkiMarkdown';

/** 直接编辑 Markdown 源码，切换预览不丢失草稿；预览态保留原生表单校验。 */
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
  const [preview, setPreview] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-xs text-zinc-500">
          {label}
        </label>
        <button
          type="button"
          aria-pressed={preview}
          aria-label={`${preview ? '继续编辑' : '预览 Markdown'} · ${label}`}
          aria-controls={preview ? `${id}-preview` : undefined}
          className="min-h-9 text-xs font-medium text-sky-600"
          onClick={() => setPreview((current) => !current)}
        >
          {preview ? '继续编辑' : '预览 Markdown'}
          <span className="sr-only"> · {label}</span>
        </button>
      </div>
      <textarea
        id={id}
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        required
        rows={rows}
        className={preview ? 'sr-only' : 'anki-input font-mono'}
        placeholder={placeholder}
        aria-describedby={`${id}-hint`}
        tabIndex={preview ? -1 : undefined}
        onInvalid={() => setPreview(false)}
      />
      {preview && (
        <div id={`${id}-preview`} role="region" aria-label={`${label} Markdown 预览`} className="anki-preview">
          {value.trim() ? (
            <AnkiMarkdown content={value} />
          ) : (
            <p className="text-sm text-zinc-400">还没有内容，请先编辑。</p>
          )}
        </div>
      )}
      <p id={`${id}-hint`} className="mt-1 text-xs text-zinc-400">
        支持 Markdown · {value.length}/{maxLength}
      </p>
    </div>
  );
}
