import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { axisLabel, formatNumber, getPoints, METRICS, type TrendCategory } from './model';
import {
  canUseLogScale,
  comparisonRatio,
  comparisonThresholdRatio,
  numericAxis,
  placeScatterLabels,
  shortenLabel,
  type ChartView,
  type PriceScale,
} from './chartGeometry';

type ViewProps = {
  category: TrendCategory;
  view: ChartView;
  scale: PriceScale;
  onView: (view: ChartView) => void;
  onScale: (scale: PriceScale) => void;
};

const ViewControls = ({ category, view, scale, onView, onScale }: ViewProps) => {
  const logAvailable = canUseLogScale(
    getPoints(category).map((point) => point.x),
    category.threshold,
  );
  return (
    <div className="trend-view-controls">
      <div className="trend-view-switch" role="group" aria-label="图表视图">
        <button aria-pressed={view === 'comparison'} onClick={() => onView('comparison')}>
          等距对比
        </button>
        <button aria-pressed={view === 'distribution'} onClick={() => onView('distribution')}>
          {category.xMetric === 'price100g' ? '价格分布' : '数值分布'}
        </button>
      </div>
      {view === 'distribution' && (
        <div className="trend-view-switch" role="group" aria-label="横轴刻度">
          <button aria-pressed={scale === 'linear' || !logAvailable} onClick={() => onScale('linear')}>
            线性
          </button>
          <button
            aria-pressed={scale === 'log' && logAvailable}
            disabled={!logAvailable}
            title={!logAvailable ? '横轴数据及启用的横轴阈值都大于 0 时可用' : '用相同距离表示相同倍数的差异'}
            onClick={() => onScale('log')}
          >
            对数
          </button>
        </div>
      )}
      <p className="trend-view-note">
        {view === 'comparison'
          ? `条目按${METRICS[category.xMetric].label}升序等距排列，间距不表示数值差。`
          : scale === 'log' && logAvailable
            ? '横轴按倍数变化，适合价格跨度较大的数据；悬停可查看原始数值。'
            : '横轴保留真实数值距离。数据拥挤时可切换对数刻度或等距对比。'}
        {view === 'distribution' && !logAvailable && ' 含零、负值或非正的横轴阈值，使用线性刻度。'}
      </p>
    </div>
  );
};

