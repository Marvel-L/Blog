import type { PostMetadata } from '../types';
export interface BookNode {
  id: string;
  label: string;
  children: BookNode[];
  post?: PostMetadata;
}
export interface Book {
  id: string;
  name: string;
  subtitle: string;
  edition: string;
  accent: string;
  tree: BookNode[];
  posts: PostMetadata[];
}
export function bookPath(bookId: string): string;
export function chapterPath(bookId: string, postId: string): string;
export function flattenChapters(tree: BookNode[]): PostMetadata[];
export function buildBooks(posts: Array<PostMetadata & { draft?: boolean }>): Book[];
export function getBookRoutes(posts: PostMetadata[], includeChapters?: boolean): string[];
