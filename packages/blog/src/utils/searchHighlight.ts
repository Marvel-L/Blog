/** 按归一化关键词切分原文，保留原始大小写、全角字符和可见文本。 */
export const splitSearchHighlight = (value: string, terms: string[]): Array<{ text: string; matched: boolean }> => {
  const keywords = Array.from(new Set(terms.map((term) => term.normalize('NFKC').toLowerCase()).filter(Boolean))).sort(
    (left, right) => right.length - left.length,
  );
  const offsets: Array<{ start: number; end: number }> = [];
  let normalized = '';
  let rawOffset = 0;

  for (const character of value) {
    const folded = character.normalize('NFKC').toLowerCase();
    for (let index = 0; index < folded.length; index += 1) {
      offsets.push({ start: rawOffset, end: rawOffset + character.length });
    }
    normalized += folded;
    rawOffset += character.length;
  }

  const ranges: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < normalized.length;) {
    const keyword = keywords.find((term) => normalized.startsWith(term, index));
    if (!keyword) {
      index += 1;
      continue;
    }
    const start = offsets[index].start;
    const end = offsets[index + keyword.length - 1].end;
    const previous = ranges[ranges.length - 1];
    if (previous && start <= previous.end) {
      previous.end = Math.max(previous.end, end);
    } else {
      ranges.push({ start, end });
    }
    index += keyword.length;
  }

  const parts: Array<{ text: string; matched: boolean }> = [];
  let cursor = 0;
  ranges.forEach(({ start, end }) => {
    if (start > cursor) {
      parts.push({ text: value.slice(cursor, start), matched: false });
    }
    parts.push({ text: value.slice(start, end), matched: true });
    cursor = end;
  });
  if (cursor < value.length) {
    parts.push({ text: value.slice(cursor), matched: false });
  }
  return parts;
};
