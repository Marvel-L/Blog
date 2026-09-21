/**
 * 积累页：左侧分类，右侧跳到当前分类的某一条；中间阅读区可上下滚动。
 * 文首 --- 里的 status、author 写了才显示。点边缘翻页，方向键左右翻页、上下滚动。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { remarkCommonPlugins } from '@/utils/markdownPlugins';
import { siteConfig } from '@config/site.config';
import { Seo, buildSiteSchemas } from '@/components/Seo';
import { ProgressiveImage } from '@/components/ProgressiveImage';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { absoluteSiteUrl, assetUrl } from '@/utils/siteUrl';
import { SUMMARY_IMAGE_OPTIONS, siblingContentImageUrl } from '@/utils/post-image-src.mjs';
import {
  getAccumulateDecks,
  resolveCardSwipe,
  stepDeckIndex,
  type AccumulateItem,
  type CardAxis,
} from '@/services/accumulate';

const pageDescription = '以大面积文案翻阅积累：左侧切换分类，点击边缘查看上一条与下一条。';

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
};

interface CardMotion {
  delta: 1 | -1;
  axis: CardAxis;
}

export const Accumulate = () => {
  const decks = useMemo(() => getAccumulateDecks(), []);
  const prefersReducedMotion = useReducedMotion();
  const [deckId, setDeckId] = useState(decks[0]?.id ?? '');
  const [index, setIndex] = useState(0);
  const [cardMotion, setCardMotion] = useState<CardMotion>({ delta: 1, axis: 'x' });
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const deck = decks.find((item) => item.id === deckId) ?? decks[0];
  const items = deck?.items ?? [];
  const safeIndex = items.length === 0 ? 0 : stepDeckIndex(index, 0, items.length);
  const item = items[safeIndex] ?? null;
  const canStep = items.length > 1;

  const selectDeck = (nextDeckId: string) => {
    if (nextDeckId === deck?.id) {
      return;
    }
    setDeckId(nextDeckId);
    setIndex(0);
    setCardMotion({ delta: 1, axis: 'x' });
  };

  const selectItem = (nextIndex: number) => {
    if (nextIndex === safeIndex || nextIndex < 0 || nextIndex >= items.length) {
      return;
    }
    setCardMotion({ delta: nextIndex > safeIndex ? 1 : -1, axis: 'x' });
    setIndex(nextIndex);
  };

  const step = useCallback(
    (delta: 1 | -1, axis: CardAxis) => {
      if (items.length <= 1) {
        return;
      }
      setCardMotion({ delta, axis });
      setIndex((current) => stepDeckIndex(current, delta, items.length));
    },
    [items.length],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1, 'x');
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1, 'x');
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const scroller = scrollRef.current;
        if (!scroller) {
          return;
        }
        event.preventDefault();
        scroller.scrollBy({ top: event.key === 'ArrowDown' ? 72 : -72 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [deck?.id, item?.id]);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) {
      return;
    }
    const next = resolveCardSwipe(event.clientX - start.x, event.clientY - start.y);
    if (next) {
      step(next.delta, next.axis);
    }
  };

  const offset = prefersReducedMotion ? 0 : cardMotion.axis === 'x' ? cardMotion.delta * 48 : 0;
  const offsetY = prefersReducedMotion ? 0 : cardMotion.axis === 'y' ? cardMotion.delta * 36 : 0;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `积累 - ${siteConfig.title}`,
    description: pageDescription,
    url: absoluteSiteUrl('/accumulate', siteConfig.url),
    inLanguage: 'zh-CN',
    isPartOf: {
      '@type': 'WebSite',
      name: siteConfig.title,
      url: absoluteSiteUrl('/', siteConfig.url),
    },
  };

  return (
    <div className="relative -mx-3 flex h-[calc(100dvh-6.5rem-env(safe-area-inset-top,0px)-var(--tab-bar-height,0px))] min-h-[28rem] w-[calc(100%+1.5rem)] overflow-hidden sm:-mx-6 sm:w-[calc(100%+3rem)] md:h-[calc(100dvh-7.5rem-env(safe-area-inset-top,0px))]">
      <Seo
        title="积累"
        description={pageDescription}
        url="/accumulate"
        structuredData={[...buildSiteSchemas(pageDescription), schema]}
      />
      <h1 className="sr-only">积累</h1>

      {decks.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center px-6 text-sm text-zinc-500">
          在 Summary/ 下按子目录放置 Markdown 后刷新
        </div>
      ) : (
        <>
          <aside className="z-20 w-24 shrink-0 overflow-y-auto bg-paper/75 p-2 backdrop-blur-sm dark:bg-zinc-950/55 sm:w-36 sm:p-4">
            <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">分类</p>
            <ul className="space-y-0.5">
              {decks.map((entry) => {
                const active = entry.id === deck?.id;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => selectDeck(entry.id)}
                      aria-pressed={active}
                      className={`w-full rounded-md px-2 py-2 text-left text-sm transition-colors ${
                        active
                          ? 'bg-zinc-900/90 font-medium text-white dark:bg-zinc-100/90 dark:text-zinc-900'
                          : 'text-zinc-600 hover:bg-white/50 dark:text-zinc-300 dark:hover:bg-zinc-900/40'
                      }`}
                    >
                      <span className="block">{entry.title}</span>
                      <span
                        className={`mt-0.5 block text-[10px] font-normal ${
                          active ? 'text-white/70 dark:text-zinc-900/60' : 'text-zinc-400'
                        }`}
                      >
                        {entry.items.length} 条
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="relative min-h-0 min-w-0 flex-1">
            <div
              ref={scrollRef}
              role="region"
              aria-label="当前内容"
              className="flex h-full flex-col overflow-y-auto overscroll-contain"
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                swipeStartRef.current = null;
              }}
            >
              {item ? (
                <motion.article
                  key={`${deck?.id ?? 'deck'}-${item.id}`}
                  aria-live="polite"
                  className="m-auto w-full max-w-2xl px-5 py-8 text-center sm:px-8"
                  initial={prefersReducedMotion ? false : { opacity: 0, x: offset, y: offsetY }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.28 }}
                >
                  <CardBody item={item} deckTitle={deck?.title ?? ''} />
                  <p className="mt-6 text-xs tabular-nums tracking-widest text-zinc-400">
                    {safeIndex + 1} / {items.length}
                  </p>
                </motion.article>
              ) : (
                <p className="m-auto text-center text-sm text-zinc-400">这个分类还没有内容</p>
              )}
            </div>

            <EdgeButton
              label="左侧边缘，上一项"
              className="inset-y-0 left-0 w-[14%]"
              disabled={!canStep}
              onClick={() => step(-1, 'x')}
              onWheel={(event) => {
                scrollRef.current?.scrollBy({ top: event.deltaY });
              }}
            />
            <EdgeButton
              label="右侧边缘，下一项"
              className="inset-y-0 right-0 w-[14%]"
              disabled={!canStep}
              onClick={() => step(1, 'x')}
              onWheel={(event) => {
                scrollRef.current?.scrollBy({ top: event.deltaY });
              }}
            />
            <EdgeButton
              label="上方边缘，上一项"
              className="inset-x-[14%] top-0 h-[10%]"
              disabled={!canStep}
              onClick={() => step(-1, 'y')}
              onWheel={(event) => {
                scrollRef.current?.scrollBy({ top: event.deltaY });
              }}
            />
            <EdgeButton
              label="下方边缘，下一项"
              className="inset-x-[14%] bottom-0 h-[10%]"
              disabled={!canStep}
              onClick={() => step(1, 'y')}
              onWheel={(event) => {
                scrollRef.current?.scrollBy({ top: event.deltaY });
              }}
            />
          </div>

          <aside className="z-20 w-24 shrink-0 overflow-y-auto border-l border-zinc-200/70 bg-paper/75 p-2 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/55 sm:w-40 sm:p-4">
            <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">跳转</p>
            <ul className="space-y-0.5">
              {items.map((entry, entryIndex) => {
                const active = entry.id === item?.id;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => selectItem(entryIndex)}
                      aria-current={active ? 'true' : undefined}
                      className={`w-full rounded-md px-2 py-2 text-left text-xs transition-colors sm:text-sm ${
                        active
                          ? 'bg-zinc-900/90 font-medium text-white dark:bg-zinc-100/90 dark:text-zinc-900'
                          : 'text-zinc-600 hover:bg-white/50 dark:text-zinc-300 dark:hover:bg-zinc-900/40'
                      }`}
                    >
                      <span className="line-clamp-2">{entry.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </>
      )}
    </div>
  );
};

const SUMMARY_IMAGE_EDGE = 224;

const SummaryImage = ({ filePath, src, alt }: { filePath: string; src?: string; alt?: string }) => {
  const siblingUrl = siblingContentImageUrl(filePath, src, SUMMARY_IMAGE_OPTIONS);
  const resolvedSrc = siblingUrl
    ? assetUrl(siblingUrl)
    : src && (/^[a-z][a-z\d+.-]*:/i.test(src) || src.startsWith('/'))
      ? assetUrl(src)
      : undefined;
  if (!resolvedSrc) {
    return null;
  }

  return (
    <figure className="not-prose mx-auto my-8">
      <ProgressiveImage
        src={resolvedSrc}
        alt={alt || ''}
        width={SUMMARY_IMAGE_EDGE}
        height={SUMMARY_IMAGE_EDGE}
        loading="lazy"
        effect="fade"
        wrapperClassName="mx-auto h-56 w-56 overflow-hidden rounded-2xl"
        className="h-full w-full object-cover"
      />
    </figure>
  );
};

const CardBody = ({ item, deckTitle }: { item: AccumulateItem; deckTitle: string }) => {
  const markdownComponents = useMemo(
    () => ({
      p: ({
        children,
        node,
      }: {
        children?: React.ReactNode;
        node?: { children?: Array<{ type?: string; tagName?: string }> };
      }) => {
        const onlyImage =
          node?.children?.length === 1 && node.children[0]?.type === 'element' && node.children[0]?.tagName === 'img';
        if (onlyImage) {
          return <div>{children}</div>;
        }
        return <p>{children}</p>;
      },
      img: ({ src, alt }: { src?: string; alt?: string }) => (
        <SummaryImage filePath={item.filePath} src={src} alt={alt} />
      ),
    }),
    [item.filePath],
  );

  return (
    <div>
      <p className="text-[10px] font-medium tracking-[0.18em] text-zinc-400">{deckTitle}</p>
      {item.status || item.author ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {item.status ? <SummaryLabel>{item.status}</SummaryLabel> : null}
          {item.author ? <SummaryLabel>{item.author}</SummaryLabel> : null}
        </div>
      ) : null}
      <h2 className="mt-3 font-serif text-xl font-bold leading-snug text-ink dark:text-white sm:text-2xl">
        {item.title}
      </h2>
      {item.content ? (
        <div className="prose prose-stone mx-auto mt-4 max-w-xl text-left dark:prose-invert prose-p:my-2 prose-p:text-sm prose-p:leading-7 sm:prose-p:text-base">
          <ReactMarkdown remarkPlugins={remarkCommonPlugins} components={markdownComponents}>
            {item.content}
          </ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
};

const SummaryLabel = ({ children }: { children: string }) => (
  <span className="inline-flex rounded-full border border-zinc-300 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-600 dark:text-zinc-300">
    {children}
  </span>
);

const EdgeButton = ({
  label,
  className,
  disabled,
  onClick,
  onWheel,
}: {
  label: string;
  className: string;
  disabled: boolean;
  onClick: () => void;
  onWheel: (event: React.WheelEvent<HTMLButtonElement>) => void;
}) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    onWheel={onWheel}
    onPointerDown={(event) => event.stopPropagation()}
    className={`absolute z-10 cursor-pointer bg-transparent disabled:cursor-default ${className}`}
  />
);

export default Accumulate;
