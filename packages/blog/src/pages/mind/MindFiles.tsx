import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Code2, Download, Upload, X } from 'lucide-react';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { downloadMindFile, MAX_MIND_FILE_BYTES, parseMindFile, serializeMindFile, type MindFileFormat } from './files';
import type { MindState } from './model';

interface DialogProps {
  initialState?: MindState;
  onClose: () => void;
  onApply: (state: MindState) => boolean | Promise<boolean>;
  busy?: boolean;
  portalTarget?: HTMLElement | null;
}

export function MindFileDialog({ initialState, onClose, onApply, busy = false, portalTarget }: DialogProps) {
  const [format, setFormat] = useState<MindFileFormat>('json');
  const [source, setSource] = useState(() => (initialState ? serializeMindFile(initialState, 'json') : ''));
  const original = useRef(source);
  const dirty = source !== original.current;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reading, setReading] = useState(false);
  const [applying, setApplying] = useState(false);
  const live = useRef(false);
  const generation = useRef(0);
  const applyingRef = useRef(false);
  const parsed = useRef<{ source: string; format: MindFileFormat; state: MindState } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const helpId = useId();
  const discard = () => !dirty || window.confirm('源码修改尚未应用到导图，放弃这些修改？');
  const close = () => {
    if (!reading && !applyingRef.current && !busy && discard()) onClose();
  };
  useModalOverlay({ isOpen: true, onClose: close, containerRef: container, initialFocusRef: textarea });
  useEffect(() => {
    const epochRef = generation;
    live.current = true;
    return () => {
      live.current = false;
      epochRef.current++;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);
  const selectFormat = (next: MindFileFormat) => {
    if (next === format || !discard()) return;
    generation.current++;
    setReading(false);
    setFormat(next);
    const text = initialState ? serializeMindFile(initialState, next) : '';
    original.current = text;
    setSource(text);
    setError('');
    setNotice('');
  };
  const readFile = async (file?: File) => {
    if (!file || !discard()) return;
    const next = /\.json$/i.test(file.name) ? 'json' : /\.(md|markdown)$/i.test(file.name) ? 'markdown' : null;
    if (!next) {
      setError('请选择 .json、.md 或 .markdown 文件');
      return;
    }
    if (file.size > MAX_MIND_FILE_BYTES) {
      setError('文件不能超过 2 MiB');
      return;
    }
    const epoch = ++generation.current;
    setReading(true);
    setError('');
    setNotice('');
    try {
      const text = await file.text();
      if (!live.current || epoch !== generation.current) return;
      setFormat(next);
      setSource(text);
      // A loaded file is an unapplied draft, including on an empty import dialog.
      original.current = '';
      if (!text) setError('文件内容为空');
    } catch {
      if (live.current && epoch === generation.current) setError('文件读取失败，请重新选择');
    } finally {
      if (live.current && epoch === generation.current) setReading(false);
    }
  };
  const validate = () => {
    try {
      const state =
        parsed.current?.source === source && parsed.current.format === format
          ? parsed.current.state
          : parseMindFile(source, format);
      parsed.current = { source, format, state };
      setError('');
      setNotice(`校验通过 · ${state.nodes.length} 个主题 · ${state.title}`);
      return state;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '文件格式无效');
      setNotice('');
      return null;
    }
  };
  const apply = async () => {
    if (applyingRef.current || reading || busy) return;
    const state = validate();
    if (!state) return;
    applyingRef.current = true;
    setApplying(true);
    try {
      if (await onApply(state)) {
        if (live.current) onClose();
      } else if (live.current) setError('未能应用，请查看保存提示并重试；源码已保留');
    } catch (cause) {
      if (live.current) setError(cause instanceof Error ? cause.message : '应用失败，源码已保留');
    } finally {
      applyingRef.current = false;
      if (live.current) setApplying(false);
    }
  };
  const disabled = busy || reading || applying;
  return createPortal(
    <div className="mind-page mind-file-overlay" onClick={(event) => event.target === event.currentTarget && close()}>
      <div ref={container} className="mind-file-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <h2 id={titleId}>{initialState ? '导图文件与源码' : '导入导图'}</h2>
          <button type="button" className="mind-icon" aria-label="关闭文件编辑" onClick={close} disabled={disabled}>
            <X size={18} />
          </button>
        </header>
        <div className="mind-file-actions">
          <label>
            格式
            <select
              aria-label="导图文件格式"
              value={format}
              onChange={(event) => selectFormat(event.target.value as MindFileFormat)}
              disabled={disabled}
            >
              <option value="json">JSON · 完整导图</option>
              <option value="markdown">Markdown · 文本大纲</option>
            </select>
          </label>
          <label className={`mind-file-upload${disabled ? ' is-disabled' : ''}`}>
            <Upload size={15} />
            读取文件
            <input
              type="file"
              aria-label="读取导图文件"
              accept=".json,.md,.markdown,application/json,text/markdown"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void readFile(file);
              }}
            />
          </label>
          {initialState && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                try {
                  downloadMindFile(initialState, format);
                  setNotice('已导出当前导图；源码草稿需应用后才会包含在导出文件中');
                  setError('');
                } catch {
                  setError('下载失败，请重试');
                }
              }}
            >
              <Download size={15} />
              导出 {format === 'json' ? 'JSON' : 'Markdown'}
            </button>
          )}
        </div>
        <p id={helpId} className="mind-file-help">
          {format === 'json'
            ? 'JSON 保留文字、层级、节点 ID、标记、颜色、布局与视角。可在代码编辑器中修改后重新导入。'
            : 'Markdown 保留文字和层级；重新生成节点 ID、配色、布局与视角，不保留标记。使用 # 标题、- 主题，每层缩进两个空格，换行用 <br />。'}
        </p>
        <textarea
          ref={textarea}
          aria-label="导图源码"
          aria-describedby={helpId}
          value={source}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          placeholder={
            format === 'json'
              ? '粘贴完整导图 JSON，或读取导出的文件'
              : '# 我的导图\n\n- 中心主题\n  - 子主题\n    - 下一层主题'
          }
          onChange={(event) => {
            generation.current++;
            setSource(event.target.value);
            setError('');
            setNotice('');
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
          }}
        />
        {error && (
          <p className="mind-file-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="mind-file-help" role="status">
            {notice}
          </p>
        )}
        <footer>
          <span>{reading ? '正在读取…' : initialState ? '应用后自动保存，可撤销' : '导入为当前账号的新导图'}</span>
          <button type="button" onClick={validate} disabled={disabled}>
            校验
          </button>
          <button type="button" className="mind-file-apply" onClick={() => void apply()} disabled={disabled}>
            {applying || busy ? '正在应用…' : initialState ? '应用到当前导图' : '导入为新导图'}
          </button>
        </footer>
      </div>
    </div>,
    portalTarget ?? document.body,
  );
}

export function MindFiles({
  getState,
  onReplace,
  busy,
  portalTarget,
}: {
  getState: () => MindState;
  onReplace: (state: MindState) => void;
  busy: boolean;
  portalTarget?: HTMLElement | null;
}) {
  const [base, setBase] = useState<MindState | null>(null);
  return (
    <>
      <button
        type="button"
        className="mind-icon"
        aria-label="导图文件与源码"
        title="导入、导出与源码编辑"
        disabled={busy}
        onClick={() => setBase(getState())}
      >
        <Code2 size={18} />
      </button>
      {base && (
        <MindFileDialog
          initialState={base}
          onClose={() => setBase(null)}
          busy={busy}
          portalTarget={portalTarget}
          onApply={(next) => {
            if (JSON.stringify(getState()) !== JSON.stringify(base))
              throw new Error('当前导图在打开源码后发生了变化。请保留源码并重新打开，避免覆盖新修改');
            onReplace(next);
            return true;
          }}
        />
      )}
    </>
  );
}
