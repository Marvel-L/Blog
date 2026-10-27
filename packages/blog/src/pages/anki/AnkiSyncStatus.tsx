import { useEffect, useRef, useState } from 'react';
import { ANKI_SYNC_EVENT, type AnkiSyncEvent } from './anki-api';

const formatTime = (timestamp: number | null) =>
  timestamp === null ? '尚未收到云端确认' : new Date(timestamp).toLocaleString('zh-CN', { hour12: false });

/** 只展示已发生的 API 事实。没有定时上传队列，不编造下次同步倒计时。 */
export function AnkiSyncStatus({ onSync, disabled }: { onSync: () => void; disabled: boolean }) {
  const [lastConfirmed, setLastConfirmed] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [errors, setErrors] = useState<Array<{ path: string; write: boolean; message: string }>>([]);
  const pending = useRef(new Set<number>());
  const failures = useRef(new Map<string, { path: string; write: boolean; message: string }>());
  const manualPending = useRef(false);

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
          setLastConfirmed(detail.at ?? null);
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
    };
  }, []);

  return (
    <section
      aria-label="云端同步"
      className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-[#e9edf1] pb-4 text-xs text-[#777d86]"
    >
      <div className="min-w-0 space-y-1">
        <p role="status" aria-live="polite">
          <span className="font-medium text-[#202124]">云端同步</span> ·{' '}
          {pendingCount > 0
            ? '同步中…'
            : errors.length
              ? '同步未完成'
              : lastConfirmed === null
                ? '正在连接…'
                : '已收到云端确认'}
        </p>
        <p>最近确认：{formatTime(lastConfirmed)}</p>
        <p>下次同步：保存或评价时立即上传；打开页面时自动拉取。无定时同步任务。</p>
        <p>手动同步拉取最新库、卡片与统计；进行中的练习保留本轮队列，不重置已作答进度。</p>
        {errors.length > 0 && (
          <p role="alert" className="text-red-600">
            {errors.some((error) => error.write)
              ? '保存或评价未收到云端确认，请在原操作处重试；手动拉取不会重交失败的操作。'
              : '云端拉取失败，当前显示可能是旧数据，请手动重试。'}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={disabled || pendingCount > 0}
        onClick={() => {
          if (manualPending.current || pending.current.size > 0) return;
          manualPending.current = true;
          onSync();
        }}
        className="min-h-11 shrink-0 rounded-full border border-[#e9edf1] bg-white px-4 text-sm font-medium text-[#087ae9] disabled:opacity-40"
      >
        {pendingCount > 0 ? '同步中…' : '手动同步'}
      </button>
    </section>
  );
}
