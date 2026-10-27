export type AnkiView =
  | { name: 'overview' }
  | { name: 'stats' }
  | { name: 'drafts' }
  | { name: 'review'; deckId: string | null; tag?: string | null }
  | { name: 'browse' | 'deck'; deckId: string; tag?: string | null };

/** URL 只保存查看位置，不保存问题、答案或身份；路由自行处理 basename。 */
export function readAnkiView(params: URLSearchParams): AnkiView {
  const name = params.get('view');
  const deckId = params.get('deck');
  const tag = params.has('tag') ? params.get('tag') : null;
  if (name === 'stats' || name === 'drafts') return { name };
  if (name === 'review') return { name, deckId, tag };
  if ((name === 'deck' || name === 'browse') && deckId) return { name, deckId, tag };
  return { name: 'overview' };
}

export function writeAnkiView(params: URLSearchParams, view: AnkiView): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('view');
  next.delete('deck');
  next.delete('tag');
  if (view.name !== 'overview') next.set('view', view.name);
  if ('deckId' in view && view.deckId) next.set('deck', view.deckId);
  if ('tag' in view && view.tag != null) next.set('tag', view.tag);
  return next;
}
