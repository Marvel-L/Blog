export type Metric = 'price100g' | 'kcal100g' | 'kcalPerYuan' | 'cost100kcal' | 'price' | 'weight' | 'x' | 'y';
export type TrendItem = {
  id: string;
  name: string;
  price: number;
  weight: number;
  energy: number;
  energyUnit: 'kJ' | 'kcal';
  x: number;
  y: number;
};
export type Threshold = { enabled: boolean; axis: 'x' | 'y'; direction: 'above' | 'below'; value: number };
export type TrendCategory = {
  id: string;
  name: string;
  kind: 'nutrition' | 'custom';
  xMetric: Metric;
  yMetric: Metric;
  xLabel: string;
  yLabel: string;
  threshold: Threshold;
  onDashboard: boolean;
  items: TrendItem[];
};
export type TrendState = { version: 1; categories: TrendCategory[]; selectedId: string };
export type TrendPoint = { item: TrendItem; x: number; y: number; color: string; exceeded: boolean; deviation: number };

export const STORAGE_KEY = 'd-blog-trend-v1';
export const METRICS: Record<Metric, { label: string; unit: string }> = {
  price100g: { label: '每 100g 价格', unit: '元 / 100g' },
  kcal100g: { label: '每 100g 热量', unit: 'kcal / 100g' },
  kcalPerYuan: { label: '每元热量', unit: 'kcal / 元' },
  cost100kcal: { label: '每 100kcal 成本', unit: '元 / 100kcal' },
  price: { label: '购买价格', unit: '元' },
  weight: { label: '购买重量', unit: 'g' },
  x: { label: '自定义横坐标', unit: '' },
  y: { label: '自定义纵坐标', unit: '' },
};
export const NUTRITION_METRICS = Object.keys(METRICS).filter((key) => key !== 'x' && key !== 'y') as Metric[];
export const formatNumber = (value: number) =>
  Number.isFinite(value) ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value) : '—';

export const metricValue = (item: TrendItem, metric: Metric): number | null => {
  const kcal = item.energyUnit === 'kJ' ? item.energy / 4.184 : item.energy;
  let value: number;
  switch (metric) {
    case 'price100g':
      value = item.weight > 0 ? (item.price * 100) / item.weight : NaN;
      break;
    case 'kcal100g':
      value = kcal;
      break;
    case 'kcalPerYuan':
      value = item.price > 0 ? (kcal * item.weight) / 100 / item.price : NaN;
      break;
    case 'cost100kcal':
      value = kcal > 0 && item.weight > 0 ? (item.price * 10000) / (kcal * item.weight) : NaN;
      break;
    default:
      value = item[metric];
  }
  return Number.isFinite(value) ? value : null;
};

const interpolate = (from: number[], to: number[], amount: number) =>
  `rgb(${from.map((value, index) => Math.round(value + (to[index] - value) * amount)).join(', ')})`;
const STOPS = [
  { at: 0, rgb: [34, 197, 94] },
  { at: 0.45, rgb: [59, 130, 246] },
  { at: 0.7, rgb: [139, 92, 246] },
  { at: 0.9, rgb: [249, 151, 38] },
  { at: 1, rgb: [239, 68, 68] },
];

/** 阈值内按接近程度渐变，越界后从淡红连续加深；同样支持下限与零/负阈值。 */
export const thresholdStyle = (value: number, threshold: Threshold) => {
  if (!threshold.enabled) return { color: 'rgb(13, 148, 136)', exceeded: false, deviation: 0 };
  const scale = Math.abs(threshold.value) || 1;
  const deviation = (threshold.direction === 'above' ? value - threshold.value : threshold.value - value) / scale;
  if (deviation > 0) {
    return { color: interpolate([252, 165, 165], [153, 27, 27], Math.min(1, deviation)), exceeded: true, deviation };
  }
  const proximity = Math.max(0, Math.min(1, 1 + deviation));
  const upper = STOPS.findIndex((stop) => stop.at >= proximity);
  const right = STOPS[Math.max(1, upper)];
  const left = STOPS[Math.max(1, upper) - 1];
  return {
    color: interpolate(left.rgb, right.rgb, (proximity - left.at) / (right.at - left.at)),
    exceeded: false,
    deviation,
  };
};

export const getPoints = (category: TrendCategory): TrendPoint[] =>
  category.items
    .flatMap((item) => {
      if (!item.name.trim()) return [];
      const x = metricValue(item, category.xMetric);
      const y = metricValue(item, category.yMetric);
      if (x === null || y === null) return [];
      return [{ item, x, y, ...thresholdStyle(category.threshold.axis === 'x' ? x : y, category.threshold) }];
    })
    .sort((a, b) => a.x - b.x);

export const axisLabel = (category: TrendCategory, axis: 'x' | 'y') => {
  const label = category[`${axis}Label`].trim();
  const metric = METRICS[category[`${axis}Metric`]];
  return label || `${metric.label}${metric.unit ? ` (${metric.unit})` : ''}`;
};

/** 数值域包含零、负值与阈值，避免单点、同值和空类别产生无效 SVG 坐标。 */
export const axisDomain = (values: number[], threshold?: number): [number, number] => {
  const finite = values.filter(Number.isFinite);
  if (threshold !== undefined && Number.isFinite(threshold)) finite.push(threshold);
  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  const span = max - min || 1;
  return [min < 0 ? min - span * 0.08 : 0, max > 0 ? max + span * 0.12 : span * 0.12];
};

