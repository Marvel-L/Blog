import React, { useId, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Seo } from './Seo';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { LOVE_REGIONS, type LoveRegion, type LoveRegionDistrict, type LoveRegionId } from '@/data/loveRegions.data';

const REGION_VIEWBOX = '0 0 320 248';
const DISTRICT_COLORS = ['#ffedf3', '#ffd8e4', '#ffc8da', '#f3bad0', '#e9b2d8', '#ffd9c8', '#f2c6bb', '#fadce5'];

type LabelPlacement = {
  x: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
};

const LABEL_LAYOUTS: Partial<Record<LoveRegionId, Record<string, LabelPlacement>>> = {
  changsha: {
    '430102': { x: 174, y: 128, anchor: 'start' },
    '430103': { x: 170, y: 153, anchor: 'start' },
    '430105': { x: 173, y: 112, anchor: 'start' },
    '430111': { x: 181, y: 147, anchor: 'start' },
  },
  beijing: {
    '110101': { x: 160, y: 189 },
    '110102': { x: 136, y: 189 },
    '110105': { x: 190, y: 165, anchor: 'start' },
    '110106': { x: 118, y: 198, anchor: 'end' },
    '110107': { x: 104, y: 166, anchor: 'end' },
    '110108': { x: 112, y: 150, anchor: 'end' },
    '110112': { x: 193, y: 202 },
    '110115': { x: 155, y: 221 },
  },
};

const resolveLabelPlacement = (regionId: LoveRegionId, district: LoveRegionDistrict) => {
  const override = LABEL_LAYOUTS[regionId]?.[district.id];
  return {
    x: override?.x ?? district.label[0],
    y: override?.y ?? district.label[1],
    anchor: override?.anchor ?? 'middle',
  } as const;
};

const RegionMap = ({
  activeRegion,
  isPlaneView,
  shouldReduceMotion,
}: {
  activeRegion: LoveRegion;
  isPlaneView: boolean;
  shouldReduceMotion: boolean;
}) => {
  const panelGradientId = useId();
  const beamGradientId = useId();
  const glowGradientId = useId();
  const shadowId = useId();
  const [focusX, focusY] = activeRegion.focus;
  const labelFontSize = activeRegion.id === 'beijing' ? 7.5 : 8.5;
  const transformOrigin = `${focusX}px ${focusY}px`;
  const beamPath = `M ${focusX - 10} ${focusY - 4} C ${focusX - 16} ${focusY - 42}, ${focusX - 14} ${focusY - 88}, ${focusX} ${
    focusY - 116
  } C ${focusX + 14} ${focusY - 88}, ${focusX + 16} ${focusY - 42}, ${focusX + 10} ${focusY - 4} Z`;

  return (
    <motion.span
      key={activeRegion.id}
      initial={shouldReduceMotion ? false : { opacity: 0, rotateX: 70, rotateZ: -10, scale: 0.97, y: 20 }}
      animate={
        isPlaneView
          ? { opacity: 1, rotateX: 8, rotateZ: 0, scale: 1.01, y: -6 }
          : { opacity: 1, rotateX: 63, rotateZ: -9, scale: 1, y: 0 }
      }
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.72, ease: [0.22, 1, 0.36, 1] as const }
      }
      className="relative block h-full w-full [transform-style:preserve-3d]"
      style={{ transformOrigin }}
    >
      <svg viewBox={REGION_VIEWBOX} className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id={panelGradientId} x1="14%" x2="76%" y1="8%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.96)" />
            <stop offset="36%" stopColor="rgba(255,230,239,0.76)" />
            <stop offset="100%" stopColor="rgba(255,188,212,0.28)" />
          </linearGradient>
          <linearGradient id={beamGradientId} x1="50%" x2="50%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,116,130,0.82)" />
            <stop offset="46%" stopColor="rgba(255,98,118,0.38)" />
            <stop offset="100%" stopColor="rgba(255,98,118,0)" />
          </linearGradient>
          <radialGradient id={glowGradientId} cx="50%" cy="44%" r="65%">
            <stop offset="0%" stopColor="rgba(255,247,249,0.96)" />
            <stop offset="58%" stopColor="rgba(255,208,222,0.28)" />
            <stop offset="100%" stopColor="rgba(255,208,222,0)" />
          </radialGradient>
          <filter id={shadowId} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy={isPlaneView ? '22' : '30'} stdDeviation={isPlaneView ? '12' : '18'} floodColor="rgba(9,3,7,0.48)" />
          </filter>
        </defs>

        <ellipse cx="160" cy={isPlaneView ? '226' : '219'} rx={isPlaneView ? '108' : '118'} ry={isPlaneView ? '17' : '22'} fill="rgba(9,3,7,0.68)" />
        <ellipse cx="160" cy="214" rx="96" ry="18" fill="rgba(255,168,192,0.08)" />

        <path d={activeRegion.outlinePath} transform="translate(0 13)" fill="rgba(44,13,23,0.92)" stroke="rgba(255,255,255,0.08)" strokeWidth="1.3" />
        <path d={activeRegion.outlinePath} transform="translate(0 7)" fill="rgba(83,28,47,0.76)" stroke="rgba(255,255,255,0.1)" strokeWidth="1.3" />

        {activeRegion.districts.map((district, index) => (
          <g key={district.id}>
            <path d={district.path} transform="translate(0 7)" fill="rgba(77,24,39,0.78)" stroke="rgba(255,255,255,0.08)" strokeWidth="1.1" />
            <path
              d={district.path}
              fill={DISTRICT_COLORS[index % DISTRICT_COLORS.length]}
              fillOpacity="0.52"
              stroke="rgba(255,255,255,0.72)"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </g>
        ))}

        <path d={activeRegion.outlinePath} fill={`url(#${glowGradientId})`} fillOpacity="0.25" stroke="rgba(255,255,255,0.32)" strokeWidth="2.2" filter={`url(#${shadowId})`} />
        <path d={activeRegion.outlinePath} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeDasharray="7 10" transform="translate(-2 -2)" />

        <path d={beamPath} fill={`url(#${beamGradientId})`} />
        <ellipse cx={focusX} cy={focusY} rx="20" ry="8" fill="rgba(255,96,119,0.16)" />
        <circle cx={focusX} cy={focusY - 116} r="7" fill="rgba(255,120,140,0.3)" />
        <circle cx={focusX} cy={focusY} r="5.6" fill="#ff5f70" />
        <circle cx={focusX} cy={focusY} r="11" fill="none" stroke="rgba(255,126,145,0.52)" strokeWidth="1.7" />

        {activeRegion.districts.map((district) => {
          const placement = resolveLabelPlacement(activeRegion.id, district);
          const hasLeader = Math.hypot(placement.x - district.label[0], placement.y - district.label[1]) > 10;

          return (
            <g key={`${district.id}-label`} className="pointer-events-none">
              {hasLeader ? (
                <path
                  d={`M ${district.label[0]} ${district.label[1]} L ${placement.x} ${placement.y - 4}`}
                  fill="none"
                  stroke="rgba(255,255,255,0.56)"
                  strokeWidth="0.9"
                  strokeDasharray="3 3"
                />
              ) : null}
              <circle cx={placement.x} cy={placement.y - 3} r="1.8" fill="rgba(255,255,255,0.86)" />
              <text
                x={placement.x}
                y={placement.y + 5}
                textAnchor={placement.anchor}
                fontSize={labelFontSize}
                fontWeight="700"
                fill="rgba(255,252,253,0.94)"
                stroke="rgba(35,8,20,0.68)"
                strokeWidth="2.8"
                paintOrder="stroke"
                letterSpacing="0.06em"
              >
                {district.name}
              </text>
            </g>
          );
        })}

        <text
          x="20"
          y="228"
          fontSize="10"
          fontWeight="700"
          fill="rgba(255,239,244,0.74)"
          letterSpacing="0.28em"
        >
          {activeRegion.name} SANDBOX
        </text>
      </svg>
    </motion.span>
  );
};

