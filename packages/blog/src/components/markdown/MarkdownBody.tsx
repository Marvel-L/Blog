/** 全站共享文章正文：从 Post 抽取，能力文档沿用同一组件与增强管道。 */
import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import DOMPurify from 'dompurify';
import { remarkPostBasePlugins } from '@/utils/markdownPlugins';
import {
  imageFigureLayoutClass,
  isInlineMarkdownImageChild,
  resolveImageDisplayOptions,
} from '@/utils/markdownImageDisplay';
import { Minus, Plus, RotateCcw, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { PostMetadata } from '@/types';
import { assetUrl, routeUrl } from '@/utils/siteUrl';
import { siblingContentImageUrl } from '@/utils/post-image-src.mjs';
import { ProgressiveImage } from '@/components/ProgressiveImage';
import { CodeBlock, MarkdownCode } from '@/components/CodeBlock';
import {
  extractMarkdownHeadings,
  extractTextFromReactNode,
  slugifyHeading,
  stripInlineMarkdown,
} from '@/utils/headings';
import type { MarkdownHeading } from '@/utils/headings';
import { useCodeHighlightTheme } from '@/hooks/useCodeHighlightTheme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { HEADING_SCROLL_OFFSET } from '@/utils/scroll';
import { abilityDocumentRoute } from '@/abilities/ability-core.mjs';
type MarkdownImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  previewSrc?: string;
  node?: unknown;
  className?: string | string[];
};

type MarkdownPlugin = import('unified').Pluggable;

type MermaidRenderer = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
};

type MermaidStatus = 'idle' | 'loading' | 'ready' | 'error';

const getIsDarkTheme = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

export const getMermaidConfig = (isDark: boolean) =>
  ({
    startOnLoad: false,
    securityLevel: 'strict',
    // 标签保留在 SVG 文本节点中，DOMPurify 的 SVG 配置才能保留它们。
    htmlLabels: false,
    theme: 'base',
    // GitHub 式渲染：字号提到 18px 并加大节点/层级间距，配合下方
    // 「按自然宽度渲染、宽图横向滚动」的基础视图，保证图表文字清晰可读。
    flowchart: { htmlLabels: false, curve: 'basis', padding: 20, nodeSpacing: 55, rankSpacing: 70, useMaxWidth: true },
    sequence: {
      useMaxWidth: true,
      diagramMarginX: 36,
      diagramMarginY: 28,
      actorMargin: 60,
      boxMargin: 12,
      messageMargin: 40,
    },
    themeVariables: isDark
      ? {
          primaryColor: '#1e293b',
          primaryTextColor: '#f8fafc',
          primaryBorderColor: '#60a5fa',
          lineColor: '#94a3b8',
          secondaryColor: '#312e81',
          secondaryTextColor: '#eef2ff',
          secondaryBorderColor: '#a5b4fc',
          tertiaryColor: '#134e4a',
          tertiaryTextColor: '#ecfdf5',
          tertiaryBorderColor: '#5eead4',
          background: '#111827',
          mainBkg: '#1e293b',
          secondBkg: '#312e81',
          nodeBorder: '#60a5fa',
          clusterBkg: '#172033',
          clusterBorder: '#64748b',
          titleColor: '#f8fafc',
          edgeLabelBackground: '#111827',
          actorBkg: '#1e293b',
          actorBorder: '#60a5fa',
          actorTextColor: '#f8fafc',
          signalColor: '#cbd5e1',
          signalTextColor: '#f8fafc',
          noteBkgColor: '#422006',
          noteBorderColor: '#fbbf24',
          noteTextColor: '#fef3c7',
          fontSize: '18px',
          fontFamily: '"Microsoft YaHei", "PingFang SC", ui-sans-serif, system-ui, sans-serif',
        }
      : {
          primaryColor: '#eff6ff',
          primaryTextColor: '#172033',
          primaryBorderColor: '#2563eb',
          lineColor: '#475569',
          secondaryColor: '#eef2ff',
          secondaryTextColor: '#312e81',
          secondaryBorderColor: '#6366f1',
          tertiaryColor: '#ecfdf5',
          tertiaryTextColor: '#134e4a',
          tertiaryBorderColor: '#0f766e',
          background: '#ffffff',
          mainBkg: '#eff6ff',
          secondBkg: '#eef2ff',
          nodeBorder: '#2563eb',
          clusterBkg: '#f8fafc',
          clusterBorder: '#94a3b8',
          titleColor: '#172033',
          edgeLabelBackground: '#ffffff',
          actorBkg: '#eff6ff',
          actorBorder: '#2563eb',
          actorTextColor: '#172033',
          signalColor: '#334155',
          signalTextColor: '#172033',
          noteBkgColor: '#fffbeb',
          noteBorderColor: '#d97706',
          noteTextColor: '#78350f',
          fontSize: '18px',
          fontFamily: '"Microsoft YaHei", "PingFang SC", ui-sans-serif, system-ui, sans-serif',
        },
  }) as const;

