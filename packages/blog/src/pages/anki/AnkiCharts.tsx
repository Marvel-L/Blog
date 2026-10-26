/**
 * Anki 统计图表：近 7 日去重练习折线 + 近 13 周 GitHub 式热力图。
 *
 * 质量约束（ai-rules/anki.md 第 17/19 条）：
 * - 折线按真实容器宽度计算 viewBox 坐标，不使用 preserveAspectRatio=none 拉伸圆点与线；
 *   数值轴、自然日期轴、零基线、悬停提示共用同一份统计数据；
 * - ResizeObserver 重绘必须断开旧订阅；窄屏隔项显示日期；
 * - 热力格默认只显示色阶，无常驻数字/日期；悬停、键盘聚焦与手机点击用同一份数据提示，未来格不渲染为可交互格。
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { buildHeatGrid, heatLevel, type DateKey } from './anki-date';

const HEAT_COLORS = ['#edf1f5', '#c4e9d5', '#8bd1ae', '#42aa79', '#16814f'] as const;
const WEEKDAYS = ['', '', '一', '', '三', '', '五'] as const;

interface LinePoint {
  date: DateKey;
  count: number;
}

interface AnkiTrendLineProps {
  days: LinePoint[];
}

interface TipState {
  x: number;
  y: number;
  text: string;
}

export const AnkiTrendLine: React.FC<AnkiTrendLineProps> = ({ days }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [tip, setTip] = useState<TipState | null>(null);

  // ResizeObserver 重绘：effect 结束时断开旧订阅，避免叠加监听。
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      if (container) setWidth(container.clientWidth);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.floor(next));
    });
    observer.observe(container);
    setWidth(Math.floor(container.clientWidth));
    return () => observer.disconnect();
  }, []);

  const widthClamped = Math.max(260, width || 320);
  const height = 240;
  const left = 34;
  const right = 20;
  const top = 26;
  const bottom = 44;
  const plotWidth = Math.max(10, widthClamped - left - right);
  const plotHeight = height - top - bottom;

  const peak = Math.max(1, ...days.map((point) => point.count));
  const step = Math.max(1, Math.ceil(peak / 4));
  const max = step * 4;
  const xFor = (index: number) =>
    days.length <= 1 ? left + plotWidth / 2 : left + (index * plotWidth) / (days.length - 1);
  const yFor = (count: number) => top + plotHeight - (count / max) * plotHeight;

  const points = days.map((point, index) => ({ x: xFor(index), y: yFor(point.count) }));
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
  const narrow = widthClamped < 500;
  const ariaSummary = days.map((point) => `${point.date} ${point.count} 张`).join('，');
  // 零基线在底部：i=0 对应 y=base（标 0），i=4 对应 y=top（标 max），与 yFor 同一份变换。
  const baseY = top + plotHeight;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        role="img"
        aria-label={`近7日去重练习量：${ariaSummary}`}
        viewBox={`0 0 ${widthClamped} ${height}`}
        width="100%"
        height={height}
        className="block"
        onMouseLeave={() => setTip(null)}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const y = baseY - (i * plotHeight) / 4;
          return (
            <g key={i}>
              <line x1={left} y1={y} x2={widthClamped - right} y2={y} stroke="#ecf0f4" strokeWidth={1} />
              <text x={left - 10} y={y + 4} textAnchor="end" fontSize={14} fill="#8b929a">
                {i * step}
              </text>
            </g>
          );
        })}
        <polyline
          points={polyline}
          fill="none"
          stroke="#428dd2"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) => {
          const day = days[index];
          const label = index === days.length - 1 ? '今天' : day.date.slice(5).replace('-', '/');
          const showLabel = !narrow || index % 2 === 0 || index === days.length - 1;
          const tipText = `${day.date} · ${day.count} 张卡片`;
          return (
            <g key={day.date}>
              <circle cx={point.x} cy={point.y} r={3} fill="#fff" stroke="#428dd2" strokeWidth={1.6} />
              <circle
                cx={point.x}
                cy={point.y}
                r={14}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={tipText}
                onMouseEnter={(event) => setTip({ x: event.clientX, y: event.clientY, text: tipText })}
                onFocus={(event) => {
                  const rect = (event.currentTarget as SVGCircleElement).getBoundingClientRect();
                  setTip({ x: rect.left + rect.width / 2, y: rect.top, text: tipText });
                }}
                onBlur={() => setTip(null)}
              />
              {showLabel && (
                <text
                  x={point.x}
                  y={height - 14}
                  textAnchor={index === 0 ? 'start' : index === days.length - 1 ? 'end' : 'middle'}
                  fontSize={14}
                  fill="#8b929a"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-modal -translate-x-1/2 rounded-surface border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          style={{ left: tip.x, top: tip.y - 34 }}
        >
          {tip.text}
        </div>
      )}
    </div>
  );
};

interface AnkiHeatmapProps {
  endKey: DateKey;
  counts: ReadonlyMap<DateKey, number>;
  selected: DateKey | null;
  onSelect: (date: DateKey) => void;
}

export const AnkiHeatmap: React.FC<AnkiHeatmapProps> = ({ endKey, counts, selected, onSelect }) => {
  const columns = buildHeatGrid(endKey, counts);
  const [tip, setTip] = useState<string | null>(null);

  // 卸载/重渲染时不留悬停态。
  useEffect(() => () => setTip(null), []);

  return (
    <div data-testid="anki-heat" className="overflow-x-auto pb-1">
      <div className="flex gap-[5px]">
        <div className="flex w-[22px] shrink-0 flex-col gap-1 text-sm leading-none text-[#8b929a]" aria-hidden="true">
          {WEEKDAYS.map((label, index) => (
            <div key={index} className="flex h-[14px] items-center justify-center">
              {label}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex gap-[4px]">
            {columns.map((column) => (
              <div
                key={column.weekStart}
                className="h-6 w-[14px] shrink-0 whitespace-nowrap text-center text-sm leading-6 text-[#8b929a]"
              >
                {column.monthLabel}
              </div>
            ))}
          </div>
          <div className="flex gap-[4px]">
            {columns.map((column) => (
              <div key={column.weekStart} className="flex shrink-0 flex-col gap-1">
                {column.cells.map((cell) => {
                  if (cell.future) {
                    return <div key={cell.date} className="h-[14px] w-[14px]" aria-hidden="true" />;
                  }
                  const tipText = `${cell.date} · ${cell.count} 张卡片`;
                  const isSelected = cell.date === selected;
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      aria-label={tipText}
                      title={tipText}
                      onClick={() => {
                        onSelect(cell.date);
                        setTip(tipText);
                      }}
                      onMouseEnter={() => setTip(tipText)}
                      onMouseLeave={() => setTip(null)}
                      onFocus={() => setTip(tipText)}
                      onBlur={() => setTip(null)}
                      className={`h-[14px] w-[14px] rounded-[3px] transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${
                        isSelected ? 'ring-2 ring-sky-500 ring-offset-1' : ''
                      }`}
                      style={{ backgroundColor: HEAT_COLORS[heatLevel(cell.count)] }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-[18px] flex items-center justify-between text-sm" style={{ color: '#777d86' }}>
        <span role="status" aria-live="polite">
          {tip ?? '悬停或聚焦查看当日数量，点击选定日期'}
        </span>
        <span className="flex items-center gap-1" aria-hidden="true">
          少
          {HEAT_COLORS.map((color) => (
            <i key={color} className="block h-3 w-3 rounded-[2px]" style={{ backgroundColor: color }} />
          ))}
          多
        </span>
      </div>
    </div>
  );
};
