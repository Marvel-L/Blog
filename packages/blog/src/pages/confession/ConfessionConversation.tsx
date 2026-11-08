import { useId, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Feather } from 'lucide-react';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import portrait from '@/assets/confession/oblique/rin-close.webp';
import { ConfessionEntryForm } from './ConfessionForms';
import type { ConfessionState } from './model';
import './confession-conversation.css';

/** A private, guided journal scene: preset dialogue only, no AI transport. */
export function ConfessionConversation({
  state,
  busy,
  error,
  onSave,
  onClose,
}: {
  state: ConfessionState;
  busy: boolean;
  error: string;
  onSave: (next: ConfessionState) => Promise<boolean>;
  onClose: () => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<'greeting' | 'writing' | 'saved'>('greeting');
  useModalOverlay({ isOpen: true, onClose, containerRef: panel, initialFocusRef: close });
  const save = async (next: ConfessionState) => {
    const saved = await onSave(next);
    if (saved) setStep('saved');
    return saved;
  };
  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      tabIndex={-1}
      className="confession-conversation"
    >
      <header className="confession-conversation-header">
        <button ref={close} type="button" onClick={onClose} aria-label="结束倾诉，回到教堂">
          <ArrowLeft size={17} />
          回到教堂
        </button>
        <span>一对一倾诉 · 仅本人可见</span>
      </header>
      <div className="confession-conversation-light" aria-hidden="true" />
      <div className="confession-conversation-portrait">
        <img src={portrait} alt="修女服志摩凛的近景" />
      </div>
      <section className="confession-conversation-dialogue">
        <div className="confession-conversation-name">
          <span>SHIMA RIN</span>
          <h2 id={id}>志摩凛</h2>
        </div>
        <p className="confession-conversation-line" aria-live="polite">
          {step === 'saved'
            ? '已经收好了。愿你离开这里时，心里轻一点。'
            : step === 'writing'
              ? '不用急着整理好语言，我在听。写完后，再决定把它放在哪座墓碑里。'
              : '你今天想忏什么'}
        </p>
        {step === 'greeting' && (
          <>
            <p className="confession-conversation-note">这里没有评分，也没有判决。你可以只写下此刻想说的话。</p>
            <button type="button" className="confession-primary" onClick={() => setStep('writing')}>
              <Feather size={16} />
              我想说一说
            </button>
          </>
        )}
        {step === 'writing' && (
          <>
            <ConfessionEntryForm state={state} busy={busy} guided onSave={save} />
            <p role="status" className="confession-form-error">
              {error}
            </p>
          </>
        )}
        {step === 'saved' && (
          <>
            <p className="confession-conversation-note">内容已保存到所选墓碑的私密归档。</p>
            <button type="button" className="confession-primary" onClick={onClose}>
              <BookOpen size={16} />
              回到教堂
            </button>
          </>
        )}
        <small className="confession-conversation-caption">预设引导 · 非 AI 聊天 · 内容不会发送给 AI 服务</small>
      </section>
    </div>
  );
}
