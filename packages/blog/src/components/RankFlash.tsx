/**
 * 文章分级闪卡。
 * 未配置合法 rank 时原样渲染子节点，不附加边框、光泽或徽标。
 * 指针只写入 CSS 变量，不触发 React 重渲染，避免列表卡片在悬停时整页刷新。
 */
import React from 'react';
import { isPostRank, RANK_SLUG, type PostRank } from '@/utils/postRank';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const onFlashPointerMove = (event: React.PointerEvent<HTMLElement>) => {
  if (prefersReducedMotion()) return;
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  event.currentTarget.style.setProperty('--flash-x', `${x.toFixed(2)}%`);
  event.currentTarget.style.setProperty('--flash-y', `${y.toFixed(2)}%`);
};

export const onFlashPointerLeave = (event: React.PointerEvent<HTMLElement>) => {
  event.currentTarget.style.removeProperty('--flash-x');
  event.currentTarget.style.removeProperty('--flash-y');
};

export const flashSurfaceProps = (rank: string | undefined, variant: 'card' | 'frame' | 'cover') => {
  if (!isPostRank(rank)) {
    return {
      rank: undefined as undefined,
      className: '',
      onPointerMove: undefined,
      onPointerLeave: undefined,
    };
  }

  return {
    rank,
    className: `flash-surface flash-surface--${variant} flash-rank--${RANK_SLUG[rank]}`,
    onPointerMove: onFlashPointerMove,
    onPointerLeave: onFlashPointerLeave,
  };
};

export const RankBadge: React.FC<{ rank: PostRank; className?: string }> = ({ rank, className }) => (
  <span className={`flash-rank-badge flash-rank--${RANK_SLUG[rank]} ${className ?? ''}`.trim()}>
    <span className="sr-only">文章分级：</span>
    {rank}
  </span>
);

/** 盖在封面上的全息光泽。父级须带 flash-rank--*，光斑位置跟随父级 --flash-x/y。 */
export const CoverSheen: React.FC<{ rank?: string }> = ({ rank }) =>
  isPostRank(rank) ? <span className="flash-cover-sheen" aria-hidden="true" /> : null;

/**
 * 阅读页标题框。quiet 用于专注阅读：只留段位名，去掉流动描边。
 */
export const PostRankFrame: React.FC<{
  rank?: string;
  quiet?: boolean;
  children: React.ReactNode;
}> = ({ rank, quiet = false, children }) => {
  if (!isPostRank(rank)) {
    return <>{children}</>;
  }

  const badge = (
    <div className="mb-4 flex justify-center">
      <RankBadge rank={rank} className="flash-rank-badge--display" />
    </div>
  );

  if (quiet) {
    return (
      <>
        {badge}
        {children}
      </>
    );
  }

  const flash = flashSurfaceProps(rank, 'frame');
  return (
    <div className={flash.className} onPointerMove={flash.onPointerMove} onPointerLeave={flash.onPointerLeave}>
      <div className="flash-frame-body">
        {badge}
        {children}
      </div>
    </div>
  );
};

/** 阅读页封面：分级文章套一层金属描边，光泽只落在图片上。 */
export const FlashCover: React.FC<{ rank?: string; className?: string; children: React.ReactNode }> = ({
  rank,
  className,
  children,
}) => {
  const flash = flashSurfaceProps(rank, 'cover');
  if (!flash.rank) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={[className, flash.className].filter(Boolean).join(' ')}
      onPointerMove={flash.onPointerMove}
      onPointerLeave={flash.onPointerLeave}
    >
      <div className="flash-cover-inner relative">
        {children}
        <span className="flash-cover-sheen" aria-hidden="true" />
      </div>
    </div>
  );
};
