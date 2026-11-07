import { useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useModalOverlay } from '@/hooks/useModalOverlay';
export function ConfessionDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useModalOverlay({ isOpen: true, onClose, containerRef: panel, initialFocusRef: close });
  return (
    <div className="confession-overlay">
      <div className="confession-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} className="confession-dialog">
        <header>
          <div>
            <span className="confession-eyebrow">THE CONFESSIONAL</span>
            <h2 id={id}>{title}</h2>
          </div>
          <button ref={close} type="button" onClick={onClose} aria-label="关闭弹窗">
            <X size={19} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
