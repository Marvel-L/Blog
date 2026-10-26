import { axisDomain, type Threshold } from './model';

export type ChartView = 'comparison' | 'distribution';
export type PriceScale = 'linear' | 'log';

/** 分布视图只保留数据两端的少量留白，避免强制从零开始扩大空白。 */
export const distributionDomain = (values: number[], threshold?: number): [number, number] => {
  const finite = values.filter(Number.isFinite);
  if (threshold !== undefined && Number.isFinite(threshold)) finite.push(threshold);
  if (!finite.length) return [0, 1];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const padding = (max - min || Math.abs(min) || 1) * 0.1;
  return [min - padding, max + padding];
};

export const canUseLogScale = (values: number[], threshold: Threshold) =>
  values.length > 0 &&
  values.every((value) => Number.isFinite(value) && value > 0) &&
  (!threshold.enabled || threshold.axis !== 'x' || threshold.value > 0);

export const numericAxis = (values: number[], threshold?: number, scale: PriceScale = 'linear', fromZero = false) => {
  const domain =
    scale === 'log'
      ? distributionDomain(
          values.map((value) => Math.log10(value)),
          threshold === undefined ? undefined : Math.log10(threshold),
        )
      : fromZero
        ? axisDomain(values, threshold)
        : distributionDomain(values, threshold);
  const transform = (value: number) => (scale === 'log' ? Math.log10(value) : value);
  return {
    ratio: (value: number) => (transform(value) - domain[0]) / (domain[1] - domain[0]),
    tick: (ratio: number) => {
      const value = domain[0] + ratio * (domain[1] - domain[0]);
      return scale === 'log' ? 10 ** value : value;
    },
  };
};

export const comparisonRatio = (index: number, count: number) => (index + 0.5) / Math.max(1, count);

/** 阈值落在排序后的条目之间；等于阈值的条目始终属于阈值内。 */
export const comparisonThresholdRatio = (sortedValues: number[], threshold: Threshold) =>
  sortedValues.length
    ? sortedValues.filter((value) =>
        threshold.direction === 'above' ? value <= threshold.value : value < threshold.value,
      ).length / sortedValues.length
    : 0.5;

export const shortenLabel = (text: string, limit = 8) => {
  const letters = Array.from(text);
  return letters.length > limit ? `${letters.slice(0, limit).join('')}…` : text;
};

type Bounds = { left: number; right: number; top: number; bottom: number };
export type LabelPosition = { x: number; y: number; anchor: 'start' | 'middle' | 'end'; text: string };
type LabelPoint = { id: string; name: string; x: number; y: number };
const overlaps = (a: Bounds, b: Bounds) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** 优先给选中点放标签，避开其他标签和圆点；拥挤时完整信息由详情栏提供。 */
export const placeScatterLabels = (
  points: LabelPoint[],
  bounds: Bounds,
  activeId: string | null,
  reserved: Bounds[] = [],
): Map<string, LabelPosition> => {
  const occupied = [...reserved];
  const labels = new Map<string, LabelPosition>();
  const ordered = [...points].sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId));
  for (const point of ordered) {
    const text = shortenLabel(point.name, 12);
    const width = Array.from(text).reduce((sum, letter) => sum + ((letter.codePointAt(0) ?? 0) > 127 ? 12 : 7), 0);
    const candidates: LabelPosition[] = [
      { x: point.x, y: point.y - 20, anchor: 'middle', text },
      { x: point.x + 18, y: point.y + 4, anchor: 'start', text },
      { x: point.x - 18, y: point.y + 4, anchor: 'end', text },
      { x: point.x, y: point.y + 30, anchor: 'middle', text },
    ];
    for (const label of candidates) {
      const left = label.x - (label.anchor === 'middle' ? width / 2 : label.anchor === 'end' ? width : 0);
      const rect = { left: left - 4, right: left + width + 4, top: label.y - 15, bottom: label.y + 5 };
      if (
        rect.left < bounds.left ||
        rect.right > bounds.right ||
        rect.top < bounds.top ||
        rect.bottom > bounds.bottom ||
        occupied.some((other) => overlaps(rect, other)) ||
        points.some((other) =>
          overlaps(rect, { left: other.x - 10, right: other.x + 10, top: other.y - 10, bottom: other.y + 10 }),
        )
      ) {
        continue;
      }
      occupied.push(rect);
      labels.set(point.id, label);
      break;
    }
  }
  return labels;
};
