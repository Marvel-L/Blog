import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { axisDomain, axisLabel, formatNumber, getPoints, type TrendCategory } from './model';

export const TrendChart = ({ category, compact = false }: { category: TrendCategory; compact?: boolean }) => {
  const id = useId().replace(/:/g, '');
  const points = useMemo(() => getPoints(category), [category]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [width, setWidth] = useState(1000);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.max(300, Math.round(entry.contentRect.width)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const active = points.find((point) => point.item.id === activeId);
  const threshold = category.threshold;
  const xDomain = axisDomain(
    points.map((point) => point.x),
    threshold.enabled && threshold.axis === 'x' ? threshold.value : undefined,
  );
  const yDomain = axisDomain(
    points.map((point) => point.y),
    threshold.enabled && threshold.axis === 'y' ? threshold.value : undefined,
  );
  const height = compact ? 280 : width < 600 ? 360 : 440;
  const left = width < 600 ? 58 : 92,
    right = width - (width < 600 ? 22 : 55),
    top = 48,
    bottom = height - 72;
  const xScale = (value: number) => left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * (right - left);
  const yScale = (value: number) => bottom - ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) * (bottom - top);
  const thresholdPosition = threshold.axis === 'x' ? xScale(threshold.value) : yScale(threshold.value);
  const baseline = yScale(0);
  const ticks = Array.from({ length: 6 }, (_, index) => index / 5);
  const path = points.map((point) => `${xScale(point.x)},${yScale(point.y)}`).join(' ');
  const thresholdLabel = `${threshold.direction === 'above' ? '上限' : '下限'} ${formatNumber(threshold.value)}`;
  const area =
    points.length > 1
      ? `M ${xScale(points[0].x)} ${baseline} L ${path.replaceAll(',', ' ')} L ${xScale(points[points.length - 1].x)} ${baseline} Z`
      : '';

  return (
    <figure className={`trend-chart ${compact ? 'trend-chart-compact' : ''}`} aria-label={`${category.name}折线图`}>
      <div ref={containerRef} className="trend-chart-scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={`${axisLabel(category, 'x')}与${axisLabel(category, 'y')}，${points.length}个条目`}
        >
          <defs>
            <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#14b8a6" stopOpacity="0.09" />
              <stop offset="1" stopColor="#14b8a6" stopOpacity="0" />
            </linearGradient>
            {points.slice(1).map((point, index) => (
              <linearGradient
                key={point.item.id}
                id={`${id}-line-${index}`}
                gradientUnits="userSpaceOnUse"
                x1={xScale(points[index].x)}
                y1={yScale(points[index].y)}
                x2={xScale(point.x)}
                y2={yScale(point.y)}
              >
                <stop stopColor={points[index].color} />
                <stop offset="1" stopColor={point.color} />
              </linearGradient>
            ))}
          </defs>
          <rect x={left} y={top} width={right - left} height={bottom - top} fill="white" />
          {ticks.map((ratio, index) => {
            const x = left + ratio * (right - left);
            const y = bottom - ratio * (bottom - top);
            return (
              <g key={ratio} className="trend-grid">
                <line x1={left} x2={right} y1={y} y2={y} />
                <line x1={x} x2={x} y1={top} y2={bottom} />
                <text x={left - 16} y={y + 4} textAnchor="end">
                  {formatNumber(yDomain[0] + ratio * (yDomain[1] - yDomain[0]))}
                </text>
                <text x={x} y={bottom + 25} textAnchor="middle">
                  {formatNumber(xDomain[0] + ratio * (xDomain[1] - xDomain[0]))}
                </text>
                {index === 0 && <line x1={left} x2={right} y1={baseline} y2={baseline} stroke="#b6c2c9" />}
              </g>
            );
          })}
          <text x={left} y={23} className="trend-axis-label">
            {axisLabel(category, 'y')}
          </text>
          <text x={right} y={height - 12} textAnchor="end" className="trend-axis-label">
            {axisLabel(category, 'x')}
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
                  <text x={thresholdPosition + 8} y={top + 18}>
                    {thresholdLabel}
                  </text>
                </>
              )}
            </g>
          )}
          {area && <path d={area} fill={`url(#${id}-area)`} />}
          {points.slice(1).map((point, index) => (
            <line
              key={point.item.id}
              x1={xScale(points[index].x)}
              y1={yScale(points[index].y)}
              x2={xScale(point.x)}
              y2={yScale(point.y)}
              stroke={`url(#${id}-line-${index})`}
              strokeWidth="2.5"
            />
          ))}
          {points.map((point, index) => {
            const x = xScale(point.x),
              y = yScale(point.y);
            const selected = point.item.id === activeId;
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
                    event.stopPropagation();
                    setActiveId(null);
                  }
                }}
              >
                <line
                  className="trend-ant-line"
                  x1={x}
                  x2={x}
                  y1={y}
                  y2={baseline}
                  stroke={point.color}
                  strokeWidth={selected ? 2 : 1.5}
                  opacity={selected ? 1 : 0.7}
                />
                <circle cx={x} cy={y} r={selected ? 13 : 10} fill={point.color} opacity={selected ? 0.17 : 0.1} />
                <circle cx={x} cy={y} r="5.5" fill={point.color} stroke="white" strokeWidth="2" />
                <circle cx={x} cy={y} r="18" fill="transparent" />
                {!compact && (
                  <text x={x} y={y - (index % 2 === 0 ? 20 : 28)} textAnchor="middle" className="trend-point-label">
                    {point.item.name.length > 12 ? `${point.item.name.slice(0, 12)}…` : point.item.name}
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
            <span>悬停、点击或用 Tab 选中数据点，查看数值。折线按横坐标升序连接。</span>
          )}
        </figcaption>
      )}
    </figure>
  );
};
