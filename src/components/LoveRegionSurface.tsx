import React, { useId, useState } from 'react';
import { motion } from 'framer-motion';
import { Seo } from './Seo';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { LOVE_REGIONS, type LoveRegion } from '@/data/loveRegions.data';

const REGION_VIEWBOX = '0 0 320 260';
const SANDBOX_DEPTH_LAYERS = [34, 29, 24, 19, 14, 9, 5];
const SANDBOX_LAYER_COLORS = ['#3c1322', '#472034', '#552941', '#61334f', '#6d3d5b', '#7b4867', '#8b5575'];

const RegionSandboxFigure = ({
  activeRegion,
  isHovered,
  shouldReduceMotion,
}: {
  activeRegion: LoveRegion;
  isHovered: boolean;
  shouldReduceMotion: boolean;
}) => {
  const bodyGradientId = useId();
  const glazeGradientId = useId();
  const glowGradientId = useId();
  const shadowId = useId();
  const centroid = `${activeRegion.centroid[0]}px ${activeRegion.centroid[1]}px`;

  return (
    <motion.div
      key={activeRegion.id}
      initial={shouldReduceMotion ? false : { opacity: 0, rotateX: 68, rotateZ: -6, scale: 0.96, y: 16 }}
      animate={{
        opacity: 1,
        rotateX: isHovered ? 60 : 66,
        rotateZ: isHovered ? -3.5 : -6,
        scale: isHovered ? 1.02 : 1,
        y: isHovered ? -18 : 0,
      }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.72, ease: [0.22, 1, 0.36, 1] as const }
      }
      className="relative mx-auto aspect-[1.18/1] w-full max-w-[54rem] [perspective:2400px]"
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div className="pointer-events-none absolute inset-x-[10%] bottom-[3%] h-12 rounded-full bg-[#0b0307]/80 blur-2xl" />
      <div className="pointer-events-none absolute inset-[8%_5%_10%] rounded-[2.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-[2px]" />

      <motion.div
        aria-hidden="true"
        animate={shouldReduceMotion ? undefined : { rotate: [0, 1.8, 0, -1.8, 0] }}
        transition={shouldReduceMotion ? undefined : { duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-0"
        style={{ transformOrigin: centroid, transform: 'translateZ(-44px)' }}
      >
        <svg viewBox={REGION_VIEWBOX} className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id={bodyGradientId} x1="14%" x2="78%" y1="8%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.96)" />
              <stop offset="42%" stopColor="rgba(255,223,234,0.56)" />
              <stop offset="100%" stopColor="rgba(255,140,180,0.18)" />
            </linearGradient>
            <linearGradient id={glazeGradientId} x1="24%" x2="72%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.84)" />
              <stop offset="48%" stopColor="rgba(255,255,255,0.14)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            <radialGradient id={glowGradientId} cx="48%" cy="30%" r="70%">
              <stop offset="0%" stopColor="rgba(255,247,249,0.92)" />
              <stop offset="58%" stopColor="rgba(255,196,220,0.28)" />
              <stop offset="100%" stopColor="rgba(255,196,220,0)" />
            </radialGradient>
            <filter id={shadowId} x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow
                dx="0"
                dy={isHovered ? '34' : '26'}
                stdDeviation={isHovered ? '20' : '16'}
                floodColor="rgba(7,2,5,0.52)"
              />
            </filter>
          </defs>

          {SANDBOX_DEPTH_LAYERS.map((depth, index) => (
            <path
              key={depth}
              d={activeRegion.path}
              fill={SANDBOX_LAYER_COLORS[index] ?? SANDBOX_LAYER_COLORS[SANDBOX_LAYER_COLORS.length - 1]}
              fillOpacity={0.9 - index * 0.07}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1.2"
              transform={`translate(${12 + index * 0.65} ${26 + depth}) scale(1.02)`}
            />
          ))}

          <path
            d={activeRegion.path}
            fill={`url(#${glowGradientId})`}
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="4.6"
            transform="translate(14 18) scale(1.025)"
            filter={`url(#${shadowId})`}
          />
          <path
            d={activeRegion.path}
            fill={`url(#${bodyGradientId})`}
            fillOpacity="0.95"
            stroke="rgba(255,255,255,0.78)"
            strokeOpacity="0.88"
            strokeWidth="2.8"
          />
          <path
            d={activeRegion.path}
            fill={`url(#${glazeGradientId})`}
            fillOpacity="0.4"
            stroke="none"
            transform="translate(-4 -8) scale(0.995)"
          />
          <path
            d={activeRegion.path}
            fill="none"
            stroke="rgba(255,255,255,0.26)"
            strokeWidth="1.4"
            strokeDasharray="8 12"
            transform="translate(-5 -7) scale(1.014)"
          />
          <circle cx={activeRegion.centroid[0]} cy={activeRegion.centroid[1]} r="7" fill="rgba(255,255,255,0.98)" />
          <circle
            cx={activeRegion.centroid[0]}
            cy={activeRegion.centroid[1]}
            r={isHovered ? '24' : '20'}
            fill="none"
            stroke="rgba(255,255,255,0.36)"
            strokeWidth="2"
          />
        </svg>
      </motion.div>
    </motion.div>
  );
};

export const LoveRegionSurface: React.FC<{ regionId: LoveRegion['id'] }> = ({ regionId }) => {
  const shouldReduceMotion = useReducedMotion();
  const [isHovered, setIsHovered] = useState(false);
  const activeRegion = LOVE_REGIONS.find((region) => region.id === regionId) ?? LOVE_REGIONS[0]!;

  return (
    <>
      <Seo title={`${activeRegion.name} 地域`} description={`Love 面地域页：${activeRegion.name} 的沙盘式透明地理版图展示。`} />
      <section className="relative isolate flex min-h-[calc(100vh-8rem)] items-center justify-center overflow-hidden rounded-[2.35rem] border border-rose-200/28 bg-[linear-gradient(160deg,rgba(31,7,17,0.96),rgba(72,18,38,0.9)_44%,rgba(117,34,63,0.82)_100%)] px-4 py-6 text-white shadow-[0_42px_140px_rgba(40,8,20,0.52)] sm:px-8 sm:py-8 md:px-12 md:py-10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(255,221,205,0.24),transparent_26%),radial-gradient(circle_at_82%_16%,rgba(255,186,214,0.18),transparent_24%),radial-gradient(circle_at_50%_100%,rgba(255,132,102,0.18),transparent_34%)]" />
          <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:52px_52px]" />
          <div className="absolute inset-x-[16%] bottom-[11%] h-24 rounded-full bg-[#090206]/60 blur-3xl" />
          <div className="absolute inset-x-[24%] top-[14%] h-32 rounded-full bg-white/8 blur-3xl" />
        </div>

        <div className="relative w-full max-w-6xl">
          <div
            data-testid="love-region-stage"
            data-hovered={isHovered ? 'true' : 'false'}
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
            className="group relative overflow-hidden rounded-[2.5rem] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04)_42%,rgba(255,255,255,0.02)_100%)] px-4 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-md sm:px-8 sm:py-8"
          >
            <div className="pointer-events-none absolute left-5 top-5 rounded-full border border-white/14 bg-black/18 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/72 sm:left-8 sm:top-8">
              {activeRegion.name} · {activeRegion.scope}
            </div>
            <h1 className="sr-only">{activeRegion.name}</h1>
            <div className="pointer-events-none absolute right-5 top-5 rounded-full border border-white/14 bg-black/18 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/56 sm:right-8 sm:top-8">
              Sandtable View
            </div>
            <div className="pointer-events-none absolute inset-x-[10%] top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.26),transparent_68%)]" />
            <div className="pointer-events-none absolute inset-x-[12%] bottom-[6%] h-20 rounded-full bg-[#090206]/72 blur-3xl transition-all duration-300 group-data-[hovered=true]:bottom-[4%] group-data-[hovered=true]:scale-110" />
            <RegionSandboxFigure activeRegion={activeRegion} isHovered={isHovered} shouldReduceMotion={shouldReduceMotion} />
          </div>
        </div>
      </section>
    </>
  );
};
