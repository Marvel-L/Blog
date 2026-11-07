import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Heart, LogIn, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { useLoveTasks } from './useLoveTasks';
import { LoveTaskSync } from './LoveTaskSync';
import {
  addLoveGroup,
  loveTaskDay,
  removeLoveGroup,
  updateLoveGroup,
  updateLoveTask,
  validLoveText,
  type LoveGroup,
  type LoveTask,
} from './love-task-model';
import '@/styles/loveTasks.css';

const views = [
  ['all', '全部'],
  ['open', '待完成'],
  ['done', '已完成'],
] as const;
type Tasks = ReturnType<typeof useLoveTasks>;
const openAccount = () => window.dispatchEvent(new Event('dblog-account-open'));
const newTask = (): LoveTask => ({
  id: crypto.randomUUID(),
  text: '',
  note: '',
  createdOn: loveTaskDay(new Date()),
  completedOn: null,
});
const newGroup = (): LoveGroup => ({
  id: crypto.randomUUID(),
  text: '',
  note: '',
  createdOn: loveTaskDay(new Date()),
  tasks: [newTask()],
});

export default function LoveTasks() {
  const tasks = useLoveTasks();
  return (
    <div className="love-tasks love-tasks-page mx-auto max-w-4xl pb-24">
      <Seo title="必做 · Love" description="记录想和你一起完成的一生清单。" noindex />
      {tasks.loading ? (
        <p role="status" className="love-tasks-message">
          正在检查账号与必做清单…
        </p>
      ) : !tasks.user ? (
        <div className="love-tasks-surface love-tasks-gate">
          <Heart size={28} aria-hidden="true" />
          <span>登录后可以记录大事项和小任务，清单会保存在你的账号中。</span>
          <button type="button" className="love-tasks-primary" onClick={openAccount}>
            <LogIn size={16} aria-hidden="true" /> 登录后记录
          </button>
          {tasks.error && <p role="alert">{tasks.error}</p>}
          {tasks.error && (
            <button type="button" className="love-tasks-button" onClick={() => void tasks.reload()}>
              重新检查
            </button>
          )}
        </div>
      ) : !tasks.snapshot ? (
        <div className="love-tasks-surface love-tasks-gate">
          <p role="alert">{tasks.error || '清单暂时不可用'}</p>
          <button type="button" className="love-tasks-button" onClick={() => void tasks.reload()}>
            重新加载
          </button>
        </div>
      ) : (
        <TaskList key={tasks.user.id} tasks={tasks} />
      )}
    </div>
  );
}

function SaveFeedback({ tasks, onConfirmed }: { tasks: Tasks; onConfirmed: () => void }) {
  if (!tasks.error) return null;
  return (
    <div className="love-tasks-error">
      <p role="alert">{tasks.error}</p>
      {tasks.pending && !tasks.conflict && (
        <button
          type="button"
          className="love-tasks-button"
          disabled={tasks.busy}
          onClick={() => void tasks.retry().then((saved) => saved && onConfirmed())}
        >
          重试保存
        </button>
      )}
      {tasks.conflict && (
        <button type="button" className="love-tasks-button" disabled={tasks.busy} onClick={() => void tasks.reload()}>
          读取云端版本
        </button>
      )}
    </div>
  );
}

