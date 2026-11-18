import { common, createLowlight } from 'lowlight';
import type { Element, Root, Text } from 'hast';

const lowlight = createLowlight(common);
export type CodeToken = { from: number; to: number; className: string };

/** Decorations use offsets, never generated HTML, and never change the document's text. */
export function codeTokens(source: string, language: string): CodeToken[] {
  if (!language || source.length > 50_000 || !lowlight.registered(language.toLowerCase())) return [];
  try {
    const tokens: CodeToken[] = [];
    let offset = 0;
    const visit = (node: Root | Element | Text, classes: string[]) => {
      if (node.type === 'text') {
        if (classes.length && node.value.length)
          tokens.push({ from: offset, to: offset + node.value.length, className: classes.join(' ') });
        offset += node.value.length;
      } else {
        const names =
          node.type === 'element' && Array.isArray(node.properties.className)
            ? node.properties.className.filter((name): name is string => typeof name === 'string')
            : [];
        for (const child of node.children)
          if (child.type === 'text' || child.type === 'element') visit(child, [...classes, ...names]);
      }
    };
    visit(lowlight.highlight(language.toLowerCase(), source), []);
    return tokens;
  } catch {
    return [];
  }
}
