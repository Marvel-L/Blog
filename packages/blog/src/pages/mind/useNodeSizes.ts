import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { nodeSize, type MindNode, type NodeSize } from './model';

interface MeasuredNode {
  text: string;
  emoji: string;
  root: boolean;
  size: NodeSize;
}

/** Measure text with the actual page font after hydration; never wrap to a fixed width. */
export function useNodeSizes(nodes: MindNode[], container: RefObject<HTMLDivElement | null>) {
  const [sizes, setSizes] = useState<ReadonlyMap<string, NodeSize>>(new Map());
  const [fontVersion, setFontVersion] = useState(0);
  const cache = useRef({
    fontVersion: -1,
    lines: new Map<string, number>(),
    nodes: new Map<string, MeasuredNode>(),
    sizes: new Map<string, NodeSize>(),
  });
  const measuring = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const host = container.current;
    if (!host) return;
    const span = document.createElement('span');
    Object.assign(span.style, {
      position: 'absolute',
      visibility: 'hidden',
      pointerEvents: 'none',
      whiteSpace: 'pre',
      fontSize: '14px',
      lineHeight: '22px',
      tabSize: '4',
      width: 'max-content',
      contain: 'layout style paint',
    });
    span.setAttribute('aria-hidden', 'true');
    host.appendChild(span);
    measuring.current = span;
    return () => {
      measuring.current = null;
      span.remove();
    };
  }, [container]);
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
  useLayoutEffect(() => {
    const host = container.current;
    const span = measuring.current;
    if (!host || !span) return;
    if (cache.current.fontVersion !== fontVersion) {
      const font = getComputedStyle(host);
      span.style.fontFamily = font.fontFamily;
      span.style.letterSpacing = font.letterSpacing;
      cache.current.fontVersion = fontVersion;
      cache.current.lines.clear();
      cache.current.nodes.clear();
    }
    const widths = cache.current.lines;
    if (widths.size > 4096) widths.clear();
    const measure = (line: string, root: boolean) => {
      const key = `${root}:${line}`;
      if (widths.has(key)) return widths.get(key)!;
      span.style.fontWeight = root ? '650' : '400';
      span.textContent = line;
      const width = span.getBoundingClientRect().width;
      // jsdom or a temporarily hidden canvas has no measurable text yet.
      const value =
        width || Array.from(line).reduce((sum, c) => sum + (c === '\t' ? 32 : /[^\x20-\x7e]/.test(c) ? 14 : 8), 0);
      widths.set(key, value);
      return value;
    };
    const measured = new Map<string, NodeSize>();
    let changed = nodes.length !== cache.current.sizes.size;
    for (const node of nodes) {
      const cached = cache.current.nodes.get(node.id);
      const root = node.parentId === null;
      let size =
        cached?.text === node.text && cached.emoji === node.emoji && cached.root === root
          ? cached.size
          : nodeSize(node, measure);
      const previous = cache.current.sizes.get(node.id);
      if (previous && previous.width === size.width && previous.height === size.height) size = previous;
      if (size !== previous) changed = true;
      cache.current.nodes.set(node.id, { text: node.text, emoji: node.emoji, root, size });
      measured.set(node.id, size);
    }
    for (const id of cache.current.nodes.keys()) if (!measured.has(id)) cache.current.nodes.delete(id);
    if (changed) {
      cache.current.sizes = measured;
      setSizes(measured);
    }
  }, [nodes, fontVersion, container]);
  return sizes;
}
