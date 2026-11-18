import type { CloudUser } from '@/cloud/api';

export const MAX_MARKDOWN = 100000;
export const MAX_COMMENTS = 100;
export const MAX_COMMENT_BODY = 2000;
export const MAX_COMMENT_QUOTE = 1000;
export const COMMENT_ATTR = 'data-resume-comments';
export const commentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function commentIds(raw: string | null): string[] {
  return [...new Set((raw ?? '').split(/\s+/).filter((id) => commentIdPattern.test(id)))].slice(0, MAX_COMMENTS);
}
export interface ResumeComment {
  id: string;
  quote: string;
  body: string;
  createdAt: string;
}
export interface ResumeState {
  version: 1;
  markdown: string;
  comments?: ResumeComment[];
}
export const MAX_DOCUMENTS = 50;
export const MAX_LIBRARY_MARKDOWN = 1000000;
export interface DraftDocument {
  id: string;
  title: string;
  /** Read old snapshots without changing their saved mutation receipts. New documents omit this field. */
  kind?: 'resume' | 'interview' | 'notes';
  content: ResumeState;
}
export interface DraftLibrary {
  version: 2;
  documents: DraftDocument[];
}
export type StoredResume = ResumeState | DraftLibrary;
export interface ResumeSnapshot<T = ResumeState> {
  state: T | null;
  revision: number;
  updatedAt: string | null;
}
export interface ResumeResponse<T = ResumeState> {
  user: CloudUser;
  resume: ResumeSnapshot<T>;
}
export const emptyResume = (): ResumeState => ({ version: 1, markdown: '' });
export const LEGACY_DOCUMENT_ID = '00000000-0000-4000-8000-000000000019';

/** Keep the original resume and its comment anchors intact; never seed private content. */
export function toLibrary(state: StoredResume | null): DraftLibrary {
  if (!state) return { version: 2, documents: [] };
  if (state.version === 2) return state;
  return {
    version: 2,
    documents: [{ id: LEGACY_DOCUMENT_ID, title: '我的简历', content: state }],
  };
}

function validText(value: unknown, max: number, empty = false): value is string {
  return (
    typeof value === 'string' &&
    [...value].length <= max &&
    (empty || value.trim().length > 0) &&
    [...value].every((char) => {
      const code = char.codePointAt(0)!;
      return (code >= 32 && (code < 127 || code > 159)) || char === '\n' || char === '\r' || char === '\t';
    })
  );
}

export function validResumeState(value: unknown): value is ResumeState {
  if (!value || typeof value !== 'object') return false;
  const state = value as ResumeState;
  const ids = new Set<string>();
  return (
    Object.keys(state).every((key) => ['version', 'markdown', 'comments'].includes(key)) &&
    state.version === 1 &&
    validText(state.markdown, MAX_MARKDOWN, true) &&
    (state.comments === undefined ||
      (Array.isArray(state.comments) &&
        state.comments.length <= MAX_COMMENTS &&
        state.comments.every((comment) => {
          if (
            !comment ||
            Object.keys(comment).sort().join(',') !== 'body,createdAt,id,quote' ||
            typeof comment.id !== 'string' ||
            !commentIdPattern.test(comment.id) ||
            ids.has(comment.id) ||
            !validText(comment.body, MAX_COMMENT_BODY) ||
            !validText(comment.quote, MAX_COMMENT_QUOTE) ||
            typeof comment.createdAt !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(comment.createdAt) ||
            !Number.isFinite(Date.parse(comment.createdAt)) ||
            new Date(comment.createdAt).toISOString() !== comment.createdAt
          )
            return false;
          ids.add(comment.id);
          return true;
        })))
  );
}

export function sameResume(a: ResumeState, b: ResumeState): boolean {
  return a.markdown === b.markdown && JSON.stringify(a.comments ?? []) === JSON.stringify(b.comments ?? []);
}

export function validLibrary(value: unknown): value is DraftLibrary {
  if (!value || typeof value !== 'object') return false;
  const library = value as DraftLibrary;
  const ids = new Set<string>();
  let total = 0;
  return (
    Object.keys(library).sort().join(',') === 'documents,version' &&
    library.version === 2 &&
    Array.isArray(library.documents) &&
    library.documents.length <= MAX_DOCUMENTS &&
    library.documents.every((doc) => {
      if (
        !doc ||
        !['content,id,title', 'content,id,kind,title'].includes(Object.keys(doc).sort().join(',')) ||
        typeof doc.id !== 'string' ||
        !commentIdPattern.test(doc.id) ||
        ids.has(doc.id) ||
        !validText(doc.title, 120) ||
        (Object.hasOwn(doc, 'kind') && !['resume', 'interview', 'notes'].includes(doc.kind!)) ||
        !validResumeState(doc.content)
      )
        return false;
      ids.add(doc.id);
      total += [...doc.content.markdown].length;
      return total <= MAX_LIBRARY_MARKDOWN;
    }) &&
    new TextEncoder().encode(JSON.stringify(library)).byteLength <= 8 * 1024 * 1024 - 8192
  );
}
export function validStoredResume(value: unknown): value is StoredResume {
  return validResumeState(value) || validLibrary(value);
}
export function sameLibrary(a: DraftLibrary, b: DraftLibrary): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function validateResume<T = ResumeState>(data: ResumeResponse<T>): ResumeResponse<T> {
  const value = data?.resume;
  if (
    !data?.user?.id ||
    !value ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    (value.revision === 0
      ? value.state !== null || value.updatedAt !== null
      : !validStoredResume(value.state) || !value.updatedAt || !Number.isFinite(Date.parse(value.updatedAt)))
  ) {
    throw new Error('定稿数据格式异常，请重新加载');
  }
  return data;
}
