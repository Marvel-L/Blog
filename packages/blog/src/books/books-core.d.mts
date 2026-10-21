import type { PostMetadata } from '../types';

export interface BookChapter {
  id: string;
  title: string;
  group?: string;
  content: string;
  relatedPostIds?: string[];
  relatedPosts: PostMetadata[];
}

export interface BookNode {
  id: string;
  label: string;
  children: BookNode[];
  chapter?: BookChapter;
}

export interface Book {
  id: string;
  name: string;
  subtitle: string;
  edition: string;
  accent: string;
  tree: BookNode[];
  chapters: BookChapter[];
  /** Unique public Blog posts explicitly associated with this package. */
  posts: PostMetadata[];
}

export function bookPath(bookId: string): string;
export function chapterPath(bookId: string, chapterId: string): string;
export function flattenChapters(tree: BookNode[]): BookChapter[];
export function buildBooks(posts: Array<PostMetadata & { draft?: boolean }>): Book[];
export function findLegacyChapter(book: Book, chapterId: string): BookChapter | undefined;
export function getBookRoutes(posts: PostMetadata[], includeChapters?: boolean): string[];