export const hasCodeBlocks = (content: string) => /^```[\w-]*[\s\S]*?^```/m.test(content);
// remark-math 认 $...$ / $$...$$；\(...\) / \[...\] 会被 CommonMark 当转义吃掉，勿作正文公式写法。
const hasMathExpressions = (content: string) => /\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\(|\\\[/m.test(content);
const hasMermaidDiagrams = (content: string) => /```mermaid\b/.test(content);

const MERMAID_MIN_SCALE = 1;
const MERMAID_MAX_SCALE = 4;
const MERMAID_ZOOM_STEP = 0.25;

const clampMermaidScale = (scale: number) => Math.min(MERMAID_MAX_SCALE, Math.max(MERMAID_MIN_SCALE, scale));

/**
 * 从渲染后的 <svg> 读取图表自然宽度（viewBox 宽 / 数值型 width 属性 / 内联
 * max-width 三者取最大）。用于把基础视图限制在图表原始尺寸内，避免容器比
 * 图表宽时被 CSS 拉伸放大而变糊。
 */
const getMermaidNaturalWidth = (svgElement: SVGSVGElement): number => {
  const viewBox = svgElement.getAttribute('viewBox');
  const viewBoxMatch = viewBox?.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$/);
  const viewBoxWidth = viewBoxMatch ? Number.parseFloat(viewBoxMatch[1]) : 0;
  const widthAttr = svgElement.getAttribute('width');
  const attrWidth = widthAttr && /^\d+(?:\.\d+)?$/.test(widthAttr) ? Number.parseFloat(widthAttr) : 0;
  const inlineMaxWidth = svgElement.style?.maxWidth ? Number.parseFloat(svgElement.style.maxWidth) : 0;
  const natural = Math.max(viewBoxWidth, attrWidth, inlineMaxWidth);
  return Number.isFinite(natural) && natural > 0 ? natural : 0;
};

function MermaidBlock({
  children,
  renderer,
  theme,
}: {
  children: string;
  renderer: MermaidRenderer | null;
  theme: 'light' | 'dark';
}) {
  const [svg, setSvg] = useState('');
  const [status, setStatus] = useState<MermaidStatus>('idle');
  const [scale, setScale] = useState(MERMAID_MIN_SCALE);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  /** 图表在 scale=1 时适配容器后的实际宽度（矢量缩放的基准尺寸）。 */
  const [fitWidth, setFitWidth] = useState(0);
  /** 图表自然宽度（viewBox），用于限制基础视图不超出原始尺寸。 */
  const [naturalWidth, setNaturalWidth] = useState(0);
  const mermaidIdRef = useRef<string | null>(null);
  const dragRef = useRef({ pointerId: -1, startX: 0, startY: 0, startPositionX: 0, startPositionY: 0 });
  // pointermove 的 rAF 合并帧：拖动大图表时避免每事件整块重渲染。
  const dragFrameRef = useRef(0);
  const diagramRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(scale);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const getMermaidId = () => {
    if (mermaidIdRef.current === null) {
      mermaidIdRef.current = `mermaid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    }
    return mermaidIdRef.current;
  };

  const resetView = () => {
    setScale(MERMAID_MIN_SCALE);
    setPosition({ x: 0, y: 0 });
  };

  // 缩放/平移使用 scaleRef.current 作为增量基准：快速滚轮或键盘连按时，
  // React 闭包中的 scale 状态可能尚未提交，直接计算会丢步。
  const zoomTo = useCallback((nextScale: number) => {
    const clampedScale = clampMermaidScale(nextScale);
    setScale(clampedScale);
    if (clampedScale <= MERMAID_MIN_SCALE) {
      setPosition({ x: 0, y: 0 });
    }
  }, []);

  const zoomBy = useCallback((delta: number) => zoomTo(scaleRef.current + delta), [zoomTo]);

  const toggleZoom = () => zoomTo(scaleRef.current > MERMAID_MIN_SCALE ? MERMAID_MIN_SCALE : 2);

  useEffect(() => {
    resetView();
    if (!renderer) {
      // 渲染器重建中（懒加载 / 主题切换）：保留现有 svg，避免图表闪回
      // 「正在生成图表」的加载态；渲染器就绪后本 effect 重跑并重新渲染。
      return;
    }

    let cancelled = false;
    setStatus('loading');

    const renderDiagram = async () => {
      try {
        const { svg: renderedSvg } = await renderer.render(getMermaidId(), children.trim());
        if (!cancelled) {
          setSvg(renderedSvg);
          setStatus('ready');
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Mermaid 图表渲染失败:', error);
          setSvg('');
          setStatus('error');
        }
      }
    };

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [children, renderer, theme]);

  // 读取图表自然宽度（viewBox / 数值 width / 内联 max-width 取最大），
  // 作为基础视图宽度与矢量缩放基准；svg 内容变化时重新测量。
  useLayoutEffect(() => {
    const element = svg ? (diagramRef.current?.querySelector('svg') ?? null) : null;
    setNaturalWidth(element ? getMermaidNaturalWidth(element) : 0);
  }, [svg]);

  // 套用显示尺寸。
  //
  // 注意本 effect 不带依赖数组：Post 每次重渲染都会重建 createMarkdownComponents
  // 返回的渲染组件对象，ReactMarkdown 判定组件类型引用变化后可能重建正文子树，
  // 使 .mermaid-diagram 的 dangerouslySetInnerHTML 重新写入、旧 <svg> 节点被
  // 替换为全新节点（内联尺寸随之丢失）。无依赖 + 每次重新 querySelector 保证
  // 任意一次提交后都基于「当前连接中的节点」套用尺寸，宽图永不退回容器宽度
  // 而把文字压缩到看不清（曾出现此问题：ref 指向被替换的旧节点，样式写到了
  // 已脱离文档的节点上）。
  useLayoutEffect(() => {
    const element = svg ? (diagramRef.current?.querySelector('svg') ?? null) : null;
    if (!element) return;
    if (scale > MERMAID_MIN_SCALE && fitWidth > 0) {
      element.style.width = `${fitWidth * scale}px`;
      element.style.maxWidth = 'none';
    } else {
      // GitHub 式基础视图：按图表自然宽度渲染，绝不把宽图压缩到容器宽度
      // （压缩会让图表文字等比缩小、小到看不清）。超出容器宽度时由
      // .mermaid-viewport 横向滚动查看，文字始终保持自然大小。
      element.style.width = naturalWidth > 0 ? `${naturalWidth}px` : '100%';
      element.style.maxWidth = 'none';
    }
    element.style.height = 'auto';
  });

  // 采样 scale=1 时图表容器的实际宽度作为缩放基准；缩放状态下容器会随 SVG
  // 变宽（max-content），因此只在未缩放时更新，避免反馈循环。
  // 同样不带依赖数组：正文子树重建后重新观察当前节点，避免观察器绑定到
  // 已被替换的旧节点上。
  useEffect(() => {
    const element = diagramRef.current;
    if (!element) return;
    const updateFitWidth = () => {
      if (scaleRef.current <= MERMAID_MIN_SCALE && element.clientWidth > 0) {
        setFitWidth(element.clientWidth);
      }
    };
    updateFitWidth();
    const observer = new ResizeObserver(updateFitWidth);
    observer.observe(element);
    return () => observer.disconnect();
  });

  useEffect(() => {
    if (scale <= MERMAID_MIN_SCALE) {
      setPosition({ x: 0, y: 0 });
    }
  }, [scale]);

  // 滚轮缩放使用原生非 passive 监听器：React 19 的 onWheel 注册为 passive，
  // preventDefault 无效，缩放图表时页面会同步滚动。缩放基于 scaleRef.current，
  // 避免快速滚轮时闭包中的 scale 过期导致丢步。
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return;
    }
    const handleWheel = (event: WheelEvent) => {
      if (!svg || (scaleRef.current <= MERMAID_MIN_SCALE && !event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      zoomBy(event.deltaY > 0 ? -MERMAID_ZOOM_STEP : MERMAID_ZOOM_STEP);
    };
    // 原生非 passive wheel 监听：preventDefault 才能阻止页面随图表缩放同步滚动。
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [svg, zoomBy]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (scale <= MERMAID_MIN_SCALE || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPositionX: position.x,
      startPositionY: position.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    // rAF 节流：pointermove 频率可高于帧率，拖动大图表时每帧直接 setPosition
    // 会整块重渲染（含 SVG 子树）；合并到帧内只更新一次。
    if (dragFrameRef.current) return;
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = 0;
      setPosition({
        x: dragRef.current.startPositionX + event.clientX - dragRef.current.startX,
        y: dragRef.current.startPositionY + event.clientY - dragRef.current.startY,
      });
    });
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    if (dragFrameRef.current) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = 0;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current.pointerId = -1;
    setIsDragging(false);
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    toggleZoom();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(MERMAID_ZOOM_STEP);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomBy(-MERMAID_ZOOM_STEP);
    } else if (event.key === '0') {
      event.preventDefault();
      resetView();
    } else if (
      scaleRef.current > MERMAID_MIN_SCALE &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      event.preventDefault();
      const distance = event.shiftKey ? 48 : 24;
      const xDelta = event.key === 'ArrowLeft' ? distance * -1 : event.key === 'ArrowRight' ? distance : 0;
      const yDelta = event.key === 'ArrowUp' ? distance * -1 : event.key === 'ArrowDown' ? distance : 0;
      setPosition((current) => ({ x: current.x + xDelta, y: current.y + yDelta }));
    }
  };

  // sanitize 输出对同一 svg 恒定：记忆化避免每帧重渲染（拖动/缩放大图表时）
  // 对整段 SVG 重复 DOMPurify 净化。须在条件早退（!svg）之前调用（Hooks 顺序）。
  // 注意两个守卫缺一不可：
  // 1) svg 为空（SSR 恒为空）时短路，不触碰 DOMPurify —— 此前 useMemo 前移后
  //    SSR 首帧即执行 sanitize，而 SSR bundle 中 import DOMPurify 的模块形态
  //    与客户端不同（sanitize 不存在），含 Mermaid 的文章整页渲染崩溃；
  // 2) typeof DOMPurify.sanitize 形态守卫：客户端 interop 下 DOMPurify 是函数，
  //    异常形态时回退原始 svg（不崩溃）。
  const sanitizedSvg = useMemo(
    () =>
      svg && typeof DOMPurify.sanitize === 'function' ? DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } }) : '',
    [svg],
  );

  if (!svg) {
    const isError = status === 'error';
    return (
      <div
        className={`mermaid-container mermaid-status my-8 ${isError ? 'is-error' : ''}`}
        role={isError ? 'alert' : 'status'}
        aria-live="polite"
      >
        <div className="mermaid-status-icon" aria-hidden="true">
          {isError ? <TriangleAlert size={20} /> : <LoaderCircle className="animate-spin" size={20} />}
        </div>
        <div>
          <p className="mermaid-status-title">{isError ? '图表渲染失败' : '正在生成图表'}</p>
          <p className="mermaid-status-description">
            {isError ? '请检查 Mermaid 语法，原始内容已保留在下方。' : '正在加载 Mermaid 并适配当前主题。'}
          </p>
        </div>
        {isError && (
          <pre className="mermaid-source">
            <code>{children}</code>
          </pre>
        )}
      </div>
    );
  }
  const scaleLabel = `${Math.round(scale * 100)}%`;

  return (
    <div className="mermaid-container my-8 rounded-none border border-zinc-300 bg-zinc-50 p-3 shadow-none dark:border-zinc-700 dark:bg-zinc-900/50 sm:p-4">
      <div className="mermaid-toolbar" role="toolbar" aria-label="Mermaid 图表工具">
        <span className="mermaid-toolbar-label">图表缩放</span>
        <div className="mermaid-toolbar-actions">
          <button
            type="button"
            className="mermaid-action-btn"
            onClick={() => zoomBy(-MERMAID_ZOOM_STEP)}
            disabled={scale <= MERMAID_MIN_SCALE}
            aria-label="缩小 Mermaid 图表"
            title="缩小"
          >
            <Minus size={15} aria-hidden="true" />
          </button>
          <span className="mermaid-scale" aria-live="polite">
            {scaleLabel}
          </span>
          <button
            type="button"
            className="mermaid-action-btn"
            onClick={() => zoomBy(MERMAID_ZOOM_STEP)}
            disabled={scale >= MERMAID_MAX_SCALE}
            aria-label="放大 Mermaid 图表"
            title="放大"
          >
            <Plus size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mermaid-action-btn"
            onClick={resetView}
            aria-label="重置 Mermaid 图表视图"
            title="重置"
          >
            <RotateCcw size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className={`mermaid-viewport ${scale > MERMAID_MIN_SCALE ? 'is-zoomed' : ''} ${isDragging ? 'is-dragging' : ''}`}
        tabIndex={0}
        role="application"
        aria-label="Mermaid 图表，可缩放和拖动"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
      >
        <div
          className="mermaid-scene"
          style={{
            // 未缩放且未平移时保持 transform: none：任何非 none 的 transform（包括
            // translate3d(0,0,0)）都会让浏览器把 SVG 图层化光栅化，缩放或下采样时
            // 文字变糊。缩放改为直接调整 SVG 宽度（矢量重绘），这里只负责平移。
            transform:
              scale > MERMAID_MIN_SCALE || position.x !== 0 || position.y !== 0
                ? `translate3d(${position.x}px, ${position.y}px, 0)`
                : 'none',
          }}
        >
          <div className="mermaid-diagram" ref={diagramRef} dangerouslySetInnerHTML={{ __html: sanitizedSvg }} />
        </div>
      </div>
      <p className="mermaid-hint">滚轮或按钮缩放 · 放大后拖动平移 · 双击切换 · 按 0 重置</p>
    </div>
  );
}

