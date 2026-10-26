/**
 * Anki 统计日期工具。
 *
 * 服务端按 Asia/Shanghai 自然日落日期（YYYY-MM-DD）；客户端绝不根据本机时区
 * 重新切日。所有网格运算都在 UTC 日历坐标内完成（Date.UTC），避免用户本地
 * 时区与上海不一致时热力图/折线错位。
 */

export type DateKey = string;

const pad = (value: number): string => String(value).padStart(2, '0');

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

export const parseDateKey = (key: DateKey): Ymd => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return { y: 1970, m: 1, d: 1 };
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
};

export const toDateKey = (y: number, m: number, d: number): DateKey => `${y}-${pad(m)}-${pad(d)}`;

const toUtcMs = ({ y, m, d }: Ymd): number => Date.UTC(y, m - 1, d);

const fromUtcMs = (ms: number): Ymd => {
  const date = new Date(ms);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
};

/** 以自然日为单位平移 offset 天（可为负）。 */
export const shiftDateKey = (key: DateKey, offset: number): DateKey => {
  const next = fromUtcMs(toUtcMs(parseDateKey(key)) + offset * 86400000);
  return toDateKey(next.y, next.m, next.d);
};

/** 0=周日 … 6=周六（与服务端上海自然日对齐的日历星期）。 */
export const weekdayOf = (key: DateKey): number => new Date(toUtcMs(parseDateKey(key))).getUTCDay();

/** 截至 endKey 的最近 n 个自然日（旧 → 新）。 */
export const lastNDays = (endKey: DateKey, n: number): DateKey[] => {
  const days: DateKey[] = [];
  for (let offset = n - 1; offset >= 0; offset -= 1) {
    days.push(shiftDateKey(endKey, -offset));
  }
  return days;
};

export interface HeatCell {
  date: DateKey;
  count: number;
  /** 晚于 endKey 的未来格：不渲染为可交互格，仅占位。 */
  future: boolean;
}

export interface HeatColumn {
  weekStart: DateKey;
  cells: HeatCell[];
  monthLabel: string;
}

/**
 * GitHub 式 13 周热力网格：周为列、周日→周六为行，锚定服务端 today。
 * 计数只取服务端 history，客户端不推断练习量。
 */
export const buildHeatGrid = (endKey: DateKey, counts: ReadonlyMap<DateKey, number>, weeks = 13): HeatColumn[] => {
  const end = parseDateKey(endKey);
  // 本列从周日开始；锚点所在周再向前推 weeks-1 周。
  const anchorSunday = fromUtcMs(toUtcMs(end) - new Date(toUtcMs(end)).getUTCDay() * 86400000);
  const gridStart = fromUtcMs(toUtcMs(anchorSunday) - (weeks - 1) * 7 * 86400000);

  const columns: HeatColumn[] = [];
  let lastMonth = -1;
  for (let week = 0; week < weeks; week += 1) {
    const weekStart = fromUtcMs(toUtcMs(gridStart) + week * 7 * 86400000);
    const cells: HeatCell[] = [];
    for (let row = 0; row < 7; row += 1) {
      const cellYmd = fromUtcMs(toUtcMs(weekStart) + row * 86400000);
      const date = toDateKey(cellYmd.y, cellYmd.m, cellYmd.d);
      cells.push({ date, count: counts.get(date) ?? 0, future: date > endKey });
    }
    const month = weekStart.m;
    columns.push({
      weekStart: toDateKey(weekStart.y, weekStart.m, weekStart.d),
      cells,
      monthLabel: month !== lastMonth ? `${month}月` : '',
    });
    lastMonth = month;
  }
  return columns;
};

/** 色阶：0 / 1–3 / 4–6 / 7–9 / 10+（与原型一致）。 */
export const heatLevel = (count: number): 0 | 1 | 2 | 3 | 4 => {
  if (count <= 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
};
