import { describe, expect, it } from 'vitest';
import {
  axisDomain,
  createCategory,
  defaultState,
  emptyItem,
  getPoints,
  metricValue,
  parseState,
  thresholdStyle,
} from './model';

describe('Trend 数据与坐标', () => {
  it('将按斤和按个购买的零食统一换算为每 100g 价格、kcal 和每元热量', () => {
    const [neck, leg] = defaultState().categories[0].items;
    expect(metricValue(neck, 'price100g')).toBe(6);
    expect(metricValue(leg, 'price100g')).toBeCloseTo(3.8461538);
    expect(metricValue(neck, 'kcal100g')).toBeCloseTo(1300 / 4.184);
    expect(metricValue(neck, 'kcalPerYuan')).toBeCloseTo(1300 / 4.184 / 6);
    expect(metricValue(leg, 'kcalPerYuan')).toBeCloseTo(((600 / 4.184) * 1.3) / 5);
    expect(metricValue(neck, 'cost100kcal')).toBeCloseTo(100 / (1300 / 4.184 / 6));
    expect(metricValue({ ...neck, energy: 200, energyUnit: 'kcal' }, 'kcal100g')).toBe(200);
  });

  it('过滤没有名称、除零和溢出数据，按数值横坐标而非名称排序', () => {
    const category = createCategory('test', '测试', 'custom');
    category.items = [
      { ...emptyItem('a'), name: 'A', x: 10, y: 20 },
      { ...emptyItem('b'), name: 'B', x: -2, y: -3 },
      emptyItem('unnamed'),
    ];
    expect(getPoints(category).map((point) => point.item.id)).toEqual(['b', 'a']);
    expect(metricValue({ ...emptyItem('zero'), price: 0 }, 'kcalPerYuan')).toBeNull();
    expect(metricValue({ ...emptyItem('overflow'), price: 1e308 }, 'price100g')).toBeNull();
  });

  it('阈值内依次为绿、蓝、紫、橙、红；超出后从淡红逐渐变深', () => {
    const threshold = { enabled: true, axis: 'y' as const, direction: 'above' as const, value: 100 };
    expect([0, 45, 70, 90, 100].map((value) => thresholdStyle(value, threshold).color)).toEqual([
      'rgb(34, 197, 94)',
      'rgb(59, 130, 246)',
      'rgb(139, 92, 246)',
      'rgb(249, 151, 38)',
      'rgb(239, 68, 68)',
    ]);
    expect(thresholdStyle(100, threshold).exceeded).toBe(false);
    expect(thresholdStyle(100.01, threshold)).toMatchObject({ color: 'rgb(252, 165, 165)', exceeded: true });
    expect(thresholdStyle(200, threshold).color).toBe('rgb(153, 27, 27)');
    expect(thresholdStyle(300, threshold).color).toBe('rgb(153, 27, 27)');
  });

  it('下限、零阈值、负阈值和禁用状态都能正确判断', () => {
    const threshold = { enabled: true, axis: 'x' as const, direction: 'below' as const, value: 100 };
    expect(thresholdStyle(0, threshold).exceeded).toBe(true);
    expect(thresholdStyle(200, threshold).color).toBe('rgb(34, 197, 94)');
    expect(thresholdStyle(-1, { ...threshold, value: 0 }).exceeded).toBe(true);
    expect(thresholdStyle(-20, { ...threshold, value: -10 }).exceeded).toBe(true);
    expect(thresholdStyle(-20, { ...threshold, value: -10, direction: 'above' }).exceeded).toBe(false);
    expect(thresholdStyle(0, { ...threshold, enabled: false }).exceeded).toBe(false);
  });

  it('数值域包含阈值、负数、零，并且单点和空数据始终有非零跨度', () => {
    expect(axisDomain([1, 2], 100)[1]).toBeGreaterThan(100);
    expect(axisDomain([-10, -5])[0]).toBeLessThan(-10);
    for (const values of [[], [0], [3, 3]]) {
      const [min, max] = axisDomain(values);
      expect(max).toBeGreaterThan(min);
      expect(Number.isFinite(max)).toBe(true);
    }
  });

  it('配置可以完整往返，拒绝畸形、重复 ID、非法单位、未知指标和不一致选择', () => {
    const state = defaultState();
    expect(parseState(JSON.stringify(state))).toEqual(state);
    expect(() => parseState('{')).toThrow();
    expect(() => parseState(JSON.stringify({ ...state, categories: [] }))).toThrow();
    expect(() =>
      parseState(JSON.stringify({ ...state, categories: [...state.categories, state.categories[0]] })),
    ).toThrow();
    expect(() => parseState(JSON.stringify({ ...state, selectedId: 'missing' }))).toThrow();
    for (const patch of [{ xMetric: 'unknown' }, { name: '' }, { threshold: null }]) {
      expect(() =>
        parseState(JSON.stringify({ ...state, categories: [{ ...state.categories[0], ...patch }] })),
      ).toThrow();
    }
    for (const patch of [{ energyUnit: 'J' }, { weight: 0 }, { price: -1 }, { x: null }]) {
      const category = { ...state.categories[0], items: [{ ...state.categories[0].items[0], ...patch }] };
      expect(() => parseState(JSON.stringify({ ...state, categories: [category] }))).toThrow();
    }
  });
});
