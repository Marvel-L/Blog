import type { Book } from './books-core.mjs';
import { bookStyle } from './book-style';

export function BookCover({
  book,
  number,
  small = false,
  preview = false,
}: {
  book: Book;
  number: number;
  small?: boolean;
  preview?: boolean;
}) {
  return (
    <span className={`book-object${small ? ' book-object-small' : ''}`} style={bookStyle(book)} aria-hidden="true">
      {preview && (
        <span className="book-object-endpaper">
          <span>CHAPTER 01</span>
          <strong>{book.chapters[0]?.title || book.name}</strong>
          <span className="book-endpaper-lines" />
          <span>从这里，开始阅读。</span>
        </span>
      )}
      <span className="book-object-pages" />
      <span className="book-object-spine" />
      <span className="book-object-cover">
        <span className="book-cover-edition">{book.edition}</span>
        <span className="book-cover-number">VOL. {String(number).padStart(2, '0')}</span>
        <span className="book-cover-title">{book.name}</span>
        <span className="book-cover-line" />
        <span className="book-cover-caption">{book.subtitle}</span>
        <span className="book-cover-footer">
          MARVEL&apos;S LIBRARY <span>{book.chapters.length} 章</span>
        </span>
      </span>
    </span>
  );
}
