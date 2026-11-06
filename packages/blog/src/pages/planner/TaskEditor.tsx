import { useRef, useState, type FormEvent } from 'react';
import { Trash2, X } from 'lucide-react';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { CATEGORIES, PRIORITIES, type TaskCategory, type TaskPriority } from './model';
import { validDate } from './daily-model';

export type TaskFields = { text: string; category: TaskCategory; priority: TaskPriority; date: string; note: string };
export function TaskEditor({
  daily,
  editing,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  daily: boolean;
  editing: boolean;
  initial: TaskFields;
  onClose: () => void;
  onSave: (fields: TaskFields) => void;
  onDelete?: () => void;
}) {
  const [fields, setFields] = useState(initial);
  const [error, setError] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useModalOverlay({ isOpen: true, onClose, containerRef: container, initialFocusRef: input });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!fields.text.trim() || (daily && !validDate(fields.date))) {
      setError('请填写任务名称和有效日期');
      return;
    }
    try {
      onSave({ ...fields, text: fields.text.trim(), note: fields.note.trim() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '任务保存失败');
    }
  };
  return (
    <div
      className="planner-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="planner-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planner-editor-title"
        ref={container}
        tabIndex={-1}
      >
        <header>
          <h2 id="planner-editor-title">
            {editing ? '编辑' : '新增'}
            {daily ? '每日遗留' : '月度目标'}
          </h2>
          <button className="planner-icon" aria-label="关闭编辑" onClick={onClose}>
            <X />
          </button>
        </header>
        <p className="planner-muted">
          {daily ? '记下还没完成的事，保留来源日期，之后再从容处理。' : '把目标写具体一点，让这个月的方向更清晰。'}
        </p>
        <form onSubmit={submit}>
          <label>
            任务名称
            <input
              ref={input}
              required
              maxLength={500}
              value={fields.text}
              onChange={(e) => setFields({ ...fields, text: e.target.value })}
            />
          </label>
          <div className="planner-field-row">
            {daily ? (
              <label>
                来源日期
                <input
                  type="date"
                  min="1970-01-01"
                  max="9999-12-31"
                  required
                  value={fields.date}
                  onChange={(e) => setFields({ ...fields, date: e.target.value })}
                />
              </label>
            ) : (
              <label>
                分类
                <select
                  value={fields.category}
                  onChange={(e) => setFields({ ...fields, category: e.target.value as TaskCategory })}
                >
                  {Object.entries(CATEGORIES).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              优先级
              <select
                value={fields.priority}
                onChange={(e) => setFields({ ...fields, priority: e.target.value as TaskPriority })}
              >
                {Object.entries(PRIORITIES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {daily && (
            <label>
              补充说明
              <textarea
                maxLength={1000}
                value={fields.note}
                onChange={(e) => setFields({ ...fields, note: e.target.value })}
                placeholder="卡在哪里？下一步可以做什么？"
              />
            </label>
          )}
          {error && (
            <p role="alert" className="planner-error">
              {error}
            </p>
          )}
          <footer>
            {onDelete ? (
              <button type="button" className="planner-button planner-danger" onClick={onDelete}>
                <Trash2 />
                删除
              </button>
            ) : (
              <span />
            )}
            <div>
              <button type="button" className="planner-button" onClick={onClose}>
                取消
              </button>
              <button className="planner-button planner-primary" type="submit">
                保存任务
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