const PostPreBlock = ({
  children,
  ...props
}: React.DetailedHTMLProps<React.HTMLAttributes<HTMLPreElement>, HTMLPreElement> & { node?: unknown }) => {
  const isMermaidBlock = React.Children.toArray(children).some(
    (child) =>
      React.isValidElement(child) &&
      (child.type === MermaidBlock ||
        /language-mermaid\b/i.test(String((child.props as Record<string, unknown>).className || ''))),
  );
  return isMermaidBlock ? <>{children}</> : <CodeBlock {...props}>{children}</CodeBlock>;
};

const isSafeMarkdownHref = (href?: string) => {
  if (!href || href.startsWith('//')) {
    return false;
  }

  if (href.startsWith('#') || href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
    return true;
  }

  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(href).protocol);
  } catch {
    return false;
  }
};

// 文章图片均使用外链（图床 URL）；此处仅对极少数未以 / 开头的站内相对路径做兜底归一化。
const isAbsoluteAssetPath = (value: string) => value.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(value);

const resolveSitePath = (value: string) => {
  const clean = value
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^(\.\.\/)+/g, '');
  return assetUrl(`/${clean}`);
};

const resolveBrowserAsset = (value?: string) => {
  if (!value || /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) {
    return value;
  }
  return assetUrl(value);
};

