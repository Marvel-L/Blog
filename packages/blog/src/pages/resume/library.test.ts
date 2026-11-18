import { describe, expect, it } from 'vitest';
import { LEGACY_DOCUMENT_ID, toLibrary, validLibrary, type DraftLibrary } from './model';
import { copyDocument, newDocument } from './library';

describe('draft library compatibility and validation', () => {
  it('preserves the exact legacy markdown and comments with a stable document link', () => {
    const content = { version: 1 as const, markdown: '# 姓名\n', comments: [] };
    expect(toLibrary(content).documents[0]).toEqual({
      id: LEGACY_DOCUMENT_ID,
      title: '我的简历',
      content,
    });
    expect(toLibrary(content).documents[0].content).toBe(content);
    expect(toLibrary(null).documents).toEqual([]);
  });
  it('rejects duplicate document IDs, nested libraries and content exceeding total limits', () => {
    const doc = newDocument('项目主稿');
    const library: DraftLibrary = { version: 2, documents: [doc] };
    expect(validLibrary(library)).toBe(true);
    expect(validLibrary({ ...library, documents: [doc, doc] })).toBe(false);
    expect(validLibrary({ ...library, documents: [{ ...doc, content: library }] })).toBe(false);
    expect(validLibrary({ ...library, documents: [{ ...doc, kind: 'invalid' }] })).toBe(false);
    expect(validLibrary({ ...library, documents: [{ ...doc, title: '' }] })).toBe(false);
    expect(
      validLibrary({
        ...library,
        documents: Array.from({ length: 11 }, () => ({
          ...newDocument('项目'),
          content: { version: 1, markdown: '字'.repeat(100000) },
        })),
      }),
    ).toBe(false);
  });
  it('accepts historical categories while creating and copying drafts without them', () => {
    const content = { version: 1 as const, markdown: '<mark>历史内容</mark>', comments: [] };
    const doc = { ...newDocument('历史名称'), kind: 'interview' as const, content };
    const library: DraftLibrary = { version: 2, documents: [doc] };
    expect(validLibrary(library)).toBe(true);
    expect(toLibrary(library)).toBe(library);
    const copy = copyDocument(doc);
    expect(copy).not.toHaveProperty('kind');
    expect(copy.content).toBe(content);
    expect(copy.id).not.toBe(doc.id);
    expect(newDocument('自由定稿')).not.toHaveProperty('kind');
    expect(newDocument('自由定稿').content.markdown).toBe('');
  });
});
