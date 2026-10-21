/**
 * 水波 / 鱼跃装饰分割线：用于 Hero 与内容区、页脚顶部等明确分界处。
 * - 纯 SVG + CSS 动画，不依赖 canvas
 * - 尊重 prefers-reduced-motion：仅渲染静态波纹
 * - variant=wave：轻量双层水波；variant=fish：水波 + 间歇鱼跃
 */

import type { FC } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

type WaveFishDividerVariant = 'wave' | 'fish';

interface WaveFishDividerProps {
  variant?: WaveFishDividerVariant;
  className?: string;
  /** 无障碍：装饰性，默认隐藏 */
  decorative?: boolean;
}

export const WaveFishDivider: FC<WaveFishDividerProps> = ({ variant = 'wave', className = '', decorative = true }) => {
  const shouldReduceMotion = useReducedMotion();
  const animate = !shouldReduceMotion;
  const showFish = variant === 'fish' && animate;

  return (
    <div
      className={`wave-fish-divider relative w-full overflow-hidden ${className}`}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? 'presentation' : undefined}
    >
      <svg
        className="wave-fish-divider__svg block h-10 w-full md:h-12"
        viewBox="0 0 1200 80"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="wave-fill-soft" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.07" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 底层慢波 */}
        <g className={animate ? 'wave-fish-divider__layer wave-fish-divider__layer--slow' : undefined}>
          <path
            d="M0 42 C150 18 300 66 450 42 C600 18 750 66 900 42 C1050 18 1125 54 1200 42 L1200 80 L0 80 Z"
            fill="url(#wave-fill-soft)"
          />
          <path
            d="M0 42 C150 18 300 66 450 42 C600 18 750 66 900 42 C1050 18 1125 54 1200 42"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.22"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {/* 顶层快波（错相位，形成流动感） */}
        <g className={animate ? 'wave-fish-divider__layer wave-fish-divider__layer--fast' : undefined}>
          <path
            d="M0 48 C120 68 280 28 420 48 C560 68 700 28 840 48 C980 68 1100 30 1200 48"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.38"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {showFish && (
          <>
            <g className="wave-fish-divider__fish wave-fish-divider__fish--a">
              <FishSilhouette />
            </g>
            <g className="wave-fish-divider__fish wave-fish-divider__fish--b">
              <FishSilhouette />
            </g>
          </>
        )}
      </svg>
    </div>
  );
};

/** 简洁侧视鱼剪影，随父级 transform 做跳跃弧线 */
const FishSilhouette = () => (
  <g transform="translate(-14 -6)">
    <ellipse cx="14" cy="6" rx="11" ry="4.2" fill="currentColor" fillOpacity="0.55" />
    <path d="M2 6 L-2 2.5 L-1 6 L-2 9.5 Z" fill="currentColor" fillOpacity="0.55" />
    <circle cx="20" cy="5" r="1.1" fill="currentColor" fillOpacity="0.75" />
    {/* 跃起时的水花点 */}
    <g className="wave-fish-divider__splash" fill="currentColor" fillOpacity="0.35">
      <circle cx="8" cy="14" r="1.2" />
      <circle cx="14" cy="16" r="0.9" />
      <circle cx="19" cy="13.5" r="1" />
    </g>
  </g>
);
