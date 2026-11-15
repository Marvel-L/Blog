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
export interface ResumeSnapshot {
  state: ResumeState | null;
  revision: number;
  updatedAt: string | null;
}
export interface ResumeResponse {
  user: CloudUser;
  resume: ResumeSnapshot;
}
export const emptyResume = (): ResumeState => ({ version: 1, markdown: '' });

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

export function validateResume(data: ResumeResponse): ResumeResponse {
  const value = data?.resume;
  if (
    !data?.user?.id ||
    !value ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    (value.revision === 0
      ? value.state !== null || value.updatedAt !== null
      : !validResumeState(value.state) || !value.updatedAt || !Number.isFinite(Date.parse(value.updatedAt)))
  ) {
    throw new Error('简历数据格式异常，请重新加载');
  }
  return data;
}