const normalizeImageUrl = (value: string) => {
  const withoutHash = value.split('#', 1)[0];
  const withoutQuery = withoutHash.split('?', 1)[0];
  return withoutQuery
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .toLowerCase();
};

const findImageDimensions = (imageDimensions: PostMetadata['imageDimensions'], src: string) => {
  if (!imageDimensions) {
    return undefined;
  }

  const normalizedSrc = normalizeImageUrl(src);
  const matchingKey = Object.keys(imageDimensions).find((key) => {
    const normalizedKey = normalizeImageUrl(key);
    return (
      normalizedKey === normalizedSrc ||
      normalizedKey.endsWith(`/${normalizedSrc}`) ||
      normalizedSrc.endsWith(`/${normalizedKey}`)
    );
  });
  return matchingKey ? imageDimensions[matchingKey] : undefined;
};

export const createMarkdownComponents = (
  onPreviewImage: (image: { src: string; alt?: string }) => void,
  mermaidRenderer: MermaidRenderer | null,
  mermaidTheme: 'light' | 'dark',
  imageDimensions: PostMetadata['imageDimensions'],
  headings: MarkdownHeading[],
  shouldReduceMotion: boolean,
  postFilePath?: string,
): Components => {
  let headingCursor = 0;
  const fallbackHeadingIds = new Map<string, number>();
  // 已分配出去的 heading id：二次扫描（顺序匹配落空后的全表兜底）必须跳过，
  // 否则「渲染文本与 rawText 不一致」的标题（含图片/公式）会让后续标题错配到
  // 同一 id，DOM 出现重复 id、TOC 锚点失效。
  const usedHeadingIds = new Set<string>();

  const resolveHeadingId = (level: number, children: React.ReactNode) => {
    // 与构建期 TOC 相同的归一化：折叠空白、解码实体、移除尾部 #。
    // 渲染侧文本与 headings 数组的 rawText 因此保持一致，避免锚点 id 错位。
    const text = stripInlineMarkdown(extractTextFromReactNode(children));

    for (let index = headingCursor; index < headings.length; index += 1) {
      const heading = headings[index];
      if (heading.level === level && heading.rawText === text) {
        headingCursor = index + 1;
        usedHeadingIds.add(heading.id);
        return heading.id;
      }
    }

    for (const heading of headings) {
      if (heading.level === level && heading.rawText === text && !usedHeadingIds.has(heading.id)) {
        usedHeadingIds.add(heading.id);
        return heading.id;
      }
    }

    const fallbackBaseId = slugifyHeading(text) || 'section';
    const duplicateCount = (fallbackHeadingIds.get(fallbackBaseId) ?? 0) + 1;
    fallbackHeadingIds.set(fallbackBaseId, duplicateCount);
    return duplicateCount === 1 ? fallbackBaseId : `${fallbackBaseId}-${duplicateCount}`;
  };

  const handleHeadingClick = (id: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    url.hash = id;
    window.history.replaceState({}, '', url.toString());

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url.toString()).catch(() => {});
    }
  };

  const renderHeading = (
    level: number,
    Tag: string,
    { children, node: _node, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown },
  ) => {
    const id = resolveHeadingId(level, children);
    return React.createElement(
      Tag,
      { ...props, id, className: 'heading-anchor-wrapper' },
      // 锚点用 span+role 模拟按钮而非 <button>：标题内部可能已有链接/交互元素，
      // 嵌套 <button> 属非法 HTML，会导致水合告警与点击行为异常。
      // 锚点置于标题文本之后（GitHub 风格：悬停标题时在文字末尾显示 #）。
      children,
      React.createElement(
        'span',
        {
          className: 'heading-anchor',
          role: 'button',
          tabIndex: 0,
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            handleHeadingClick(id);
          },
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              handleHeadingClick(id);
            }
          },
          'aria-label': `复制标题链接：${extractTextFromReactNode(children)}`,
          title: '复制链接',
        },
        '#',
      ),
    );
  };

  const isImageUrl = (url: string) => /\.(jpe?g|png|gif|webp|avif|svg|bmp|ico)(\?.*)?$/i.test(url);

  return {
    // remark 会把「整段均为 {.inline} 图」提升为 div[data-role=markdown-image-row]；
    // 这里再兜底：若仍走 p，按 img.className 识别并改成横排容器。
    p: ({ children, node: _node, ...props }: React.HTMLAttributes<HTMLParagraphElement> & { node?: unknown }) => {
      const childList = React.Children.toArray(children);
      const meaningful = childList.filter((child) => {
        if (typeof child === 'string' || typeof child === 'number') {
          return String(child).trim().length > 0;
        }
        return true;
      });
      const isInlineImageRow =
        meaningful.length > 0 &&
        meaningful.every(
          (child) => React.isValidElement(child) && isInlineMarkdownImageChild(child.props as Record<string, unknown>),
        );

      if (isInlineImageRow) {
        return (
          <div data-role="markdown-image-row" className="markdown-image-row" {...props}>
            {children}
          </div>
        );
      }

      const containsImage = (value: React.ReactNode): boolean =>
        React.Children.toArray(value).some(
          (child) =>
            React.isValidElement(child) &&
            (typeof (child.props as Record<string, unknown>).src === 'string' ||
              containsImage((child.props as { children?: React.ReactNode }).children)),
        );
      if (containsImage(children)) return <div {...props}>{children}</div>;
      return <p {...props}>{children}</p>;
    },
    div: ({
      children,
      node: _node,
      className,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { node?: unknown }) => {
      const role = (props as Record<string, unknown>)['data-role'];
      const isImageRow =
        role === 'markdown-image-row' ||
        (typeof className === 'string' && className.split(/\s+/).includes('markdown-image-row')) ||
        (Array.isArray(className) && className.includes('markdown-image-row'));

      if (isImageRow) {
        return (
          <div data-role="markdown-image-row" className="markdown-image-row" {...props}>
            {children}
          </div>
        );
      }

      return (
        <div className={className} {...props}>
          {children}
        </div>
      );
    },
    a: ({
      href,
      children,
      node: _node,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) => {
      const hrefIsImage = href ? isImageUrl(href) : false;
      let documentHref = href;
      if (postFilePath?.startsWith('/about-radar/') && href && /^(?:\.\/)?[^/\\]+\.md(?:#.*)?$/i.test(href)) {
        try {
          const [filename, anchor] = href.replace(/^\.\//, '').split('#');
          documentHref =
            abilityDocumentRoute(postFilePath.split('/')[2], decodeURIComponent(filename)) +
            (anchor ? '#' + anchor : '');
        } catch {
          documentHref = undefined;
        }
      }
      const resolvedHref =
        documentHref && hrefIsImage
          ? isAbsoluteAssetPath(documentHref)
            ? resolveBrowserAsset(documentHref)
            : resolveSitePath(documentHref)
          : documentHref;
      const safeHref = isSafeMarkdownHref(resolvedHref) ? resolvedHref : undefined;
      const normalizedHref = safeHref && safeHref.startsWith('/') ? routeUrl(safeHref) : safeHref;

      if (normalizedHref && isImageUrl(normalizedHref)) {
        const childElements = React.Children.toArray(children);
        const imageChild = childElements.find(
          (child): child is React.ReactElement<MarkdownImageProps> =>
            React.isValidElement(child) && typeof (child.props as Record<string, unknown>).src === 'string',
        );

        if (imageChild) {
          return React.cloneElement(imageChild, { previewSrc: normalizedHref });
        }

        // 自定义 img 渲染器会输出已含预览按钮的 <figure>，不能再包一层按钮
        // （嵌套交互元素属非法 HTML，且会双重触发预览）。
        const containsMarkdownFigure = childElements.some(
          (child) =>
            React.isValidElement(child) && (child.props as Record<string, unknown>)['data-role'] === 'markdown-figure',
        );
        if (containsMarkdownFigure) {
          return <>{children}</>;
        }

        const imgAlt = childElements
          .map((child) => {
            if (React.isValidElement(child) && (child.props as Record<string, unknown>).alt) {
              return (child.props as Record<string, unknown>).alt as string;
            }
            return '';
          })
          .join('');
        return (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onPreviewImage({ src: normalizedHref, alt: imgAlt || undefined });
            }}
            className="block w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100"
            aria-label={imgAlt ? `预览图片：${imgAlt}` : '预览图片'}
          >
            {children}
          </button>
        );
      }

      if (!normalizedHref) {
        return <>{children}</>;
      }

      // 站内链接保持 SPA 的同页导航；只有真正的 HTTP(S) 外链才新开标签。
      // 这样文章内锚点不会意外打开新页面，键盘和浏览器历史行为也与普通站内链接一致。
      // 页内锚点（#heading）用原生 <a> + 手动滚动：react-router 的 <Link> 对 hash-only
      // 变化不触发滚动（App 路由 effect 直接返回），原生 <a> 则由浏览器默认跳转到锚点。
      if (normalizedHref.startsWith('#')) {
        return (
          <a
            href={normalizedHref}
            onClick={(event) => {
              // 手动滚动并让浏览器更新 hash（默认行为已覆盖跳转，这里仅保持滚动位置一致，
              // 避免浏览器默认定位到元素顶部时被固定头部遮挡）。
              const targetId = normalizedHref.slice(1);
              const target = targetId ? document.getElementById(targetId) : null;
              if (!target) {
                return;
              }
              event.preventDefault();
              window.scrollTo({
                top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - HEADING_SCROLL_OFFSET),
                behavior: shouldReduceMotion ? 'auto' : 'smooth',
              });
              const url = new URL(window.location.href);
              url.hash = targetId;
              window.history.replaceState({}, '', url.toString());
            }}
            {...props}
          >
            {children}
          </a>
        );
      }

      const isInternalLink =
        normalizedHref.startsWith('/') || normalizedHref.startsWith('./') || normalizedHref.startsWith('../');
      if (isInternalLink) {
        return (
          <Link to={normalizedHref} {...props}>
            {children}
          </Link>
        );
      }

      const isHttpExternal = /^https?:/i.test(normalizedHref);
      return (
        <a
          href={normalizedHref}
          {...(isHttpExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          {...props}
        >
          {children}
        </a>
      );
    },
    img: ({ src, alt, title, previewSrc, className, node: _node, ...props }: MarkdownImageProps) => {
      const siblingUrl = siblingContentImageUrl(
        postFilePath,
        src,
        postFilePath?.startsWith('/about-radar/')
          ? { contentDir: 'about-radar', publicPrefix: '/about-radar-img' }
          : {},
      );
      const resolvedSrc = siblingUrl
        ? assetUrl(siblingUrl)
        : src
          ? isAbsoluteAssetPath(src)
            ? resolveBrowserAsset(src)
            : resolveSitePath(src)
          : src;
      const previewTarget = previewSrc || resolvedSrc || '';
      const dimensions = resolvedSrc ? findImageDimensions(imageDimensions, resolvedSrc) : undefined;
      // 展示约定：![alt](url){.small}{.inline}；暗色豁免仍兼容 title="no-dark"。
      const display = resolveImageDisplayOptions(className, title);
      const layoutClass = imageFigureLayoutClass(display);
      const passthroughClass = display.passthroughClasses.join(' ');
      return (
        <figure
          data-role="markdown-figure"
          data-size={display.size === 'default' ? undefined : display.size}
          data-inline={display.inline ? true : undefined}
          className={`group/myimage ${layoutClass}${passthroughClass ? ` ${passthroughClass}` : ''}`}
        >
          <button
            type="button"
            onClick={() => onPreviewImage({ src: previewTarget, alt })}
            className="relative block w-full overflow-hidden rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100"
            aria-label={alt ? `预览图片：${alt}` : '预览图片'}
          >
            <ProgressiveImage
              {...props}
              src={resolvedSrc}
              alt={alt}
              loading="lazy"
              decoding="async"
              width={dimensions?.width ?? props.width}
              height={dimensions?.height ?? props.height}
              wrapperClassName="w-full rounded-[6px]"
              className={`h-auto w-full cursor-zoom-in rounded-[6px] object-contain ${display.noDark ? 'no-dark-adapt' : ''}`}
            />
            <span className="pointer-events-none absolute right-3 top-3 rounded-[6px] border border-white/20 bg-black/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85 opacity-0 transition-opacity duration-200 group-hover/myimage:opacity-100 group-focus-visible/myimage:opacity-100">
              预览
            </span>
          </button>
        </figure>
      );
    },
    pre: PostPreBlock,
    table: ({ children, node: _node, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { node?: unknown }) => (
      <div className="table-wrapper">
        <table {...props} className="min-w-full">
          {children}
        </table>
      </div>
    ),
    code: ({ className, children, node: _node, ...props }) => {
      if (className?.includes('language-mermaid')) {
        return (
          <MermaidBlock renderer={mermaidRenderer} theme={mermaidTheme}>
            {String(children)}
          </MermaidBlock>
        );
      }

      return (
        <MarkdownCode className={className} {...props}>
          {children}
        </MarkdownCode>
      );
    },
    h1: ({ children, ...props }) => renderHeading(1, 'h2', { children, ...props }),
    h2: ({ children, ...props }) => renderHeading(2, 'h3', { children, ...props }),
    h3: ({ children, ...props }) => renderHeading(3, 'h4', { children, ...props }),
  };
};

export function useMarkdownEnhancements(content: string) {
  const [remarkPlugins, setRemarkPlugins] = useState<MarkdownPlugin[]>([...remarkPostBasePlugins]);
  const [rehypePlugins, setRehypePlugins] = useState<MarkdownPlugin[]>([]);
  const [mermaidRenderer, setMermaidRenderer] = useState<MermaidRenderer | null>(null);
  const [mermaidTheme, setMermaidTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const updateTheme = () => {
      setMermaidTheme(getIsDarkTheme() ? 'dark' : 'light');
    };
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    updateTheme();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!content) {
      setRemarkPlugins([...remarkPostBasePlugins]);
      setRehypePlugins([]);
      setMermaidRenderer(null);
      return;
    }

    let cancelled = false;

    const loadMarkdownEnhancements = async () => {
      // 保持 remarkCodeMeta 常驻：pre 渲染依赖它透传代码块 data-meta
      // （title="..." 文件名等），异步增强加载时若被移除，文件名展示与
      // 下载命名会失效。
      const nextRemarkPlugins: MarkdownPlugin[] = [...remarkPostBasePlugins];
      const nextRehypePlugins: MarkdownPlugin[] = [];
      let nextMermaidRenderer: MermaidRenderer | null = null;
      const tasks: Promise<void>[] = [];
      const containsMermaid = hasMermaidDiagrams(content);

      if (containsMermaid) {
        setMermaidRenderer(null);
      }

      if (hasCodeBlocks(content)) {
        tasks.push(
          (async () => {
            const { default: rehypeHighlight } = await import('rehype-highlight');

            if (cancelled) return;
            nextRehypePlugins.push(rehypeHighlight);
          })(),
        );
      }

      if (hasMathExpressions(content)) {
        tasks.push(
          (async () => {
            const [{ default: remarkMath }, { default: rehypeKatex }] = await Promise.all([
              import('remark-math'),
              import('rehype-katex'),
              import('katex/dist/katex.min.css'),
            ]);

            nextRemarkPlugins.push(remarkMath);
            nextRehypePlugins.push(rehypeKatex);
          })(),
        );
      }

      if (hasMermaidDiagrams(content)) {
        tasks.push(
          (async () => {
            const { default: mermaid } = await import('mermaid');
            if (cancelled) {
              return;
            }

            mermaid.initialize(getMermaidConfig(mermaidTheme === 'dark'));
            nextMermaidRenderer = mermaid as MermaidRenderer;
          })(),
        );
      }

      try {
        await Promise.all(tasks);
      } catch (error) {
        if (!cancelled) {
          console.error('Markdown 增强组件加载失败:', error);
          // 失败回退同样保持 remarkCodeMeta 常驻，避免代码块 data-meta 丢失。
          setRemarkPlugins([...remarkPostBasePlugins]);
          setRehypePlugins([]);
          setMermaidRenderer(null);
        }
        return;
      }

      if (cancelled) {
        return;
      }

      setRemarkPlugins(nextRemarkPlugins);
      setRehypePlugins(nextRehypePlugins);
      setMermaidRenderer(nextMermaidRenderer);
    };

    void loadMarkdownEnhancements();

    return () => {
      cancelled = true;
    };
  }, [mermaidTheme, content]);

  useCodeHighlightTheme(Boolean(content && hasCodeBlocks(content)));

  return { remarkPlugins, rehypePlugins, mermaidRenderer, mermaidTheme };
}
const ImageViewer = lazy(() => import('@/components/ImageViewer').then((m) => ({ default: m.ImageViewer })));
export function MarkdownBody({
  content,
  filePath,
  imageDimensions,
}: {
  content: string;
  filePath?: string;
  imageDimensions?: PostMetadata['imageDimensions'];
}) {
  const [previewImage, setPreviewImage] = useState<{ src: string; alt?: string } | null>(null);
  const enhancements = useMarkdownEnhancements(content);
  const headings = useMemo(() => extractMarkdownHeadings(content), [content]);
  const reduced = useReducedMotion();
  const components = createMarkdownComponents(
    setPreviewImage,
    enhancements.mermaidRenderer,
    enhancements.mermaidTheme,
    imageDimensions,
    headings,
    reduced,
    filePath,
  );
  return (
    <>
      <div className="post-prose prose max-w-none dark:prose-invert md:prose-lg prose-headings:scroll-mt-24 prose-a:break-words">
        <ReactMarkdown
          remarkPlugins={enhancements.remarkPlugins}
          rehypePlugins={enhancements.rehypePlugins}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
      {previewImage && (
        <Suspense fallback={null}>
          <ImageViewer src={previewImage.src} alt={previewImage.alt} onClose={() => setPreviewImage(null)} />
        </Suspense>
      )}
    </>
  );
}
