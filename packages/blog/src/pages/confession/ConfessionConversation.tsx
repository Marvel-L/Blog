import { useEffect, useId, useRef, useState } from 'react';
import { ChevronRight, Volume2, VolumeX, X } from 'lucide-react';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import portrait from '@/assets/confession/oblique/rin-close.webp';
import { ConfessionEntryForm } from './ConfessionForms';
import { RIN_LINES, useRinVoice } from './useRinVoice';
import type { ConfessionState } from './model';
import './confession-conversation.css';

/** Galgame performance overlays the existing church; fixed voices never read the private draft. */
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
  const id = useId(),
    panel = useRef<HTMLDivElement>(null),
    close = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion(true);
  const [line, setLine] = useState(0),
    [writing, setWriting] = useState(false),
    [stored, setStored] = useState(false),
    [muted, setMuted] = useState(false);
  const [letters, setLetters] = useState(0);
  const text = RIN_LINES[line].text;
  const voice = useRinVoice(line, muted);
  useModalOverlay({ isOpen: true, onClose, containerRef: panel, initialFocusRef: close });
  useEffect(() => {
    setLetters(reduced ? text.length : 0);
    if (reduced) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setLetters((v) => Math.min(text.length, v + 1));
    }, 45);
    return () => window.clearInterval(timer);
  }, [text, reduced]);
  const next = () => {
    if (letters < text.length) {
      setLetters(text.length);
      return;
    }
    if (writing || stored) return;
    if (line < 2) setLine((v) => v + 1);
    else if (!writing && !stored) {
      setLine(1);
      setWriting(true);
    }
  };
  const save = async (state: ConfessionState) => {
    const ok = await onSave(state);
    if (ok) {
      setStored(true);
      setWriting(false);
      setLine(4);
    } else setLine(5);
    return ok;
  };
  return (
    <div
      ref={panel}
      className="confession-conversation"
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      tabIndex={-1}
      data-speaking={voice.speaking}
      data-reduced={reduced}
    >
      <div className="confession-conversation-portrait" aria-hidden="true">
        <img src={portrait} alt="" />
      </div>
      <section className="confession-conversation-dialogue">
        <header className="confession-conversation-bar">
          <h2 id={id}>志摩凛</h2>
          <span>SHIMA RIN · 预设对白</span>
          <div>
            <button type="button" onClick={voice.replay} aria-label="回听当前对白">
              <Volume2 size={17} />
            </button>
            <button type="button" onClick={() => setMuted((v) => !v)} aria-label={muted ? '开启语音' : '静音语音'}>
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <button ref={close} type="button" onClick={onClose} aria-label="结束倾诉，回到教堂">
              <X size={18} />
            </button>
          </div>
        </header>
        <button type="button" className="confession-conversation-line" onClick={next} aria-label="显示完整对白或下一句">
          <span aria-hidden="true">{text.slice(0, letters)}</span>
          <span className="sr-only">{text}</span>
          <ChevronRight size={17} />
        </button>
        {!writing && !stored && (
          <div className="confession-gal-options">
            <button type="button" onClick={next}>
              下一句
            </button>
            <button
              type="button"
              onClick={() => {
                setWriting(true);
                setLine(1);
              }}
            >
              我想说一说
            </button>
          </div>
        )}
        {writing && (
          <div className="confession-gal-editor">
            <ConfessionEntryForm state={state} busy={busy} guided onSave={save} onReview={() => setLine(3)} />
            <p role="status">{error}</p>
          </div>
        )}
        {stored && (
          <div className="confession-gal-options">
            <span>内容已保存到所选墓碑的私密归档。</span>
            <button type="button" onClick={onClose}>
              结束交谈
            </button>
          </div>
        )}
        <footer>
          <span>仅本人可见 · 不向AI或语音服务发送输入</span>
          <span role="status">{voice.error}</span>
        </footer>
      </section>
    </div>
  );
}