function TaskList({ tasks }: { tasks: Tasks }) {
  const groups = tasks.snapshot!.state?.groups ?? [];
  const [view, setView] = useState<(typeof views)[number][0]>('all');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [editing, setEditing] = useState<{ group: LoveGroup; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const mounted = useRef(false);
  const editorGroupId = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const disabled = tasks.busy || tasks.pending;
  const activeGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0];
  const children = activeGroup?.tasks ?? [];
  const done = children.filter((task) => task.completedOn !== null).length;
  const selected = activeGroup
    ? [
        {
          group: activeGroup,
          children: children.filter(
            (task) => view === 'all' || (view === 'done' ? task.completedOn !== null : task.completedOn === null),
          ),
        },
      ]
    : [];
  const confirmed = () => {
    if (!mounted.current) return;
    if (editorGroupId.current) {
      setSelectedGroupId(editorGroupId.current);
      setView('all');
    }
    editorGroupId.current = null;
    setEditing(null);
    setDeleting(null);
  };
  const edit = (group: LoveGroup, append = false) => {
    editorGroupId.current = group.id;
    setDeleting(null);
    setEditing({ isNew: false, group: append ? { ...group, tasks: [...group.tasks, newTask()] } : group });
  };
  return (
    <>
      {activeGroup && (
        <label className="love-group-selector">
          <span>大事项</span>
          <div className="love-group-select-control">
            <select
              aria-label="选择大事项"
              value={activeGroup.id}
              disabled={disabled}
              onChange={(event) => {
                setSelectedGroupId(event.target.value);
                setView('all');
                setDeleting(null);
              }}
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.text}
                </option>
              ))}
            </select>
            <ChevronDown size={17} aria-hidden="true" />
          </div>
        </label>
      )}
      <div className="love-tasks-toolbar">
        <nav className="love-tasks-filters" aria-label="必做任务筛选">
          {views.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>
              {label}
              <span>{key === 'all' ? children.length : key === 'done' ? done : children.length - done}</span>
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="love-tasks-primary"
          disabled={disabled}
          onClick={() => {
            const group = newGroup();
            editorGroupId.current = group.id;
            setDeleting(null);
            setEditing({ group, isNew: true });
          }}
        >
          <Plus size={16} aria-hidden="true" /> 添加
        </button>
      </div>
      {selected.length === 0 ? (
        <div className="love-tasks-empty">
          <Heart size={24} aria-hidden="true" />
          <p>
            {groups.length === 0
              ? '还没有记录，点击「添加」写下一个大事项和想一起完成的小任务。'
              : view === 'done'
                ? '完成的小任务会留在这里。'
                : '这一页的小任务都完成啦。'}
          </p>
        </div>
      ) : (
        <ul className="love-tasks-list">
          {selected.map(({ group, children: visibleChildren }) => {
            const groupDone = group.tasks.filter((task) => task.completedOn !== null).length;
            return (
              <li key={group.id} className="love-group">
                <div className="love-group-heading">
                  <div className="love-group-content">
                    <h2>{group.text}</h2>
                    {group.note && <p className="love-task-note">{group.note}</p>}
                    <span className={`love-group-progress ${groupDone === group.tasks.length ? 'is-complete' : ''}`}>
                      {groupDone === group.tasks.length && <Check size={13} aria-hidden="true" />}
                      {groupDone} / {group.tasks.length} 已完成
                    </span>
                  </div>
                  <div className="love-task-actions">
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`编辑：${group.text}`}
                      onClick={() => edit(group)}
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`删除：${group.text}`}
                      onClick={() => setDeleting(deleting === group.id ? null : group.id)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {visibleChildren.length === 0 ? (
                  <p className="love-group-empty">
                    {view === 'done' ? '这个大事项还没有已完成的小任务。' : '这个大事项的小任务都完成啦。'}
                  </p>
                ) : (
                  <ul className="love-group-children">
                    {visibleChildren.map((task) => (
                      <li key={task.id} className={`love-task ${task.completedOn ? 'love-task-done' : ''}`}>
                        <input
                          type="checkbox"
                          checked={task.completedOn !== null}
                          disabled={disabled}
                          aria-label={`${task.completedOn ? '撤销完成' : '标记完成'}：${task.text}`}
                          onChange={() =>
                            void tasks.mutate((value) =>
                              updateLoveTask(value, group.id, task.id, {
                                completedOn: task.completedOn ? null : loveTaskDay(new Date()),
                              }),
                            )
                          }
                        />
                        <div className="love-task-content">
                          <p className="love-task-title">{task.text}</p>
                          {task.note && <p className="love-task-note">{task.note}</p>}
                          {task.completedOn && (
                            <p className="love-task-date">
                              <Check size={12} aria-hidden="true" />
                              一起完成于 <time dateTime={task.completedOn}>{task.completedOn}</time>
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {deleting === group.id ? (
                  <div className="love-task-delete">
                    <span>删除这个大事项和其中的 {group.tasks.length} 个小任务？</span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        void tasks
                          .mutate((value) => removeLoveGroup(value, group.id))
                          .then((saved) => saved && confirmed())
                      }
                    >
                      确认删除
                    </button>
                    <button type="button" disabled={disabled} onClick={() => setDeleting(null)}>
                      保留
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="love-group-add"
                    disabled={disabled || group.tasks.length >= 100}
                    aria-label={`添加小任务：${group.text}`}
                    onClick={() => edit(group, true)}
                  >
                    <Plus size={14} aria-hidden="true" /> 添加小任务
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <LoveTaskSync tasks={tasks} onConfirmed={confirmed} />
      {editing && (
        <GroupEditor
          initial={editing.group}
          isNew={editing.isNew}
          tasks={tasks}
          onClose={() => {
            if (!tasks.pending) editorGroupId.current = null;
            setEditing(null);
          }}
          onConfirmed={confirmed}
        />
      )}
    </>
  );
}

function GroupEditor({
  initial,
  isNew,
  tasks,
  onClose,
  onConfirmed,
}: {
  initial: LoveGroup;
  isNew: boolean;
  tasks: Tasks;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [formError, setFormError] = useState('');
  const formId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const disabled = tasks.busy || tasks.pending;
  const close = () => {
    if (!tasks.busy) onClose();
  };
  useModalOverlay({ isOpen: true, onClose: close, containerRef: panel, initialFocusRef: input });
  const changeTask = (id: string, update: Partial<Pick<LoveTask, 'text' | 'note'>>) => {
    setFormError('');
    setDraft((value) => ({
      ...value,
      tasks: value.tasks.map((task) => (task.id === id ? { ...task, ...update } : task)),
    }));
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    const group = {
      ...draft,
      text: draft.text.trim(),
      note: draft.note.trim(),
      tasks: draft.tasks.map((task) => ({ ...task, text: task.text.trim(), note: task.note.trim() })),
    };
    if (!validLoveText(group.text) || group.tasks.some((task) => !validLoveText(task.text))) {
      setFormError('请为大事项和每个小任务填写 1–120 字的名称');
      return;
    }
    const saved = await tasks.mutate((state) => (isNew ? addLoveGroup(state, group) : updateLoveGroup(state, group)));
    if (saved) onConfirmed();
  };
  return createPortal(
    <div className="love-tasks love-tasks-overlay" onClick={(event) => event.target === event.currentTarget && close()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-heading`}
        tabIndex={-1}
        className="love-tasks-surface love-tasks-dialog"
      >
        <header className="love-tasks-dialog-heading">
          <h2 id={`${formId}-heading`}>{isNew ? '添加大事项' : '编辑大事项'}</h2>
          <button type="button" className="love-task-icon" aria-label="关闭弹窗" disabled={tasks.busy} onClick={close}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <form className="love-tasks-form" onSubmit={(event) => void submit(event)}>
          <div className="love-tasks-form-body">
            <label htmlFor={`${formId}-text`}>大事项</label>
            <input
              ref={input}
              id={`${formId}-text`}
              value={draft.text}
              maxLength={120}
              disabled={disabled}
              placeholder="例如：一起在深圳生活"
              required
              onChange={(event) => {
                setDraft({ ...draft, text: event.target.value });
                setFormError('');
              }}
            />
            <label className="love-tasks-note-label" htmlFor={`${formId}-note`}>
              备注 <span>（选填）</span>
            </label>
            <textarea
              id={`${formId}-note`}
              value={draft.note}
              maxLength={2000}
              disabled={disabled}
              rows={2}
              placeholder="记下约定、地点或想一起生活的时光…"
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            />
            <fieldset className="love-tasks-child-editor">
              <legend>
                小任务 <span>至少一项，可分别标记完成</span>
              </legend>
              {draft.tasks.map((task, index) => (
                <div key={task.id} className="love-tasks-child-input">
                  <div className="love-tasks-child-row">
                    <span className="love-tasks-child-number">{String(index + 1).padStart(2, '0')}</span>
                    <input
                      aria-label={`小任务 ${index + 1}`}
                      value={task.text}
                      maxLength={120}
                      disabled={disabled}
                      placeholder={index === 0 ? '例如：做一顿饭' : '例如：走一次公园'}
                      required
                      onChange={(event) => changeTask(task.id, { text: event.target.value })}
                    />
                    <button
                      type="button"
                      className="love-task-icon"
                      disabled={disabled || draft.tasks.length === 1}
                      aria-label={`移除小任务 ${index + 1}`}
                      onClick={() => setDraft({ ...draft, tasks: draft.tasks.filter((child) => child.id !== task.id) })}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <details className="love-tasks-child-note" open={task.note ? true : undefined}>
                    <summary>小任务备注</summary>
                    <textarea
                      aria-label={`小任务 ${index + 1} 备注`}
                      value={task.note}
                      maxLength={2000}
                      rows={2}
                      disabled={disabled}
                      onChange={(event) => changeTask(task.id, { note: event.target.value })}
                    />
                  </details>
                  {task.completedOn && <span className="love-task-date">已完成于 {task.completedOn}</span>}
                </div>
              ))}
              <button
                type="button"
                className="love-tasks-button"
                disabled={disabled || draft.tasks.length >= 100}
                onClick={() => setDraft({ ...draft, tasks: [...draft.tasks, newTask()] })}
              >
                <Plus size={15} aria-hidden="true" /> 再加一项
              </button>
            </fieldset>
            {formError && (
              <p role="alert" className="love-tasks-error">
                {formError}
              </p>
            )}
            <SaveFeedback tasks={tasks} onConfirmed={onConfirmed} />
          </div>
          <footer className="love-tasks-form-footer">
            <button type="button" className="love-tasks-button" disabled={tasks.busy} onClick={close}>
              取消
            </button>
            <button type="submit" className="love-tasks-primary" disabled={disabled}>
              <Check size={16} aria-hidden="true" />
              {tasks.busy ? '正在保存…' : isNew ? '保存事项' : '保存修改'}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
