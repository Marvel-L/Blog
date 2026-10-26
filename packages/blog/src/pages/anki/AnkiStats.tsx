/**
 * 学习统计：近 7 日去重练习折线 + 近 13 周热力图 + 选定日明细。
 * 全部数字来自服务端 history；今日锚定服务端 timeZone=Asia/Shanghai 的 today。
 */

import { useMemo, useState } from 'react';
import { lastNDays, type DateKey } from './anki-date';
import type { NormalizedDashboard } from './anki-api';
import { AnkiHeatmap, AnkiTrendLine } from './AnkiCharts';

interface AnkiStatsProps {
  dashboard: NormalizedDashboard;
  onBack: () => void;
  onEditGoal: () => void;
}

export function AnkiStats({ dashboard, onBack, onEditGoal }: AnkiStatsProps) {
  // 历史最后一条即今天（上海自然日）；缺省回退空串，网格自然退化为无数据。
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
  // todayKey 在首次加载后稳定；selectedDay 初始化同步一次。
  const selected = selectedDay && selectedDay <= todayKey ? selectedDay : todayKey || null;
  const selectedStat = dashboard.history.find((day) => day.date === selected);

  const done = dashboard.todayCards;
  const goal = dashboard.goal;
  const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button type="button" className="editorial-button text-sm" onClick={onBack}>
            返回卡片库
          </button>
          <h1 className="mt-3 text-2xl font-bold text-ink dark:text-white">学习统计</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">每一次主动回忆，都会留下记录。</p>
        </div>
        <button type="button" className="editorial-button text-sm" onClick={onEditGoal}>
          每日目标 {goal} 张
        </button>
      </div>

      <section
        aria-label="今日目标"
        className="flex flex-wrap items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400"
      >
        <span>
          今日已练 <strong className="text-ink dark:text-white">{done}</strong> / {goal} 张
        </span>
        <div
          className="h-1 w-32 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
          role="progressbar"
          aria-label="今日目标进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="h-full rounded-full bg-sky-600" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <section aria-label="练习趋势">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-ink dark:text-white">近 7 日练习量</h2>
          <span className="text-xs text-zinc-400">张 / 日内去重</span>
        </div>
        <AnkiTrendLine days={last7} />
        <p className="mt-2 text-xs text-zinc-400">只统计完成自评的卡片。</p>
      </section>

      <section aria-label="练习热力图">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-ink dark:text-white">练习热力图</h2>
          <span className="text-xs text-zinc-400">近 13 周</span>
        </div>
        <AnkiHeatmap endKey={todayKey} counts={counts} selected={selected} onSelect={setSelectedDay} />
      </section>

      <section aria-label="选定日明细">
        <h2 className="text-base font-semibold text-ink dark:text-white">当天明细</h2>
        <p className="mt-1 text-xs text-zinc-400">{selected}</p>
        {selectedStat ? (
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span className="flex items-baseline gap-1.5">
              <strong className="text-2xl font-semibold text-ink dark:text-white">{selectedStat.uniqueCards}</strong>
              <span className="text-xs text-zinc-400">张不同卡片</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <strong className="text-2xl font-semibold text-ink dark:text-white">{selectedStat.reviews}</strong>
              <span className="text-xs text-zinc-400">次评价</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <strong className="text-2xl font-semibold text-ink dark:text-white">{selectedStat.goal}</strong>
              <span className="text-xs text-zinc-400">张当日目标</span>
            </span>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">这一天还没有练习记录。</p>
        )}
        <p className="mt-3 text-xs text-zinc-400">统计按服务端 Asia/Shanghai 自然日分组；目标完成率不等于掌握率。</p>
      </section>
    </div>
  );
}
