/**
 * 文章详情页：Markdown 渲染（代码高亮/数学公式/Mermaid）、阅读进度、目录、分享。
 */

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { createMarkdownComponents, useMarkdownEnhancements } from '@/components/markdown/MarkdownBody';

import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Calendar,
  ChevronRight,
  Share2,
  Users,
  ExternalLink,
  Eye,
  EyeOff,
  BookOpen,
  Github,
} from 'lucide-react';
import { getPostById, getPosts } from '@/services/posts';
import { getReadingHistoryEntry, saveReadingHistory } from '@/services/readingHistory';
import { getRelatedPosts, getSeriesNavigation, type SeriesNavigation } from '@/utils/postRelations';
import { getReadingProgress, getScrollTopForReadingProgress, isReadingComplete } from '@/utils/readingProgress';
import type { Post as PostType, PostAuthor, PostMetadata } from '../types';
import { assetUrl, absoluteSiteUrl } from '@/utils/siteUrl';
const resolveBrowserAsset = (value?: string) =>
  !value || /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//') ? value : assetUrl(value);
import { siteConfig } from '@config/site.config';
import { Seo, buildSiteSchemas } from '../components/Seo';
import { ProgressiveImage } from '@/components/ProgressiveImage';
import { CompactPostCard } from '@/components/CompactPostCard';
import { FlashCover, PostRankFrame } from '@/components/RankFlash';
import { NotFoundState } from '@/components/NotFoundState';
import { IssueSubscriptionCard } from '@/components/IssueSubscriptionCard';
import { ContentStatus, LoadingStatus } from '@/components/ContentStatus';
import { extractMarkdownHeadings } from '@/utils/headings';
import { formatDate } from '@/utils/date';
import { stripMarkdown } from '@/utils/markdownText';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { hasOpenOverlay } from '@/hooks/useModalOverlay';
import { useReadingMode } from '@/components/ReadingModeContext';
import { ReadingModeToggle } from '@/components/ReadingModeToggle';
import { GiscusComments } from '@/components/GiscusComments';
import { useSsgRouteData } from '@/ssr/routeData';
import { fillBusuanziSpans } from '@/services/busuanzi';
import { HEADING_SCROLL_OFFSET } from '@/utils/scroll';

const formatMetaDate = (dateText?: string) => {
  if (!dateText) {
    return '';
  }

  return formatDate(dateText, 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const getDisplayAuthors = (post: PostType): PostAuthor[] => {
  if (post.authors && post.authors.length > 0) {
    return post.authors;
  }

  return [
    {
      name: siteConfig.author.name,
      avatar: siteConfig.author.avatar,
      role: siteConfig.author.role,
      bio: siteConfig.author.bio,
    },
  ];
};

const ImageViewer = lazy(() => import('../components/ImageViewer').then((m) => ({ default: m.ImageViewer })));
const ShareModal = lazy(() => import('../components/ShareModal').then((m) => ({ default: m.ShareModal })));
const TableOfContents = lazy(() =>
  import('../components/TableOfContents').then((m) => ({ default: m.TableOfContents })),
);
const ReadingProgressBadge = lazy(() =>
  import('../components/ReadingProgressBadge').then((m) => ({ default: m.ReadingProgressBadge })),
);
/** hash 深链滚动校正上限：Mermaid/懒加载内容导致的布局变化最多校正次数。 */
const HASH_SCROLL_MAX_CORRECTIONS = 12;
/** hash 深链滚动校正时间窗（毫秒）：内容稳定后自动断开观察器。 */
const HASH_SCROLL_CORRECTION_WINDOW_MS = 3000;
const READING_SCROLL_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  ' ',
]);

const isEditableKeyboardTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
};

/** 从阅读时长文案解析分钟数：优先「N分钟」，其次「N小时」×60，最后回退首个数字。 */
const parseReadMinutes = (readTime: string): number => {
  const minutesMatch = readTime.match(/(\d+(?:\.\d+)?)\s*分钟/);
  if (minutesMatch) return Math.round(Number(minutesMatch[1]));
  const hoursMatch = readTime.match(/(\d+(?:\.\d+)?)\s*小时/);
  if (hoursMatch) return Math.round(Number(hoursMatch[1]) * 60);
  const firstNumber = readTime.match(/\d+/);
  return firstNumber ? Number(firstNumber[0]) : Number.NaN;
};

/**
 * 把仓库地址归一化为 GitHub 网页形态（https://github.com/<owner>/<repo>）：
 * - 去掉末尾斜杠与 .git 后缀；
 * - SSH 形态（git@github.com:owner/repo.git）转换为 HTTPS 网页地址。
 */
const normalizeRepoUrl = (repoUrl: string) => {
  let url = repoUrl.trim().replace(/\/+$/, '');
  const sshMatch = url.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    url = `https://${sshMatch[1]}/${sshMatch[2]}`;
  }
  return url.replace(/\.git$/i, '');
};

/** 文章源文件在仓库中的路径：filePath 形如 /posts/xxx.md 或 /posts/dir/xxx.md，去掉前导斜杠并逐段 URL 编码。 */
const getSourceFilePath = (filePath: string) =>
  filePath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

/** 文章内容仓库与默认分支（"编辑此文"/查看源文件入口）：独立配置，缺省回退友链仓库。
 *  不再复用 friendsPage.repoUrl 直拼，避免内容仓库与友链仓库分离时链接指向错误仓库。 */
const CONTENT_REPO_URL = siteConfig.content?.repoUrl || siteConfig.friendsPage.repoUrl;
const CONTENT_DEFAULT_BRANCH = siteConfig.content?.defaultBranch || 'main';

/** 查看源文件（页尾"帮助改进本文"）。 */
const getPostSourceUrl = (filePath: string) =>
  `${normalizeRepoUrl(CONTENT_REPO_URL)}/blob/${CONTENT_DEFAULT_BRANCH}/${getSourceFilePath(filePath)}`;

