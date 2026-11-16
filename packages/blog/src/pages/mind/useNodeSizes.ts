import { useEffect, useState, type RefObject } from 'react';
import { nodeSize, type MindNode, type NodeSize } from './model';

/** Measure text with the actual page font after hydration; never wrap to a fixed width. */
export function useNodeSizes(nodes: MindNode[], container: RefObject<HTMLDivElement | null>) {
  const [sizes, setSizes] = useState<ReadonlyMap<string, NodeSize>>(new Map());
  const [fontVersion, setFontVersion] = useState(0);
  useEffect(() => {
    const changed = () => setFontVersion((v) => v + 1);
    document.fonts?.addEventListener('loadingdone', changed);
    const observer = new MutationObserver(changed);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const typography = container.current?.closest('[data-typography]');
    if (typography) observer.observe(typography, { attributes: true, attributeFilter: ['data-typography'] });
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', changed);
    };
  }, [container]);
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const span = document.createElement('span');
    const font = getComputedStyle(host);
    Object.assign(span.style, {
      position: 'absolute',
      visibility: 'hidden',
      pointerEvents: 'none',
      whiteSpace: 'pre',
      fontFamily: font.fontFamily,
      fontSize: '14px',
      lineHeight: '22px',
      letterSpacing: font.letterSpacing,
      tabSize: '4',
      width: 'max-content',
    });
    span.setAttribute('aria-hidden', 'true');
    host.appendChild(span);
    const cache = new Map<string, number>();
    try {
      const measured = new Map(
        nodes.map((node) => [
          node.id,
          nodeSize(node, (line, root) => {
            const key = `${root}:${line}`;
            if (cache.has(key)) return cache.get(key)!;
            span.style.fontWeight = root ? '650' : '400';
            span.textContent = line;
            const width = span.getBoundingClientRect().width;
            // jsdom or a temporarily hidden canvas has no measurable text yet.
            const value =
              width ||
              Array.from(line).reduce((sum, c) => sum + (c === '\t' ? 32 : /[^\x20-\x7e]/.test(c) ? 14 : 8), 0);
            cache.set(key, value);
            return value;
          }),
        ]),
      );
      setSizes(measured);
    } finally {
      span.remove();
    }
  }, [nodes, fontVersion, container]);
  return sizes;
}
