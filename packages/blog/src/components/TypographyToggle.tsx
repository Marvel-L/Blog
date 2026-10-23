import { ALargeSmall } from 'lucide-react';

export function TypographyToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Resume 排版"
      aria-pressed={enabled}
      title={enabled ? '关闭 Resume 排版，恢复原样式' : '开启 Resume 排版'}
      className="frosted-control inline-flex h-11 shrink-0 items-center justify-center gap-1.5 px-2.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
    >
      <ALargeSmall size={18} aria-hidden="true" />
      <span>排版</span>
    </button>
  );
}
