import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { BookCover } from './BookCover';
import { bookStyle } from './book-style';
import { bookPath, type Book } from './books-core.mjs';

const OPEN_DURATION = 780;
const RETURN_DURATION = 440;
const BOOKS_PER_SHELF = 8;

type Selection = { book: Book; number: number; originX: number; originY: number };
type Phase = 'preview' | 'opening' | 'closing';
const isPlainClick = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;

function BookPreview({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  const { book, number, originX, originY } = selection;
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('preview');
  const phaseRef = useRef<Phase>('preview');
  const dialogRef = useRef<HTMLDivElement>(null);
  const readRef = useRef<HTMLAnchorElement>(null);
  const close = () => {
    if (phaseRef.current === 'closing') return;
    if (reducedMotion) {
      onClose();
      return;
    }
    phaseRef.current = 'closing';
    setPhase('closing');
  };

  useModalOverlay({ isOpen: true, onClose: close, initialFocusRef: readRef, containerRef: dialogRef });

  useEffect(() => {
    if (phase === 'preview') return;
    const timer = window.setTimeout(
      () => {
        if (phase === 'opening') navigate(bookPath(book.id));
        else onClose();
      },
      reducedMotion ? 0 : phase === 'opening' ? OPEN_DURATION : RETURN_DURATION,
    );
    return () => window.clearTimeout(timer);
  }, [phase, reducedMotion, navigate, book.id, onClose]);

  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    if (phaseRef.current !== 'preview') return;
    if (reducedMotion) {
      navigate(bookPath(book.id));
      return;
    }
    phaseRef.current = 'opening';
    setPhase('opening');
  };

  return createPortal(
    <div
      className="book-app book-focus-overlay"
      data-phase={phase}
      style={
        {
          ...bookStyle(book),
          '--book-origin-x': `${originX}px`,
          '--book-origin-y': `${originY}px`,
        } as CSSProperties
      }
    >
      <div className="book-focus-backdrop" onClick={close} aria-hidden="true" />
      <div
        className="book-focus-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${book.name}封面特写`}
        aria-describedby="book-focus-hint"
        tabIndex={-1}
      >
        <button type="button" className="book-focus-close" onClick={close} aria-label="放回书架">
          <X size={18} aria-hidden="true" />
        </button>
        <div className="book-focus-display">
          <div className="book-focus-motion">
            <Link
              ref={readRef}
              to={bookPath(book.id)}
              onClick={open}
              className="book-focus-read"
              aria-label={`翻开 ${book.name}，开始阅读`}
              aria-disabled={phase !== 'preview' || undefined}
            >
              <BookCover book={book} number={number} preview />
            </Link>
          </div>
          <div className="book-focus-caption">
            <p>{book.chapters.length} 个章节</p>
            <p id="book-focus-hint" aria-live="polite">
              {phase === 'opening' ? (
                '正在翻开书本…'
              ) : phase === 'closing' ? (
                '正在放回书架…'
              ) : (
                <>
                  再点封面，开始阅读 <ArrowRight size={15} aria-hidden="true" />
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function BookShelf({ books }: { books: Book[] }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const shelves = useMemo(
    () =>
      Array.from({ length: Math.ceil(books.length / BOOKS_PER_SHELF) }, (_, index) =>
        books.slice(index * BOOKS_PER_SHELF, (index + 1) * BOOKS_PER_SHELF),
      ),
    [books],
  );
  const close = useCallback(() => setSelection(null), []);
  const select = (event: MouseEvent<HTMLAnchorElement>, book: Book, number: number) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setSelection({
      book,
      number,
      originX: rect.left + rect.width / 2 - window.innerWidth / 2,
      originY: rect.top + rect.height / 2 - window.innerHeight / 2 + 24,
    });
  };

  return (
    <>
      <section aria-label="知识包书架" className="book-shelf">
        <div className="book-shelf-sign" aria-hidden="true">
          <span>MARVEL&apos;S LIBRARY</span>
          <span>天空书架</span>
        </div>
        <div className="book-shelf-rack">
          {shelves.map((shelf, shelfIndex) => (
            <div className="book-shelf-tier" key={shelf[0].id}>
              <ul className="book-shelf-spines">
                {shelf.map((book, index) => {
                  const number = shelfIndex * BOOKS_PER_SHELF + index + 1;
                  return (
                    <li
                      key={book.id}
                      style={
                        {
                          ...bookStyle(book),
                          '--book-height-offset': `${(index % 3) * 13}px`,
                          '--book-lean': `${[-1.5, 0, 1, 0, -1, 1.5, 0, -1][index]}deg`,
                        } as CSSProperties
                      }
                      data-selected={selection?.book.id === book.id || undefined}
                      data-long-title={book.name.length >= 8 || undefined}
                    >
                      <Link
                        className="book-shelf-item"
                        to={bookPath(book.id)}
                        onClick={(event) => select(event, book, number)}
                        aria-label={`抽出 ${book.name}，${book.chapters.length} 个章节`}
                        aria-haspopup="dialog"
                        aria-expanded={selection?.book.id === book.id}
                        title={book.name}
                      >
                        <span className="book-shelf-spine" aria-hidden="true">
                          <span className="book-spine-number">{String(number).padStart(2, '0')}</span>
                          <span className="book-spine-title">{book.name}</span>
                          <span className="book-spine-footer">{book.chapters.length} 章</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <span className="book-glass-plank" aria-hidden="true" />
            </div>
          ))}
        </div>
        <p className="book-shelf-hint">点击书脊抽出 · 再点封面阅读</p>
      </section>
      {selection && <BookPreview selection={selection} onClose={close} />}
    </>
  );
}
