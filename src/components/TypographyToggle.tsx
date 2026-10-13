import { ALargeSmall } from 'lucide-react';

export function TypographyToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Resume 排版"
      aria-pressed={enabled}
      title={enabled ? '关闭 Resume 排版，恢复原样式' : '开启 Resume 排版'}
      className={`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-icon border px-2.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
        enabled
          ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200'
          : 'border-zinc-300 bg-zinc-100 text-ink hover:border-zinc-500 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
      }`}
    >
      <ALargeSmall size={18} aria-hidden="true" />
      <span>排版</span>
    </button>
  );
}