export const LoveRegionSurface: React.FC<{ regionId: LoveRegion['id'] }> = ({ regionId }) => {
  const shouldReduceMotion = useReducedMotion();
  const [isPlaneView, setIsPlaneView] = useState(false);
  const activeRegion = useMemo(
    () => LOVE_REGIONS.find((region) => region.id === regionId) ?? LOVE_REGIONS[0]!,
    [regionId],
  );

  return (
    <>
      <Seo title={`${activeRegion.name} 地域`} description={`Love 面地域页：${activeRegion.name} 的透明沙盘版图与行政区划展示。`} />
      <section className="relative isolate flex min-h-[calc(100vh-8rem)] items-center justify-center overflow-hidden px-4 py-6 text-white sm:px-8 sm:py-8 md:px-12 md:py-10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(255,236,223,0.16),transparent_24%),radial-gradient(circle_at_86%_18%,rgba(255,167,198,0.16),transparent_22%),radial-gradient(circle_at_50%_100%,rgba(255,109,90,0.16),transparent_34%),linear-gradient(180deg,rgba(31,8,18,0.96),rgba(80,20,40,0.94)_44%,rgba(38,9,18,0.98)_100%)]" />
          <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.24)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:52px_52px]" />
          <div className="absolute inset-x-[18%] top-[12%] h-28 rounded-full bg-white/8 blur-3xl" />
          <div className="absolute inset-x-[12%] bottom-[10%] h-28 rounded-full bg-[#090206]/70 blur-3xl" />
        </div>

        <div className="relative w-full max-w-6xl">
          <h1 className="sr-only">{activeRegion.name}</h1>
          <p className="pointer-events-none absolute left-0 top-0 z-10 text-[11px] font-semibold uppercase tracking-[0.32em] text-white/58">
            {activeRegion.scope} · {activeRegion.level}
          </p>
          <p className="pointer-events-none absolute right-0 top-0 z-10 text-xs font-medium text-white/62">
            点击版图切换立面
          </p>

          <motion.button
            type="button"
            data-testid="love-region-stage"
            data-view={isPlaneView ? 'plane' : 'sandtable'}
            aria-pressed={isPlaneView}
            aria-label={`切换${activeRegion.name}地域版图视角，当前${isPlaneView ? '垂直立面' : '沙盘斜视'}`}
            onClick={() => setIsPlaneView((value) => !value)}
            className="relative mt-10 block aspect-[1.24/1] w-full border-0 bg-transparent p-0 text-left [perspective:2400px] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/80"
            whileTap={shouldReduceMotion ? undefined : { scale: 0.994 }}
          >
            <span className="pointer-events-none absolute inset-x-[10%] bottom-[5%] h-20 rounded-full bg-[#090206]/70 blur-3xl" />
            <RegionMap activeRegion={activeRegion} isPlaneView={isPlaneView} shouldReduceMotion={shouldReduceMotion} />
          </motion.button>
        </div>
      </section>
    </>
  );
};