export const emptyItem = (id: string): TrendItem => ({
  id,
  name: '',
  price: 0,
  weight: 100,
  energy: 0,
  energyUnit: 'kJ',
  x: 0,
  y: 0,
});
export const createCategory = (id: string, name: string, kind: TrendCategory['kind']): TrendCategory => ({
  id,
  name,
  kind,
  xMetric: kind === 'nutrition' ? 'price100g' : 'x',
  yMetric: kind === 'nutrition' ? 'kcal100g' : 'y',
  xLabel: '',
  yLabel: '',
  onDashboard: true,
  threshold: { enabled: true, axis: 'y', direction: 'above', value: kind === 'nutrition' ? 350 : 100 },
  items: [],
});

export const defaultState = (): TrendState => {
  const category = createCategory('snacks', '零食 · 价格与热量', 'nutrition');
  category.items = [
    { ...emptyItem('duck-neck'), name: '鸭脖', price: 30, weight: 500, energy: 1300 },
    { ...emptyItem('duck-leg'), name: '鸭腿', price: 5, weight: 130, energy: 600 },
    { ...emptyItem('yogurt'), name: '酸奶', price: 6, weight: 200, energy: 320 },
    { ...emptyItem('egg'), name: '卤蛋', price: 3, weight: 60, energy: 650 },
    { ...emptyItem('tofu'), name: '豆干', price: 8, weight: 200, energy: 800 },
    { ...emptyItem('chips'), name: '薯片', price: 8, weight: 100, energy: 2200 },
  ];
  return { version: 1, categories: [category], selectedId: category.id };
};

/** 仅升级旧默认类别；保留主动配置的指标，不改变解析和云端版本比较。 */
export const migrateLegacyNutritionState = (state: TrendState): TrendState => {
  let changed = false;
  const categories = state.categories.map((category) => {
    if (
      category.id !== 'snacks' ||
      category.name !== '零食 · 单位热量性价比' ||
      category.kind !== 'nutrition' ||
      category.xMetric !== 'price100g' ||
      category.yMetric !== 'kcalPerYuan' ||
      category.xLabel.trim() ||
      category.yLabel.trim()
    ) {
      return category;
    }
    changed = true;
    return {
      ...category,
      name: '零食 · 价格与热量',
      yMetric: 'kcal100g' as const,
      // 每元热量的阈值无法统一换算为每 100g 热量，保留数值但暂停旧 Y 阈值。
      threshold: category.threshold.axis === 'y' ? { ...category.threshold, enabled: false } : category.threshold,
    };
  });
  return changed ? { ...state, categories } : state;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length <= 200;
const hasUniqueIds = (items: { id: string }[]) =>
  items.every((item) => Boolean(item.id)) && new Set(items.map((item) => item.id)).size === items.length;
const isItem = (value: unknown): value is TrendItem =>
  isObject(value) &&
  exactKeys(value, ['id', 'name', 'price', 'weight', 'energy', 'energyUnit', 'x', 'y']) &&
  isText(value.id) &&
  isText(value.name) &&
  ['price', 'weight', 'energy', 'x', 'y'].every((key) => isNumber(value[key])) &&
  (value.price as number) >= 0 &&
  (value.weight as number) > 0 &&
  (value.energy as number) >= 0 &&
  ['kJ', 'kcal'].includes(String(value.energyUnit));
const isCategory = (value: unknown): value is TrendCategory => {
  if (!isObject(value) || !isObject(value.threshold)) return false;
  const threshold = value.threshold;
  return (
    exactKeys(value, [
      'id',
      'name',
      'kind',
      'xMetric',
      'yMetric',
      'xLabel',
      'yLabel',
      'threshold',
      'onDashboard',
      'items',
    ]) &&
    exactKeys(threshold, ['enabled', 'axis', 'direction', 'value']) &&
    isText(value.id) &&
    isText(value.name) &&
    Boolean(value.name.trim()) &&
    ['nutrition', 'custom'].includes(String(value.kind)) &&
    (value.kind === 'custom'
      ? value.xMetric === 'x' && value.yMetric === 'y'
      : NUTRITION_METRICS.includes(value.xMetric as Metric) && NUTRITION_METRICS.includes(value.yMetric as Metric)) &&
    isText(value.xLabel) &&
    isText(value.yLabel) &&
    typeof value.onDashboard === 'boolean' &&
    typeof threshold.enabled === 'boolean' &&
    ['x', 'y'].includes(String(threshold.axis)) &&
    ['above', 'below'].includes(String(threshold.direction)) &&
    isNumber(threshold.value) &&
    Array.isArray(value.items) &&
    value.items.length <= 500 &&
    value.items.every(isItem) &&
    hasUniqueIds(value.items)
  );
};

export const parseState = (raw: string): TrendState => {
  const value: unknown = JSON.parse(raw);
  if (
    !isObject(value) ||
    !exactKeys(value, ['version', 'categories', 'selectedId']) ||
    value.version !== 1 ||
    !Array.isArray(value.categories) ||
    value.categories.length === 0 ||
    value.categories.length > 50 ||
    !value.categories.every(isCategory) ||
    !hasUniqueIds(value.categories) ||
    !value.categories.some((category) => category.id === value.selectedId)
  ) {
    throw new Error('Trend 数据格式不正确，请使用此页面导出的 JSON 文件。');
  }
  return value as TrendState;
};