/** "在 GitHub 上编辑此文"：跳转到 Markdown 源文件的 GitHub 编辑页。 */
const getPostEditUrl = (filePath: string) =>
  `${normalizeRepoUrl(CONTENT_REPO_URL)}/edit/${CONTENT_DEFAULT_BRANCH}/${getSourceFilePath(filePath)}`;

export const Post = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // SSG 场景：构建期已把文章数据（含正文）注入 routeData，首帧同步渲染正文；
  // SPA 导航到其他文章时 routeData 无数据，回落到异步加载（loading 初始 true）。
  const ssgRouteData = useSsgRouteData();
  const ssgPost = ssgRouteData?.post;
  const hasSsgPost = ssgPost !== undefined && ssgPost.id === id;
  const [post, setPost] = useState<PostType | null>(() => ssgPost ?? null);
  const [loading, setLoading] = useState(!hasSsgPost);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt?: string } | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const { remarkPlugins, rehypePlugins, mermaidRenderer, mermaidTheme } = useMarkdownEnhancements(post?.content ?? '');
  const shouldReduceMotion = useReducedMotion();
  const { isReadingMode, exitReadingMode } = useReadingMode();
  const [adjacentPosts, setAdjacentPosts] = useState<{ prev: PostMetadata | null; next: PostMetadata | null }>(
    ssgRouteData?.adjacentPosts ?? { prev: null, next: null },
  );
  const [seriesNavigation, setSeriesNavigation] = useState<SeriesNavigation | null>(
    ssgRouteData?.seriesNavigation ?? null,
  );
  const [relatedPosts, setRelatedPosts] = useState<PostMetadata[]>(ssgRouteData?.relatedPosts ?? []);
  const articleBodyRef = useRef<HTMLDivElement>(null);
  const readingEndRef = useRef<HTMLDivElement>(null);
  const lastReadingSaveRef = useRef(0);
  // hash 深链跳转 / 阅读位置恢复触发的程序化滚动标记：此类滚动不应被视为
  // 真实阅读进度（否则 hash 打开会覆盖历史中更高的继续阅读记录）。
  const programmaticScrollRef = useRef(false);
  // 阅读进度保存的会话状态。必须放在组件级 ref 中：relatedPosts 等异步数据加载会
  // 触发保存 effect 重跑，若用 effect 内局部变量保存“已读完”等标记，重跑后会被重置，
  // 导致读完后再滚回上方时重新写入部分进度、让主页“继续阅读”卡片复活。
  const readingSessionRef = useRef<{
    postId: string;
    hasScrolled: boolean;
    completed: boolean;
    lastWrittenPercent: number;
  } | null>(null);

  // 不蒜子阅读量 span 在阅读模式切换时才随 meta 行挂载/卸载；从缓存回填一次，
  // 保证退出阅读模式后能即时显示（路由级 Ping 在 Layout 已完成上报）。
  useEffect(() => {
    fillBusuanziSpans();
  }, [isReadingMode, post?.id]);

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setPost(null);
      setLoadError(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    // SSG 场景：当前 id 与构建期注入的路由数据一致（首屏水合 / 从其他文章返回），
    // 直接同步使用 routeData 填充各状态。若此处也走异步重取，水合后会把已渲染的
    // 正文换成骨架屏、并清空相邻/系列/相关文章，造成可见闪烁与布局跳变。
    // 仅当 loadAttempt > 0（用户点击“重新加载”）时才允许绕过 SSG 数据强制重取。
    if (hasSsgPost && loadAttempt === 0) {
      setPost(ssgPost);
      setLoading(false);
      setLoadError(null);
      setAdjacentPosts(ssgRouteData?.adjacentPosts ?? { prev: null, next: null });
      setSeriesNavigation(ssgRouteData?.seriesNavigation ?? null);
      setRelatedPosts(ssgRouteData?.relatedPosts ?? []);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setPost(null);
    setLoadError(null);
    // 加载下一篇文章期间不暴露上一篇文章的导航。
    setAdjacentPosts({ prev: null, next: null });
    setSeriesNavigation(null);
    setRelatedPosts([]);

    getPostById(id)
      .then((data) => {
        if (cancelled) {
          return;
        }

        setPost(data || null);
        setLoadError(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error('文章加载失败:', error);
        setPost(null);
        setLoadError('文章内容加载失败，请检查网络后重试。');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasSsgPost, id, loadAttempt, ssgPost, ssgRouteData]);

  const headings = useMemo(() => extractMarkdownHeadings(post?.content ?? ''), [post?.content]);
  // 正文剥离结果只依赖 post.content，记忆化避免每次重渲染（阅读模式切换、
  // 弹窗开关等）对全文（30-80KB）重跑 12+ 正则链两次
  // （meta description 与 articleBody 共用）。
  const strippedContent = useMemo(() => stripMarkdown(post?.content ?? ''), [post?.content]);

  useEffect(() => {
    if (!post?.content || headings.length === 0 || typeof window === 'undefined') {
      return;
    }

    let hashId = '';
    try {
      hashId = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      // 忽略格式非法的 URL 片段，不中断文章渲染。
      return;
    }

    if (!hashId) {
      return;
    }

    const scrollToHashHeading = () => {
      const element = document.getElementById(hashId);

      if (!element) {
        return;
      }

      // 标记为程序化滚动：hash 深链跳转不是用户阅读行为，不得计入阅读进度。
      programmaticScrollRef.current = true;
      window.scrollTo({
        top: Math.max(0, element.getBoundingClientRect().top + window.scrollY - HEADING_SCROLL_OFFSET),
        behavior: 'auto',
      });
      // 双 rAF 后清除标记：与恢复逻辑保持一致，等待程序化滚动完全落定。
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      });
    };

    const timeoutId = window.setTimeout(scrollToHashHeading, 0);

    // Mermaid/懒加载内容渲染完成后会改变上方布局（占位高度 → 成图高度），把
    // 深链目标标题推离落点；单次 setTimeout 只覆盖首帧。用 ResizeObserver 监听
    // 正文容器，在内容加载导致的布局变化期间重复校正滚动位置。限次/限时自动
    // 断开：内容稳定后不再校正，避免用户手动滚动后仍被迟到的加载（如慢图）
    // 拉回深链位置。
    const articleBody = articleBodyRef.current;
    let corrections = 0;
    // 用户是否已主动中断深链校正（滚动/输入/点击）：一旦中断，迟到的布局变化
    // （慢图、Mermaid）不得再把用户拉回深链位置。
    let userInterrupted = false;
    let resizeObserver: ResizeObserver | undefined;
    const stopCorrecting = () => {
      userInterrupted = true;
      resizeObserver?.disconnect();
    };
    const handleUserScroll = () => {
      // 程序化校正产生的滚动（programmaticScrollRef 为 true）不算用户主动滚动。
      if (!programmaticScrollRef.current) stopCorrecting();
    };
    if (articleBody && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (userInterrupted) return;
        corrections += 1;
        if (corrections > HASH_SCROLL_MAX_CORRECTIONS) {
          resizeObserver?.disconnect();
          return;
        }
        scrollToHashHeading();
      });
      resizeObserver.observe(articleBody);
    }
    const disconnectTimer = window.setTimeout(() => resizeObserver?.disconnect(), HASH_SCROLL_CORRECTION_WINDOW_MS);
    // 校正窗口内监听用户输入：wheel/touch/pointer/键盘滚动都会产生 scroll 事件，
    // 一旦用户主动滚动即永久放弃后续校正（与阅读位置恢复的 stopRestore 同一套路）。
    window.addEventListener('wheel', stopCorrecting, { passive: true });
    window.addEventListener('touchstart', stopCorrecting, { passive: true });
    window.addEventListener('pointerdown', stopCorrecting, { passive: true });
    window.addEventListener('scroll', handleUserScroll, { passive: true });

    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(disconnectTimer);
      window.removeEventListener('wheel', stopCorrecting);
      window.removeEventListener('touchstart', stopCorrecting);
      window.removeEventListener('pointerdown', stopCorrecting);
      window.removeEventListener('scroll', handleUserScroll);
      resizeObserver?.disconnect();
    };
  }, [headings, post?.content]);

  useEffect(() => {
    if (!post) return;
    // SSG 首帧已用 routeData 填充 adjacent/series/related，无需再异步重取；
    // 跳过可避免冗余网络请求，并消除 SSG 数据被异步结果覆盖的时序窗口。
    if (hasSsgPost && loadAttempt === 0) return;
    let cancelled = false;

    getPosts()
      .then((allPosts) => {
        if (cancelled) return;
        const currentIndex = allPosts.findIndex((p) => p.id === post.id);
        const previous = currentIndex > 0 ? allPosts[currentIndex - 1] : null;
        const next = currentIndex < allPosts.length - 1 ? allPosts[currentIndex + 1] : null;
        setAdjacentPosts({ prev: previous, next });
        setSeriesNavigation(getSeriesNavigation(allPosts, post));
        setRelatedPosts(
          getRelatedPosts(allPosts, post, {
            limit: 3,
            excludeIds: [previous?.id, next?.id].filter((value): value is string => Boolean(value)),
          }),
        );
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('相邻文章加载失败:', error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [post, hasSsgPost, loadAttempt]);

  useEffect(() => {
    const target = articleBodyRef.current;
    if (!post || !target || typeof window === 'undefined' || window.location.hash) {
      return;
    }

    const savedEntry = getReadingHistoryEntry(post.id);
    if (!savedEntry || isReadingComplete(savedEntry.progress)) return;

    let cancelled = false;
    let userIntent = false;
    let frame = 0;
    let lastDocumentHeight = -1;
    let stableFrames = 0;
    let programmaticScroll = false;
    let resetProgrammaticFrame = 0;
    let restoreDelay = 0;
    // 结尾哨兵（readingEndRef）紧跟在正文末尾，专注阅读模式下也保留渲染；
    // 若因异常原因持续找不到该节点（如 DOM 尚未就绪），restore() 将无限重排
    // （100% CPU）。连续多次找不到结尾哨兵即放弃恢复，避免死循环。
    let missingEndRefCount = 0;
    const MAX_MISSING_END_REF = 8;
    const restoreGraceUntil = performance.now() + 500;

    const stopRestore = () => {
      userIntent = true;
    };
    const handleScroll = () => {
      if (!programmaticScroll && performance.now() >= restoreGraceUntil) stopRestore();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isEditableKeyboardTarget(event.target) && READING_SCROLL_KEYS.has(event.key)) stopRestore();
    };
    const scheduleRestore = () => {
      if (!frame && !cancelled && !userIntent) frame = window.requestAnimationFrame(restore);
    };
    const scheduleDelayedRestore = () => {
      if (restoreDelay || cancelled || userIntent) return;
      const delay = Math.max(restoreGraceUntil - performance.now(), 0);
      restoreDelay = window.setTimeout(() => {
        restoreDelay = 0;
        scheduleRestore();
      }, delay);
    };
    const scheduleLayoutRestore = () => {
      if (performance.now() < restoreGraceUntil) {
        scheduleDelayedRestore();
        return;
      }
      scheduleRestore();
    };
    const restore = () => {
      frame = 0;
      if (cancelled || userIntent) return;
      const documentHeight = document.documentElement.scrollHeight;
      stableFrames = documentHeight === lastDocumentHeight ? stableFrames + 1 : 0;
      lastDocumentHeight = documentHeight;
      const rect = target.getBoundingClientRect();
      const endTarget = readingEndRef.current;
      const endRect = endTarget?.getBoundingClientRect();
      if (!endTarget || !endRect) {
        missingEndRefCount += 1;
        // 结尾哨兵持续缺失（如已进入专注阅读模式）：放弃恢复，避免无限重排。
        if (missingEndRefCount >= MAX_MISSING_END_REF) {
          return;
        }
        scheduleLayoutRestore();
        return;
      }
      missingEndRefCount = 0;
      const top = getScrollTopForReadingProgress(
        {
          rect,
          endRect,
          viewportHeight: window.innerHeight,
          scrollY: window.scrollY,
          documentHeight,
        },
        savedEntry.progress,
      );
      programmaticScroll = true;
      programmaticScrollRef.current = true;
      window.scrollTo({ top, behavior: 'auto' });
      if (resetProgrammaticFrame) window.cancelAnimationFrame(resetProgrammaticFrame);
      resetProgrammaticFrame = window.requestAnimationFrame(() => {
        resetProgrammaticFrame = window.requestAnimationFrame(() => {
          programmaticScroll = false;
          programmaticScrollRef.current = false;
        });
      });
      // 布局稳定后重新应用（图片、代码高亮、数学公式会改变文章高度）。
      if (stableFrames < 2) scheduleRestore();
    };
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleLayoutRestore) : null;

    window.addEventListener('wheel', stopRestore, { passive: true });
    window.addEventListener('touchstart', stopRestore, { passive: true });
    window.addEventListener('pointerdown', stopRestore, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', scheduleLayoutRestore);
    // 仅观察正文容器：正文内图片/高亮/Mermaid 的布局变化需要重排恢复；正文下方
    // （许可/相关文章/评论区）高度变化不影响正文内容位置，且会把静止用户反复
    // 钉回保存进度。窗口 resize 已由上方事件监听兜底。
    resizeObserver?.observe(target);
    scheduleDelayedRestore();

    return () => {
      cancelled = true;
      window.removeEventListener('wheel', stopRestore);
      window.removeEventListener('touchstart', stopRestore);
      window.removeEventListener('pointerdown', stopRestore);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', scheduleLayoutRestore);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      if (restoreDelay) window.clearTimeout(restoreDelay);
      if (resetProgrammaticFrame) window.cancelAnimationFrame(resetProgrammaticFrame);
    };
  }, [post, headings.length]);

  useEffect(() => {
    const target = articleBodyRef.current;
    if (!post || !target || typeof window === 'undefined') {
      return;
    }

    // 同一篇文章的会话状态跨 effect 重跑复用；切换文章时重置。
    const session = readingSessionRef.current;
    if (!session || session.postId !== post.id) {
      readingSessionRef.current = {
        postId: post.id,
        hasScrolled: false,
        completed: false,
        // 上次写入的整百分数。挂载时的基线测量（通常在滚动恢复前为 0）不允许直接写库，
        // 否则会覆盖既有的继续阅读记录（如带 hash 打开文章、或用户在恢复窗口内滚动时）。
        lastWrittenPercent: Math.round((getReadingHistoryEntry(post.id)?.progress ?? 0) * 100),
      };
    }
    const state = readingSessionRef.current!;

    let animationFrame = 0;
    let latestProgress = 0;
    let hasProgressSnapshot = false;
    lastReadingSaveRef.current = 0;
    const saveLatestProgress = () => {
      // 仅真实用户滚动后才允许落库：程序化滚动（hash 深链/位置恢复）期间的
      // 进度快照不得覆盖既有的继续阅读记录。
      if (
        !hasProgressSnapshot ||
        !state.hasScrolled ||
        state.completed ||
        latestProgress <= 0 ||
        isReadingComplete(latestProgress)
      )
        return;
      const percent = Math.round(latestProgress * 100);
      if (percent === state.lastWrittenPercent) return;
      state.lastWrittenPercent = percent;
      lastReadingSaveRef.current = Date.now();
      saveReadingHistory({ postId: post.id, progress: latestProgress });
    };
    const updateReadingHistory = () => {
      animationFrame = 0;
      const rect = target.getBoundingClientRect();
      const endRect = readingEndRef.current?.getBoundingClientRect();
      const progress = getReadingProgress({
        rect,
        endRect,
        viewportHeight: window.innerHeight,
        scrollY: window.scrollY,
        documentHeight: document.documentElement.scrollHeight,
      });
      latestProgress = progress;
      hasProgressSnapshot = true;
      const now = Date.now();
      // 首次测量仅为基线：仅在真实滚动事件后到达结尾才判定读完，
      // 避免短文章因首页没有滚动区间而被误判为已完成。
      if (state.hasScrolled && isReadingComplete(progress)) {
        if (!state.completed) {
          // 读完即视为结束：删除“继续阅读”记录；本次会话内不再写任何部分进度，
          // 避免滚回上方后把已完成的文章重新加回主页卡片。
          state.completed = true;
          state.lastWrittenPercent = 100;
          lastReadingSaveRef.current = now;
          saveReadingHistory({ postId: post.id, progress });
        }
        return;
      }
      // 会话已完成：丢弃后续一切写入（含 effect 重跑后的首次测量）。
      if (state.completed) {
        return;
      }
      // 进度为 0（正文尚未进入阅读区，或滚回页面顶部）时不写入，避免覆盖既有记录；
      // 未发生真实用户滚动（仅程序化 hash/恢复滚动）时同样不写入。
      if (!state.hasScrolled || progress <= 0 || isReadingComplete(progress) || now - lastReadingSaveRef.current < 1000)
        return;
      const percent = Math.round(progress * 100);
      if (percent === state.lastWrittenPercent) return;
      state.lastWrittenPercent = percent;
      lastReadingSaveRef.current = now;
      saveReadingHistory({ postId: post.id, progress });
    };
    const scheduleUpdate = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(updateReadingHistory);
    };
    const handleScroll = () => {
      // 程序化滚动（hash 深链跳转、阅读位置恢复）不代表用户阅读行为，
      // 不标记 hasScrolled，也不触发进度测量写入。
      if (programmaticScrollRef.current) {
        return;
      }
      state.hasScrolled = true;
      scheduleUpdate();
    };

    scheduleUpdate();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', scheduleUpdate);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      saveLatestProgress();
    };
    // 只依赖 post：relatedPosts 等异步数据到达会触发 effect 重跑，但 effect
    // 内部不使用它们，依赖它们的 length 只会无谓重置 1s 节流窗口（cleanup 的
    // saveLatestProgress 还会多一次不受节流的写入）。
  }, [post]);

  useEffect(() => {
    if (isReadingMode && shareModalOpen) {
      setShareModalOpen(false);
    }
  }, [isReadingMode, shareModalOpen]);

  // 键盘快捷键通过 ref 读取最新值，而不是把 state 闭包进 listener：
  // 否则每次 adjacentPosts/previewImage/shareModalOpen 变化都要卸载重挂
  // listener，存在「状态已更新、listener 尚未换新」的竞态窗口 —— 期间
  // Alt+←/→ 会命中旧闭包（如 adjacentPosts 仍为空）静默不导航。
  // ref 在渲染期同步最新值，一旦 UI 已展示相邻导航，快捷键必然拿到最新数据。
  const adjacentPostsRef = useRef(adjacentPosts);
  adjacentPostsRef.current = adjacentPosts;
  const previewImageRef = useRef(previewImage);
  previewImageRef.current = previewImage;
  const shareModalOpenRef = useRef(shareModalOpen);
  shareModalOpenRef.current = shareModalOpen;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (hasOpenOverlay()) {
        return;
      }

      // 按住不放时 keydown 以 ~30ms 间隔连续触发（repeat），而首次 navigate 后
      // adjacentPosts 要到 effect 阶段才清空 —— 期间的 repeat 事件仍持有旧值，
      // 会对同一篇文章重复入栈（浏览器返回要多按几次才能回原页）。
      if (e.repeat) {
        return;
      }

      if (e.key === 'Escape') {
        if (previewImageRef.current) {
          setPreviewImage(null);
          return;
        }
        if (shareModalOpenRef.current) {
          setShareModalOpen(false);
          return;
        }
      }
      // 无相邻文章（首篇/末篇/加载中）时 Alt+←/→ 也必须 preventDefault：
      // 否则退化为浏览器历史后退/前进，用户会意外离开当前页面。
      if (e.key === 'ArrowLeft' && e.altKey) {
        e.preventDefault();
        if (adjacentPostsRef.current.prev) {
          navigate(`/post/${adjacentPostsRef.current.prev.id}`);
        }
      }
      if (e.key === 'ArrowRight' && e.altKey) {
        e.preventDefault();
        if (adjacentPostsRef.current.next) {
          navigate(`/post/${adjacentPostsRef.current.next.id}`);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // 每次渲染重建渲染组件对象（不做 useMemo 缓存）：resolveHeadingId 的
  // heading id 游标/兜底计数活在 createMarkdownComponents 的闭包里，缓存复用
  // 时 ReactMarkdown 在任意状态变化（相邻/相关文章加载、弹窗开关等）
  // 后重渲染正文都会沿用已走到末尾的游标，全部标题 id 退化为 slug-N 兜底并逐
  // 次递增（-1、-2…），与构建期 headings 数组的 id 发散——目录点击找不到
  // 锚点、hash 深链失效。每次渲染重建即游标归零，DOM id 恒与 headings 一致。
  const markdownComponents = createMarkdownComponents(
    (image) => setPreviewImage(image),
    mermaidRenderer,
    mermaidTheme,
    post?.imageDimensions,
    headings,
    shouldReduceMotion,
    post?.filePath,
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl pt-10" aria-busy="true">
        <LoadingStatus label="正在加载文章内容" />
        <div aria-hidden="true" className={`mb-16 text-center ${shouldReduceMotion ? '' : 'animate-pulse'}`}>
          <div className="mx-auto mb-10 h-6 w-24 rounded-micro bg-zinc-200 dark:bg-zinc-800" />
          <div className="mx-auto mb-8 h-12 w-3/4 rounded-micro bg-zinc-200 dark:bg-zinc-800 md:h-16" />
          <div className="flex justify-center space-x-6">
            <div className="h-4 w-28 rounded-micro bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-32 rounded-micro bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-20 rounded-micro bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </div>

        <div
          aria-hidden="true"
          className="mb-20 aspect-[21/9] w-full animate-pulse rounded-media bg-zinc-200 dark:bg-zinc-800"
        />

        <div aria-hidden="true" className="mx-auto max-w-3xl animate-pulse space-y-6 pb-32">
          <div className="h-5 w-full rounded-micro bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-11/12 rounded-micro bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-full rounded-micro bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-4/5 rounded-micro bg-zinc-200 dark:bg-zinc-800" />
          <div className="my-10 h-40 w-full rounded-media bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-full rounded-micro bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-5/6 rounded-micro bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl pt-10">
        <ContentStatus
          variant="error"
          title="文章加载失败"
          description={loadError}
          actionLabel="重新加载"
          onAction={() => setLoadAttempt((attempt) => attempt + 1)}
        />
      </div>
    );
  }

  if (!post) {
    return (
      <>
        {/* 文章不存在：SPA 内以 200 响应返回该内容，必须 noindex，
            避免爬虫把已删除文章的 URL 视为可索引页面收录。 */}
        <Seo title="未找到这篇文章" description="你访问的文章不存在，可能已经删除或链接失效。" noindex />
        <NotFoundState
          title="未找到这篇文章"
          description="这篇文章可能还在草稿中、已经被删除，或者链接地址已经发生变化。"
          debugLabel={`Post ID: ${id || 'unknown'}`}
        />
      </>
    );
  }

  // 摘录过短时（<30 字）meta description 会显得贫瘠，搜索摘要也不完整。
  // 此时从正文中取首个有实质内容的段落作为描述；摘录够长时仍以作者
  // 撰写的摘录为准（语义更精准）。
  const MAX_DESC_PARAGRAPH_CHARS = 110;
  const buildMetaDescription = (currentPost: PostType): string => {
    const excerpt = (currentPost.excerpt || '').trim();
    if (excerpt.length >= 30) {
      return excerpt;
    }
    const firstSubstantial = strippedContent
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
      .find((paragraph) => paragraph.length >= 20);
    if (!firstSubstantial) {
      return excerpt;
    }
    return firstSubstantial.length > MAX_DESC_PARAGRAPH_CHARS
      ? `${firstSubstantial.slice(0, MAX_DESC_PARAGRAPH_CHARS).trimEnd()}…`
      : firstSubstantial;
  };

  const authors = getDisplayAuthors(post);
  const authorsLabel = authors.map((author) => author.name).join('\u3001');
  const postDescription = buildMetaDescription(post);
  // 阅读时长（分钟）：由 readTime 文案（如「7分钟阅读」）解析，用于 Article 的 timeRequired。
  // 优先匹配「N分钟」，其次「N小时」×60；不能直接取第一个数字——文案含多个数字
  // （如"约 10 分钟（2 小时更新）"）或小时制时都会解析出错。
  const readMinutes = parseReadMinutes(post.readTime);
  const postStructuredData = {
    '@context': 'https://schema.org',
    // BlogPosting 是 Article 的子类型，Google 对博客文章富结果更认可该类型。
    '@type': 'BlogPosting',
    headline: post.title,
    description: postDescription,
    image: post.coverImage
      ? [absoluteSiteUrl(post.coverImage, siteConfig.url)]
      : siteConfig.seoImage.trim()
        ? [absoluteSiteUrl(siteConfig.seoImage, siteConfig.url)]
        : undefined,
    datePublished: post.date,
    dateModified: post.updatedAt || post.date,
    author: authors.map((author) => {
      const isSiteAuthor = author.name === siteConfig.author.name;
      return {
        '@type': 'Person',
        name: author.name,
        ...(author.url ? { url: author.url } : {}),
        // 站点作者补齐同源社交链接与邮箱，增强实体可信度；
        // 其他作者沿用其 frontmatter 提供的 url。
        ...(isSiteAuthor
          ? {
              sameAs: [siteConfig.social.github],
              email: siteConfig.social.rawEmail,
            }
          : {}),
      };
    }),
    articleBody: strippedContent,
    wordCount: post.wordCount,
    // timeRequired（ISO 8601 时长，如 PT7M）：Article 富结果字段，助搜索结果展示阅读时长。
    ...(Number.isInteger(readMinutes) && readMinutes > 0 ? { timeRequired: `PT${readMinutes}M` } : {}),
    inLanguage: 'zh-CN',
    articleSection: post.category,
    isPartOf: {
      '@type': 'WebSite',
      name: siteConfig.title,
      url: absoluteSiteUrl('/', siteConfig.url),
    },
    mainEntityOfPage: absoluteSiteUrl(`/post/${post.id}`, siteConfig.url),
    publisher: {
      '@type': 'Organization',
      name: siteConfig.title,
      url: siteConfig.url,
      ...(siteConfig.logo.trim()
        ? {
            logo: {
              '@type': 'ImageObject',
              url: absoluteSiteUrl(siteConfig.logo, siteConfig.url),
            },
          }
        : {}),
    },
    keywords: post.tags?.join(', '),
  };

  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首页', item: absoluteSiteUrl('/', siteConfig.url) },
      {
        '@type': 'ListItem',
        position: 2,
        name: post.category,
        item: absoluteSiteUrl(`/?category=${encodeURIComponent(post.category)}`, siteConfig.url),
      },
      { '@type': 'ListItem', position: 3, name: post.title, item: absoluteSiteUrl(`/post/${post.id}`, siteConfig.url) },
    ],
  };

  return (
    <>
      <ReadingModeToggle />

      <Suspense fallback={null}>
        {previewImage && (
          <ImageViewer src={previewImage.src} alt={previewImage.alt} onClose={() => setPreviewImage(null)} />
        )}
        {/* 阅读进度徽标与目录按钮常驻：不随滚动位置显隐（用户反馈需求）。 */}
        {!isReadingMode && <ReadingProgressBadge targetRef={articleBodyRef} endRef={readingEndRef} />}
        {!isReadingMode && headings.length > 0 && <TableOfContents headings={headings} />}
      </Suspense>

      <article className={isReadingMode ? 'post-article reading-mode-article' : 'post-article'}>
        {isReadingMode && (
          <button
            type="button"
            onClick={exitReadingMode}
            className="reading-mode-exit print-hidden fixed right-4 top-[calc(1rem+env(safe-area-inset-top,0px))] z-floating inline-flex min-h-11 items-center gap-2 rounded-control border border-zinc-300 bg-paper px-3 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-800 sm:right-6 sm:top-[calc(1.5rem+env(safe-area-inset-top,0px))]"
            aria-label="退出专注阅读"
          >
            <EyeOff size={16} />
            <span className="hidden sm:inline">退出专注阅读</span>
          </button>
        )}

        <Seo
          title={post.title}
          description={postDescription}
          image={post.coverImage}
          imageWidth={post.coverWidth}
          imageHeight={post.coverHeight}
          url={`/post/${post.id}`}
          type="article"
          publishedTime={post.date}
          modifiedTime={post.updatedAt || post.date}
          authors={authors.map((author) => author.name)}
          section={post.category}
          tags={post.tags}
          keywords={post.tags?.join(', ')}
          // 站点级 WebSite + Organization schema 与文章级 BlogPosting 一并输出，
          // 保证全站各页 schema 一致（publisher 的 Organization 与站点级互不影响）。
          structuredData={[...buildSiteSchemas(post.excerpt), postStructuredData, breadcrumbData]}
        />

        <header className="post-header mx-auto mb-8 max-w-3xl px-3 pt-4 text-center md:mb-12 md:pt-8">
          {!isReadingMode && (
            <div className="print-hidden mb-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400 md:mb-7">
              <Link
                to="/"
                className="inline-flex items-center gap-1 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                <ArrowLeft size={13} />
                返回文章
              </Link>
              <span aria-hidden="true">/</span>
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
                <Link to="/" className="transition-colors hover:text-zinc-700 dark:hover:text-zinc-300">
                  首页
                </Link>
                <ChevronRight size={11} aria-hidden="true" />
                <Link
                  to={`/?category=${encodeURIComponent(post.category)}`}
                  className="truncate transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  {post.category}
                </Link>
              </nav>
            </div>
          )}

          {/* LCP 元素首帧即渲染最终可见状态，不设入场动画（避免 SSR 输出 opacity:0） */}
          <PostRankFrame rank={post.rank} quiet={isReadingMode}>
            <h1 className="mb-5 break-words text-balance text-[1.875rem] font-bold leading-[1.25] tracking-[-0.01em] text-ink [overflow-wrap:anywhere] dark:text-white md:mb-6 md:text-[2.5rem] lg:text-[2.75rem]">
              {post.title}
            </h1>

            {!isReadingMode && (
              <div className="post-meta print-hidden mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 sm:gap-x-5">
                <span className="inline-flex max-w-full items-center gap-1.5">
                  <Users size={14} className="shrink-0 opacity-70" />
                  <span className="truncate font-semibold text-zinc-800 dark:text-zinc-200">{authorsLabel}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={14} className="shrink-0 opacity-70" />
                  <span>发布于 {formatMetaDate(post.date)}</span>
                </span>
                {post.updatedAt && post.updatedAt !== post.date && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar size={14} className="shrink-0 opacity-70" />
                    <span>更新 {formatMetaDate(post.updatedAt)}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={14} className="shrink-0 opacity-70" />
                  <span>{post.readTime}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 tabular-nums" title="由不蒜子提供本页阅读量">
                  <Eye size={14} className="shrink-0 opacity-70" />
                  <span>
                    <span id="busuanzi_page_pv">加载中</span> 次阅读
                  </span>
                </span>
              </div>
            )}

            {/* 编辑 / 分享操作独立一行：与上方文章信息行分开排版 */}
            {!isReadingMode && (
              <div className="print-hidden mt-3 flex flex-wrap items-center justify-center gap-2">
                {post.filePath && (
                  <a
                    href={getPostEditUrl(post.filePath)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`在 GitHub 上编辑此文：${post.title}`}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-[6px] border border-[#d0d7de] bg-white px-3 py-1.5 text-xs font-semibold text-[#57606a] transition-colors hover:border-[#0969da] hover:text-[#0969da] dark:border-[#30363d] dark:bg-transparent dark:text-[#8b949e] dark:hover:border-[#58a6ff] dark:hover:text-[#58a6ff]"
                  >
                    <Github size={14} />
                    编辑
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setShareModalOpen(true)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-[6px] border border-[#d0d7de] bg-white px-3 py-1.5 text-xs font-semibold text-[#57606a] transition-colors hover:border-[#0969da] hover:text-[#0969da] dark:border-[#30363d] dark:bg-transparent dark:text-[#8b949e] dark:hover:border-[#58a6ff] dark:hover:text-[#58a6ff]"
                  aria-label={`分享文章：${post.title}`}
                >
                  <Share2 size={14} />
                  分享
                </button>
              </div>
            )}
          </PostRankFrame>
        </header>

        {post.coverImage && (
          <button
            type="button"
            className="post-cover print-hidden mx-auto block w-full max-w-5xl px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100 sm:px-4 lg:px-0"
            onClick={() => setPreviewImage({ src: resolveBrowserAsset(post.coverImage!)!, alt: post.title })}
            aria-label={`预览文章封面：${post.title}`}
          >
            <FlashCover rank={post.rank} className="mb-8 md:mb-14">
              <div className="aspect-[16/10] cursor-zoom-in overflow-hidden rounded-[6px] sm:aspect-[16/8] lg:aspect-[21/9]">
                <ProgressiveImage
                  src={resolveBrowserAsset(post.coverImage)}
                  alt={post.title}
                  loading="eager"
                  fetchPriority="high"
                  width={post.coverWidth}
                  height={post.coverHeight}
                  sizes="(max-width: 767px) 100vw, (max-width: 1279px) 80vw, 1024px"
                  wrapperClassName="h-full w-full"
                  className="h-full w-full object-cover"
                />
              </div>
            </FlashCover>
          </button>
        )}

        <div ref={articleBodyRef} className="post-body mx-auto w-full max-w-5xl px-3 pb-12 sm:px-4 md:pb-20 lg:px-0">
          <div className="post-content w-full">
            <div className="post-prose prose max-w-none dark:prose-invert md:prose-lg prose-headings:scroll-mt-24 prose-a:break-words">
              <ReactMarkdown
                remarkPlugins={remarkPlugins}
                rehypePlugins={rehypePlugins}
                components={markdownComponents}
              >
                {post.content}
              </ReactMarkdown>
            </div>

            {/* 结尾哨兵紧跟正文末尾：正文最后一行进入视口中间即视为读完。
                许可协议/作者/导航/推荐/评论等均不计入文章长度。此节点在专注阅读
                模式下也保留渲染，保证两种模式下的进度口径完全一致。 */}
            <div ref={readingEndRef} aria-hidden="true" className="h-0" />

            {!isReadingMode && (
              <aside
                className="post-license mt-14 border-l-2 border-zinc-200 pl-4 text-sm leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 md:mt-16 md:pl-5"
                aria-labelledby="license-heading"
              >
                <h2 id="license-heading" className="mb-1 font-semibold text-zinc-700 dark:text-zinc-200">
                  CC BY-SA 4.0 许可协议
                </h2>
                <p>
                  本文由 <strong className="font-semibold text-zinc-700 dark:text-zinc-200">{authorsLabel}</strong>{' '}
                  原创。除非另有声明，可在署名并以相同协议发布衍生作品的前提下自由复制、传播和修改。详见
                  <a
                    href="https://creativecommons.org/licenses/by-sa/4.0/deed.zh"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800 dark:decoration-zinc-700 dark:hover:text-zinc-200"
                  >
                    CC BY-SA 4.0
                  </a>
                  。
                </p>
              </aside>
            )}

            {!isReadingMode && (
              <>
                <div className="mt-8 flex flex-col gap-3 border-t border-zinc-200 pt-6 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
                  <p className="text-zinc-500 dark:text-zinc-400">
                    作者 <span className="font-semibold text-zinc-800 dark:text-zinc-200">{authorsLabel}</span>
                  </p>
                  <a
                    href={getPostSourceUrl(post.filePath)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-zinc-500 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:decoration-zinc-700 dark:hover:text-zinc-100"
                  >
                    <ExternalLink size={14} />
                    <span>帮助改进本文</span>
                  </a>
                </div>

                <div className="post-actions mt-8">
                  <IssueSubscriptionCard />
                </div>

                {seriesNavigation && (
                  <section
                    className="post-series mt-10 border-t border-zinc-200 pt-7 dark:border-zinc-800 md:mt-12 md:pt-8"
                    aria-labelledby="series-heading"
                  >
                    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500">
                          系列文章
                        </p>
                        <h2 id="series-heading" className="text-xl font-bold text-ink dark:text-white">
                          {seriesNavigation.name}
                        </h2>
                      </div>
                      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        第 {seriesNavigation.currentIndex + 1} / {seriesNavigation.posts.length} 篇
                      </span>
                    </div>
                    <ol className="space-y-2">
                      {seriesNavigation.posts.map((seriesPost, index) => (
                        <li key={seriesPost.id}>
                          <Link
                            to={`/post/${seriesPost.id}`}
                            aria-current={seriesPost.id === post.id ? 'page' : undefined}
                            className={`flex min-h-11 items-center gap-3 rounded-control border px-3 py-2 text-sm transition-colors ${seriesPost.id === post.id ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 text-zinc-700 hover:border-zinc-500 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600'}`}
                          >
                            <span className="w-7 shrink-0 text-center text-xs tabular-nums opacity-60">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{seriesPost.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                    {(seriesNavigation.previous || seriesNavigation.next) && (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {seriesNavigation.previous ? (
                          <Link
                            to={`/post/${seriesNavigation.previous.id}`}
                            className="editorial-button inline-flex min-h-11 items-center justify-center gap-2 text-sm"
                          >
                            <ArrowLeft size={15} />
                            上一章
                          </Link>
                        ) : (
                          <span />
                        )}
                        {seriesNavigation.next ? (
                          <Link
                            to={`/post/${seriesNavigation.next.id}`}
                            className="editorial-button inline-flex min-h-11 items-center justify-center gap-2 text-sm"
                          >
                            下一章
                            <ArrowRight size={15} />
                          </Link>
                        ) : (
                          <span />
                        )}
                      </div>
                    )}
                  </section>
                )}

                <nav
                  aria-label="文章导航"
                  className="post-navigation mt-10 border-t border-zinc-200 pt-7 dark:border-zinc-800 md:mt-12 md:pt-8"
                >
                  <div className="grid gap-5 sm:grid-cols-2 sm:gap-10">
                    {adjacentPosts.prev ? (
                      <Link
                        to={`/post/${adjacentPosts.prev.id}`}
                        className="group flex min-h-11 min-w-0 items-start gap-3 rounded-control py-1 text-left"
                      >
                        <ArrowLeft
                          size={17}
                          className="mt-0.5 flex-shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-900 dark:text-zinc-700 dark:group-hover:text-zinc-100"
                        />
                        <span className="min-w-0">
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                            上一篇
                          </span>
                          <span className="line-clamp-2 text-sm font-semibold leading-relaxed text-zinc-700 transition-colors group-hover:text-zinc-950 dark:text-zinc-300 dark:group-hover:text-white">
                            {adjacentPosts.prev.title}
                          </span>
                        </span>
                      </Link>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                    {adjacentPosts.next ? (
                      <Link
                        to={`/post/${adjacentPosts.next.id}`}
                        className="group flex min-h-11 min-w-0 items-start gap-3 rounded-control py-1 text-left sm:justify-end sm:text-right"
                      >
                        <span className="min-w-0">
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                            下一篇
                          </span>
                          <span className="line-clamp-2 text-sm font-semibold leading-relaxed text-zinc-700 transition-colors group-hover:text-zinc-950 dark:text-zinc-300 dark:group-hover:text-white">
                            {adjacentPosts.next.title}
                          </span>
                        </span>
                        <ArrowRight
                          size={17}
                          className="mt-0.5 flex-shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-900 dark:text-zinc-700 dark:group-hover:text-zinc-100"
                        />
                      </Link>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                  </div>

                  <div className="mt-5 hidden text-center md:block">
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      快捷键：<kbd className="kbd">Alt</kbd> + <kbd className="kbd">←</kbd> 上一篇 ·{' '}
                      <kbd className="kbd">Alt</kbd> + <kbd className="kbd">→</kbd> 下一篇 ·{' '}
                      <kbd className="kbd">Esc</kbd> 关闭弹窗
                    </span>
                  </div>
                </nav>

                {relatedPosts.length > 0 && (
                  <section
                    className="post-related mt-10 border-t border-zinc-200 pt-7 dark:border-zinc-800 md:mt-12 md:pt-8"
                    aria-labelledby="related-heading"
                  >
                    <div className="mb-5 flex items-center gap-2">
                      <BookOpen size={16} className="text-zinc-400" />
                      <h2 id="related-heading" className="text-xl font-bold text-ink dark:text-white">
                        你可能还喜欢
                      </h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                      {relatedPosts.map((relatedPost) => (
                        <CompactPostCard key={relatedPost.id} post={relatedPost} />
                      ))}
                    </div>
                  </section>
                )}

                <GiscusComments postId={post.id} />
              </>
            )}
          </div>
        </div>
      </article>

      <Suspense fallback={null}>
        {shareModalOpen && (
          <ShareModal
            isOpen={shareModalOpen}
            onClose={() => setShareModalOpen(false)}
            title={post.title}
            excerpt={post.excerpt}
            url={absoluteSiteUrl(
              `/post/${post.id}`,
              typeof window !== 'undefined' ? window.location.origin : siteConfig.url,
            )}
          />
        )}
      </Suspense>
    </>
  );
};