const ChartPlot = ({
  category,
  view,
  scale,
  compact = false,
  expanded = false,
}: {
  category: TrendCategory;
  view: ChartView;
  scale: PriceScale;
  compact?: boolean;
  expanded?: boolean;
}) => {
  const id = useId().replace(/:/g, '');
  const points = useMemo(() => getPoints(category), [category]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 1000, height: 560 });
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) {
        setSize({
          width: Math.max(280, Math.round(entry.contentRect.width)),
          height: Math.round(entry.contentRect.height),
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const comparison = view === 'comparison';
  const mobile = size.width < 600;
  const width = comparison && !compact ? Math.max(size.width, points.length * 112 + 130) : size.width;
  const height = compact ? 240 : expanded ? Math.max(360, size.height) : mobile ? 420 : 560;
  const left = compact || mobile ? 66 : 86;
  const right = width - (compact ? 26 : 44);
  const top = compact ? 44 : 64;
  const bottom = height - (comparison && !compact ? 110 : 72);
  const threshold = category.threshold;
  const effectiveScale =
    scale === 'log' &&
    canUseLogScale(
      points.map((point) => point.x),
      threshold,
    )
      ? 'log'
      : 'linear';
  const xAxis = numericAxis(
    points.map((point) => point.x),
    threshold.enabled && threshold.axis === 'x' ? threshold.value : undefined,
    effectiveScale,
  );
  const yAxis = numericAxis(
    points.map((point) => point.y),
    threshold.enabled && threshold.axis === 'y' ? threshold.value : undefined,
    'linear',
    comparison,
  );
  const xScale = (value: number) => left + xAxis.ratio(value) * (right - left);
  const yScale = (value: number) => bottom - yAxis.ratio(value) * (bottom - top);
  const located = points.map((point, index) => ({
    ...point,
    px: comparison ? left + comparisonRatio(index, points.length) * (right - left) : xScale(point.x),
    py: yScale(point.y),
  }));
  const active = located.find((point) => point.item.id === activeId);
  const thresholdPosition =
    threshold.axis === 'y'
      ? yScale(threshold.value)
      : comparison
        ? left +
          comparisonThresholdRatio(
            points.map((point) => point.x),
            threshold,
          ) *
            (right - left)
        : xScale(threshold.value);
  const baseline = Math.max(top, Math.min(bottom, yScale(0)));
  const ticks = Array.from({ length: 6 }, (_, index) => index / 5);
  const thresholdLabel = `${threshold.direction === 'above' ? '上限' : '下限'} ${formatNumber(threshold.value)}`;
  const scatterLabels =
    compact || comparison
      ? new Map()
      : placeScatterLabels(
          located.map((point) => ({ id: point.item.id, name: point.item.name, x: point.px, y: point.py })),
          { left, right, top, bottom },
          activeId,
          threshold.enabled && threshold.axis === 'y'
            ? [{ left: right - 150, right, top: thresholdPosition - 26, bottom: thresholdPosition + 4 }]
            : [],
        );

  return (
    <figure
      className={`trend-chart ${compact ? 'trend-chart-compact' : ''}`}
      aria-label={`${category.name}${comparison ? '等距对比图' : '散点图'}`}
      data-view={view}
      data-scale={comparison ? 'ordinal' : effectiveScale}
    >
      <div ref={containerRef} className="trend-chart-scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width, height }}
          role="group"
          aria-label={`${comparison ? '条目等距排列，' : ''}${axisLabel(category, 'x')}与${axisLabel(category, 'y')}，${points.length}个条目`}
        >
          <defs>
            {comparison &&
              located.slice(1).map((point, index) => (
                <linearGradient
                  key={point.item.id}
                  id={`${id}-line-${index}`}
                  gradientUnits="userSpaceOnUse"
                  x1={located[index].px}
                  y1={located[index].py}
                  x2={point.px}
                  y2={point.py}
                >
                  <stop stopColor={located[index].color} />
                  <stop offset="1" stopColor={point.color} />
                </linearGradient>
              ))}
          </defs>
          <rect x={left} y={top} width={right - left} height={bottom - top} fill="white" />
          {ticks.map((ratio) => {
            const x = left + ratio * (right - left);
            const y = bottom - ratio * (bottom - top);
            return (
              <g key={ratio} className="trend-grid">
                <line x1={left} x2={right} y1={y} y2={y} />
                <text x={left - 12} y={y + 4} textAnchor="end">
                  {formatNumber(yAxis.tick(ratio))}
                </text>
                {!comparison && (
                  <>
                    <line x1={x} x2={x} y1={top} y2={bottom} />
                    <text x={x} y={bottom + 25} textAnchor="middle">
                      {formatNumber(xAxis.tick(ratio))}
                    </text>
                  </>
                )}
              </g>
            );
          })}
          <text x={left} y={26} className="trend-axis-label">
            {axisLabel(category, 'y')}
          </text>
          <text x={right} y={height - 16} textAnchor="end" className="trend-axis-label">
            {comparison
              ? `条目（按${METRICS[category.xMetric].label}升序）`
              : `${axisLabel(category, 'x')}${effectiveScale === 'log' ? ' · 对数刻度' : ''}`}
          </text>
          {threshold.enabled && (
            <g className="trend-threshold" data-testid="trend-threshold">
              {threshold.axis === 'y' ? (
                <>
                  <rect
                    x={left}
                    y={threshold.direction === 'above' ? top : thresholdPosition}
                    width={right - left}
                    height={threshold.direction === 'above' ? thresholdPosition - top : bottom - thresholdPosition}
                    fill="#fff1f2"
                    opacity="0.6"
                  />
                  <line x1={left} x2={right} y1={thresholdPosition} y2={thresholdPosition} />
                  <text x={right - 8} y={thresholdPosition - 10} textAnchor="end">
                    {thresholdLabel}
                  </text>
                </>
              ) : (
                <>
                  <rect
                    x={threshold.direction === 'above' ? thresholdPosition : left}
                    y={top}
                    width={threshold.direction === 'above' ? right - thresholdPosition : thresholdPosition - left}
                    height={bottom - top}
                    fill="#fff1f2"
                    opacity="0.6"
                  />
                  <line x1={thresholdPosition} x2={thresholdPosition} y1={top} y2={bottom} />
                  <text x={right - 8} y={top - 16} textAnchor="end">
                    {thresholdLabel} · {METRICS[category.xMetric].unit || 'X'}
                  </text>
                </>
              )}
            </g>
          )}
          {comparison &&
            located
              .slice(1)
              .map((point, index) => (
                <line
                  key={point.item.id}
                  className="trend-comparison-line"
                  x1={located[index].px}
                  y1={located[index].py}
                  x2={point.px}
                  y2={point.py}
                  stroke={`url(#${id}-line-${index})`}
                  strokeWidth="2"
                />
              ))}
          {located.map((point) => {
            const selected = point.item.id === activeId;
            const label = scatterLabels.get(point.item.id);
            return (
              <g
                key={point.item.id}
                data-trend-item={point.item.id}
                data-exceeded={point.exceeded}
                role="button"
                tabIndex={0}
                aria-label={`${point.item.name}：横坐标 ${formatNumber(point.x)}，纵坐标 ${formatNumber(point.y)}${point.exceeded ? '，超出阈值' : ''}`}
                aria-pressed={selected}
                onMouseEnter={() => setActiveId(point.item.id)}
                onFocus={() => setActiveId(point.item.id)}
                onClick={() => setActiveId(point.item.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setActiveId(point.item.id);
                  }
                  if (event.key === 'Escape') {
                    if (!expanded) event.stopPropagation();
                    setActiveId(null);
                  }
                }}
              >
                <desc>{`${point.item.name} · ${axisLabel(category, 'x')}：${formatNumber(point.x)} · ${axisLabel(category, 'y')}：${formatNumber(point.y)}`}</desc>
                {(comparison || selected) && (
                  <line
                    className="trend-ant-line"
                    x1={point.px}
                    x2={point.px}
                    y1={point.py}
                    y2={comparison ? baseline : bottom}
                    stroke={point.color}
                    strokeWidth={selected ? 2 : 1.5}
                    opacity={selected ? 1 : 0.55}
                  />
                )}
                <circle
                  cx={point.px}
                  cy={point.py}
                  r={selected ? 13 : 10}
                  fill={point.color}
                  opacity={selected ? 0.17 : 0.1}
                />
                <circle cx={point.px} cy={point.py} r="5.5" fill={point.color} stroke="white" strokeWidth="2" />
                <circle cx={point.px} cy={point.py} r="18" fill="transparent" />
                {!compact && comparison && (
                  <>
                    <text x={point.px} y={point.py - 18} textAnchor="middle" className="trend-point-label">
                      {formatNumber(point.y)}
                    </text>
                    <text x={point.px} y={bottom + 28} textAnchor="middle" className="trend-item-label">
                      {shortenLabel(point.item.name)}
                    </text>
                    <text x={point.px} y={bottom + 49} textAnchor="middle" className="trend-item-value">
                      {formatNumber(point.x)}
                      {category.xMetric === 'price100g' ? ' 元 / 100g' : ''}
                    </text>
                  </>
                )}
                {label && (
                  <text x={label.x} y={label.y} textAnchor={label.anchor} className="trend-point-label">
                    {label.text}
                  </text>
                )}
              </g>
            );
          })}
          {points.length === 0 && (
            <text x={(left + right) / 2} y={(top + bottom) / 2} textAnchor="middle" className="trend-axis-label">
              添加条目后，数据会显示在这里
            </text>
          )}
        </svg>
      </div>
      {!compact && (
        <figcaption className="trend-chart-caption" aria-live="polite">
          {active ? (
            <span className="trend-point-detail">
              <i style={{ background: active.color }} />
              <strong>{active.item.name}</strong>
              <span>
                {axisLabel(category, 'x')} <b>{formatNumber(active.x)}</b>
              </span>
              <span>
                {axisLabel(category, 'y')} <b>{formatNumber(active.y)}</b>
              </span>
              {threshold.enabled && (
                <span className={active.exceeded ? 'trend-exceeded-text' : ''}>
                  {active.exceeded ? `超出阈值 ${formatNumber(active.deviation * 100)}%` : '阈值内'}
                </span>
              )}
            </span>
          ) : (
            <span>
              悬停、点击或用 Tab 选中数据点，查看完整名称与数值。
              {comparison ? '条目较多时可左右滚动画布。' : '散点不连线，避免暗示连续趋势。'}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
};

export const TrendChart = ({ category, compact = false }: { category: TrendCategory; compact?: boolean }) => {
  const [view, setView] = useState<ChartView>('comparison');
  const [scale, setScale] = useState<PriceScale>('linear');
  const [expanded, setExpanded] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useModalOverlay({
    isOpen: expanded,
    onClose: () => setExpanded(false),
    containerRef: dialogRef,
    initialFocusRef: closeRef,
  });
  const controls = <ViewControls category={category} view={view} scale={scale} onView={setView} onScale={setScale} />;
  return (
    <>
      <div className="trend-chart-view" inert={expanded || undefined} aria-hidden={expanded || undefined}>
        {!compact && (
          <div className="trend-chart-toolbar">
            {controls}
            <button className="trend-expand-button" onClick={() => setExpanded(true)}>
              <Maximize2 size={14} />
              放大画布
            </button>
          </div>
        )}
        <ChartPlot category={category} view={view} scale={scale} compact={compact} />
      </div>
      {expanded &&
        createPortal(
          <div
            className="trend-chart-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget) setExpanded(false);
            }}
          >
            <div
              ref={dialogRef}
              className="trend-page trend-chart-expanded"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
            >
              <div className="trend-expanded-heading">
                <h2 id={titleId}>{category.name} · 放大画布</h2>
                <button
                  ref={closeRef}
                  className="trend-button"
                  aria-label="关闭放大画布"
                  onClick={() => setExpanded(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="trend-chart-toolbar">{controls}</div>
              <ChartPlot category={category} view={view} scale={scale} expanded />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
