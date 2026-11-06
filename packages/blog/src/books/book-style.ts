import type { CSSProperties } from 'react';
import type { Book } from './books-core.mjs';

export const bookStyle = (book: Book): CSSProperties => ({ '--book-accent': book.accent }) as CSSProperties;
