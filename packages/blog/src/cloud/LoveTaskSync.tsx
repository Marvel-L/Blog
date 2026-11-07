import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cloud, RefreshCw, X } from 'lucide-react';
import { hasOpenOverlay } from '@/hooks/useModalOverlay';
import type { useLoveTasks } from './useLoveTasks';

export function LoveTaskSync({
  tasks,
  onConfirmed,
}: {
  tasks: ReturnType<typeof useLoveTasks>;
  onConfirmed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const orb = useRef<HTMLButtonElement>(null);
  const failed = Boolean(tasks.error || tasks.conflict);
  const synced = tasks.syncedAt !== null && !tasks.busy && !tasks.pending && !failed;
  const status = tasks.conflict
    ? '存在版本冲突'
    : failed
      ? '同步需要重试'
      : tasks.busy
        ? '正在同步'
        : tasks.pending
          ? '有修改待上传'
          : synced
            ? '已同步到云端'
            : '等待同步';
  const close = () => {
    setOpen(false);
    orb.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !orb.current?.contains(event.target)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !hasOpenOverlay()) {
        setOpen(false);
        orb.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return createPortal(
    <section className="love-tasks love-sync-float" aria-label="必做云端同步">
      <button
        ref={orb}
        type="button"
        className={`love-sync-orb ${tasks.busy ? 'is-busy' : ''} ${failed ? 'is-error' : ''} ${synced ? 'is-synced' : ''} ${tasks.pending ? 'is-pending' : ''}`}
        aria-label={`云端同步：${status}`}
        title={status}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {tasks.busy ? <RefreshCw aria-hidden="true" /> : <Cloud aria-hidden="true" />}
        <i aria-hidden="true" />
      </button>
      {!open && (
        <span className="sr-only" role="status" aria-live="polite">
          {tasks.error || status}
        </span>
      )}
      {open && (
        <div ref={panel} id={panelId} className="love-sync-panel" role="region" aria-label="云端同步详情" tabIndex={-1}>
          <header>
            <h2>云端同步</h2>
            <button type="button" className="love-sync-close" aria-label="关闭同步详情" onClick={close}>
              <X size={17} aria-hidden="true" />
            </button>
          </header>
          <div className="love-sync-copy">
            <Cloud size={19} aria-hidden="true" />
            <div>
              <strong>{tasks.user?.name || tasks.user?.login}</strong>
              <span role="status" aria-live="polite">
                {status}
              </span>
            </div>
          </div>
          {tasks.error && (
            <p className="love-sync-error" role="alert">
              {tasks.error}
            </p>
          )}
          <div className="love-sync-actions">
            {tasks.conflict ? (
              <button
                type="button"
                className="love-tasks-button"
                disabled={tasks.busy}
                onClick={() => void tasks.reload()}
              >
                读取云端版本
              </button>
            ) : (
              <button
                type="button"
                className="love-tasks-primary"
                disabled={tasks.busy}
                onClick={() => {
                  const saving = tasks.pending;
                  void tasks.sync().then((saved) => {
                    if (saving && saved) onConfirmed();
                  });
                }}
              >
                <RefreshCw size={14} aria-hidden="true" />
                {tasks.pending ? '重试保存' : failed ? '重试同步' : '立即同步'}
              </button>
            )}
          </div>
          <p className="love-sync-note">修改后自动保存，大事项和小任务同步到你的账号。</p>
          {tasks.syncedAt !== null && (
            <p className="love-sync-note">
              最近确认：{new Date(tasks.syncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}
    </section>,
    document.body,
  );
}
