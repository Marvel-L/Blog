/**
 * 学习统计：近 7 日去重练习折线 + 近 13 周热力图 + 选定日明细。
 * 全部数字来自服务端 history；今日锚定服务端 timeZone=Asia/Shanghai 的 today。
 */

import { useMemo, useState } from 'react';
import { lastNDays, type DateKey } from './anki-date';
import type { NormalizedDashboard } from './anki-api';
import { AnkiHeatmap, AnkiTrendLine } from './AnkiCharts';

const T = {
  ink: '#202124',
  muted: '#777d86',
  line: '#e9edf1',
  accent: '#087ae9',
};

interface AnkiStatsProps {
  dashboard: NormalizedDashboard;
  onBack: () => void;
  onEditGoal: () => void;
}

export function AnkiStats({ dashboard, onBack, onEditGoal }: AnkiStatsProps) {
  const todayKey: DateKey = dashboard.history.length > 0 ? dashboard.history[dashboard.history.length - 1].date : '';

  const counts = useMemo(() => {
    const map = new Map<DateKey, number>();
    dashboard.history.forEach((day) => map.set(day.date, day.uniqueCards));
    return map;
  }, [dashboard.history]);

  const last7 = useMemo(
    () =>
      (todayKey ? lastNDays(todayKey, 7) : []).map((date) => ({
        date,
        count: counts.get(date) ?? 0,
      })),
    [counts, todayKey],
  );

  const [selectedDay, setSelectedDay] = useState<DateKey | null>(todayKey || null);
  const selected = selectedDay && selectedDay <= todayKey ? selectedDay : todayKey || null;
  const selectedStat = dashboard.history.find((day) => day.date === selected);

  const done = dashboard.todayCards;
  const goal = dashboard.goal;
  const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;

  return (
    <div>
      <div className="mb-[35px] flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            type="button"
            className="text-sm font-medium hover:opacity-80"
            style={{ color: T.accent }}
            onClick={onBack}
          >
            ← 返回卡片库
          </button>
          <h1 className="mt-3 text-[21px] font-medium leading-[1.4]" style={{ color: T.ink }}>
            学习统计
          </h1>
          <p className="mt-1 text-sm" style={{ color: T.muted }}>
            每一次主动回忆，都会留下记录。
          </p>
        </div>
        <button
          type="button"
          className="text-sm font-medium hover:opacity-80"
          style={{ color: T.accent }}
          onClick={onEditGoal}
        >
          每日目标 {goal} 张
        </button>
      </div>

      <section
        aria-label="今日目标"
        className="flex flex-wrap items-center gap-3 pb-[30px] text-sm"
        style={{ color: T.muted }}
      >
        <span>
          今日已练{' '}
          <strong className="font-medium tabular-nums" style={{ color: T.ink }}>
            {done}
          </strong>{' '}
          / {goal}
        </span>
        <div
          className="h-1 w-[110px] overflow-hidden rounded-full bg-[#eef1f4]"
          role="progressbar"
          aria-label="今日目标进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: T.accent }} />
        </div>
      </section>

      <section aria-label="练习趋势" className="border-t pt-[26px]" style={{ borderColor: T.line }}>
        <div className="mb-[8px] flex items-baseline justify-between">
          <h2 className="text-[18px] font-medium" style={{ color: T.ink }}>
            近 7 日练习量
          </h2>
          <span className="text-sm" style={{ color: T.muted }}>
            张 / 日内去重
          </span>
        </div>
        <AnkiTrendLine days={last7} />
        <p className="mt-[12px] text-sm" style={{ color: T.muted }}>
          只统计完成自评的卡片。
        </p>
      </section>

      <section aria-label="练习热力图" className="mt-[37px] border-t py-[26px]" style={{ borderColor: T.line }}>
        <div className="mb-[8px] flex items-baseline justify-between">
          <h2 className="text-[18px] font-medium" style={{ color: T.ink }}>
            练习热力图
          </h2>
          <span className="text-sm" style={{ color: T.muted }}>
            近 13 周
          </span>
        </div>
        <AnkiHeatmap endKey={todayKey} counts={counts} selected={selected} onSelect={setSelectedDay} />
      </section>

      <section aria-label="选定日明细" className="border-t pt-[27px]" style={{ borderColor: T.line }}>
        <p className="mb-[18px] text-sm" style={{ color: T.muted }}>
          {selected || '—'}
        </p>
        {selectedStat ? (
          <div className="flex flex-wrap gap-x-[38px] gap-y-3 py-0">
            <span className="flex items-baseline gap-2">
              <strong className="text-2xl font-medium tabular-nums" style={{ color: T.ink }}>
                {selectedStat.uniqueCards}
              </strong>
              <span className="text-sm" style={{ color: T.muted }}>
                张不同卡片
              </span>
            </span>
            <span className="flex items-baseline gap-2">
              <strong className="text-2xl font-medium tabular-nums" style={{ color: T.ink }}>
                {selectedStat.reviews}
              </strong>
              <span className="text-sm" style={{ color: T.muted }}>
                次评价
              </span>
            </span>
            <span className="flex items-baseline gap-2">
              <strong className="text-2xl font-medium tabular-nums" style={{ color: T.ink }}>
                {selectedStat.goal}
              </strong>
              <span className="text-sm" style={{ color: T.muted }}>
                张当日目标
              </span>
            </span>
          </div>
        ) : (
          <p className="text-sm" style={{ color: T.muted }}>
            这一天还没有练习记录。
          </p>
        )}
        <p className="mt-5 text-sm" style={{ color: T.muted }}>
          统计按服务端 Asia/Shanghai 自然日分组；目标完成率不等于掌握率。
        </p>
      </section>
    </div>
  );
}
