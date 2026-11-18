export const CODE_META_ATTR = 'data-resume-code-meta';

export function codeLanguage(value: unknown): string {
  return typeof value === 'string' && /^[a-z\d_+#.-]{1,64}$/i.test(value) ? value : '';
}

export function codeMeta(value: unknown): string {
  return typeof value === 'string'
    ? [...value]
        .filter((character) => character.charCodeAt(0) >= 32 && character !== '`')
        .join('')
        .trim()
    : '';
}

export function parseCodeInfo(info: string): { language: string; meta: string } {
  const match = /^([^\s{]+)?\s*(.*)$/.exec(info.trim());
  const language = codeLanguage(match?.[1]);
  return { language, meta: codeMeta(match?.[2] ?? '') };
}
