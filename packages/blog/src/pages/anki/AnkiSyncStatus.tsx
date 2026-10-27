import { useEffect, useRef, useState } from 'react';
import { Cloud, LoaderCircle, X } from 'lucide-react';
import { ANKI_SYNC_EVENT, type AnkiSyncEvent } from './anki-api';

/** 新鲜度只表示本浏览器收到确认的时效，不改变事件触发的同步策略。 */
export const ANKI_SYNC_FRESH_MS = 5 * 60 * 1000;
const formatTime = (timestamp: number | null) =>
  timestamp === null ? '尚未收到云端确认' : new Date(timestamp).toLocaleString('zh-CN', { hour12: false });

export function AnkiSyncStatus({ onSync, disabled }: { onSync: () => void; disabled: boolean }) {
  const [lastConfirmed, setLastConfirmed] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [errors, setErrors] = useState<Array<{ path: string; write: boolean; message: string }>>([]);
  const pending = useRef(new Set<number>());
  const failures = useRef(new Map<string, { path: string; write: boolean; message: string }>());
  const manualPending = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const syncButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const requests = pending.current;
    const failedPaths = failures.current;
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<AnkiSyncEvent>).detail;
      if (!detail) return;
      if (detail.phase === 'pending') {
        pending.current.add(detail.id);
      } else {
        // 忽略 StrictMode、退出或组件重建前产生的请求结果。
        if (!pending.current.delete(detail.id)) return;
        if (detail.path === '/anki/dashboard') manualPending.current = false;
        if (detail.phase === 'success') {
          if (typeof detail.at === 'number' && Number.isFinite(detail.at)) {
            setLastConfirmed(detail.at);
            setStale(Date.now() - detail.at >= ANKI_SYNC_FRESH_MS);
          }
          failures.current.delete(detail.path);
        } else if (detail.phase === 'error') {
          failures.current.set(detail.path, {
            path: detail.path,
            write: detail.write,
            message: detail.message ?? '云端同步失败，请重试',
          });
        }
        setErrors([...failures.current.values()]);
      }
      setPendingCount(pending.current.size);
    };
    window.addEventListener(ANKI_SYNC_EVENT, onEvent);
    return () => {
      window.removeEventListener(ANKI_SYNC_EVENT, onEvent);
      requests.clear();
      failedPaths.clear();
      manualPending.current = false;
    };
  }, []);

  useEffect(() => {
    if (lastConfirmed === null) return;
    let timer: number | undefined;
    const updateFreshness = () => {
      window.clearTimeout(timer);
      const remaining = lastConfirmed + ANKI_SYNC_FRESH_MS - Date.now();
      setStale(remaining <= 0);
      if (remaining > 0) timer = window.setTimeout(updateFreshness, remaining);
    };
    updateFreshness();
    // 后台计时被节流时，回到页面重新校准；不发起任何上传或拉取。
    document.addEventListener('visibilitychange', updateFreshness);
    window.addEventListener('focus', updateFreshness);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', updateFreshness);
      window.removeEventListener('focus', updateFreshness);
    };
  }, [lastConfirmed]);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const state = errors.length || stale ? 'stale' : lastConfirmed === null ? 'connecting' : 'fresh';
  const status = errors.length
    ? '同步未完成'
    : pendingCount > 0
      ? '同步中…'
      : stale
        ? '确认已超过 5 分钟'
        : lastConfirmed === null
          ? '正在连接…'
          : '已收到云端确认';

  return (
    <div ref={root} className="anki-sync-float" data-state={state}>
      <button
        ref={trigger}
        type="button"
        className="anki-sync-orb"
        aria-label={`云端同步：${status}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? 'anki-sync-popover' : undefined}
        title={`云端同步 · ${status}`}
        onClick={() => setOpen((value) => !value)}
      >
        {pendingCount > 0 ? (
          <LoaderCircle className="anki-sync-spinner" size={23} aria-hidden="true" />
        ) : (
          <Cloud size={23} aria-hidden="true" />
        )}
        <span className="anki-sync-dot" aria-hidden="true" />
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        云端同步 · {status}
      </span>
      {open && (
        <section
          id="anki-sync-popover"
          role="dialog"
          aria-label="云端同步"
          className="anki-sync-popover"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              close();
            } else if (event.key === 'Tab') {
              // 弹层内只有关闭和手动同步；禁用状态时焦点停留在关闭按钮。
              event.preventDefault();
              if (document.activeElement === closeButton.current && !syncButton.current?.disabled)
                syncButton.current?.focus();
              else closeButton.current?.focus();
            }
          }}
        >
          <div className="anki-sync-popover-head">
            <h2>云端同步</h2>
            <button ref={closeButton} type="button" aria-label="关闭同步面板" onClick={close}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <p className="anki-sync-status">{status}</p>
          <p>最近确认：{formatTime(lastConfirmed)}</p>
          <p>确认在 5 分钟内为绿色；超时或请求失败为红色。</p>
          <p>下次同步：保存或评价时立即上传；打开页面时自动拉取。无定时同步任务。</p>
          <p>手动同步拉取最新库、卡片与统计；进行中的练习保留本轮队列，不重置已作答进度。</p>
          {errors.length > 0 && (
            <p role="alert" className="anki-sync-error">
              {errors.some((error) => error.write)
                ? '保存或评价未收到云端确认，请在原操作处重试；手动拉取不会重交失败的操作。'
                : '云端拉取失败，当前显示可能是旧数据，请手动重试。'}
            </p>
          )}
          <button
            ref={syncButton}
            type="button"
            disabled={disabled || pendingCount > 0}
            onClick={() => {
              if (disabled || manualPending.current || pending.current.size > 0) return;
              manualPending.current = true;
              onSync();
            }}
            className="anki-sync-manual"
          >
            {pendingCount > 0 ? '同步中…' : '手动同步'}
          </button>
        </section>
      )}
    </div>
  );
}
