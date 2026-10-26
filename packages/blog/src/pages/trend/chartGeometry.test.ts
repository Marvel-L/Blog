import { describe, expect, it } from 'vitest';
import {
  canUseLogScale,
  comparisonThresholdRatio,
  distributionDomain,
  numericAxis,
  placeScatterLabels,
} from './chartGeometry';

const threshold = { enabled: true, axis: 'x' as const, direction: 'above' as const, value: 10 };

describe('Trend 图表布局', () => {
  it('真实分布域紧贴数据，空、单点、同值和负数仍有有效范围', () => {
    const domain = distributionDomain([100, 110]);
    expect(domain[0]).toBeGreaterThan(90);
    expect(domain[1]).toBeLessThan(120);
    expect(distributionDomain([100, 110], 200)[1]).toBeGreaterThan(200);
    for (const values of [[], [0], [3, 3], [-10, -5]]) {
      const [min, max] = distributionDomain(values);
      expect(Number.isFinite(min) && Number.isFinite(max)).toBe(true);
      expect(max).toBeGreaterThan(min);
      for (const value of values) expect(numericAxis(values).ratio(value)).toBeGreaterThanOrEqual(0);
    }
  });

  it('对数轴以相同距离表达十倍差，刻度与数据使用相同变换', () => {
    const axis = numericAxis([1, 10, 100, 1000], undefined, 'log');
    expect(axis.ratio(10) - axis.ratio(1)).toBeCloseTo(axis.ratio(1000) - axis.ratio(100));
    expect(axis.tick(axis.ratio(100))).toBeCloseTo(100);
    expect(canUseLogScale([1, 1000], threshold)).toBe(true);
    expect(canUseLogScale([0, 1000], threshold)).toBe(false);
    expect(canUseLogScale([-1, 1000], threshold)).toBe(false);
    expect(canUseLogScale([1, 1000], { ...threshold, value: 0 })).toBe(false);
    expect(canUseLogScale([1, 1000], { ...threshold, value: 0, enabled: false })).toBe(true);
    expect(canUseLogScale([], threshold)).toBe(false);
  });

  it('等距 X 阈值在正确分界处，同值不被误判为越界，范围外阈值覆盖全部或零条目', () => {
    const values = [1, 10, 10, 1000];
    expect(comparisonThresholdRatio(values, threshold)).toBe(0.75);
    expect(comparisonThresholdRatio(values, { ...threshold, direction: 'below' })).toBe(0.25);
    expect(comparisonThresholdRatio(values, { ...threshold, value: -1 })).toBe(0);
    expect(comparisonThresholdRatio(values, { ...threshold, value: 2000 })).toBe(1);
  });

  it('密集散点标签不重叠，选中点优先获得位置，无法放置的标签让位于详情栏', () => {
    const points = Array.from({ length: 8 }, (_, index) => ({
      id: String(index),
      name: '很长的食品条目名称',
      x: 200,
      y: 100,
    }));
    const labels = placeScatterLabels(points, { left: 0, right: 400, top: 0, bottom: 200 }, '7');
    expect(labels.has('7')).toBe(true);
    expect(labels.size).toBeLessThan(points.length);
    const positions = [...labels.values()].map((label) => `${label.x},${label.y},${label.anchor}`);
    expect(new Set(positions).size).toBe(positions.length);
  });
});
