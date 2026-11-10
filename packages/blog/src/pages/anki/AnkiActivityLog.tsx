import { useEffect, useRef, useState } from 'react';
import { copyTextToClipboard } from '@/utils/clipboard';
import { fetchAnkiActivities, type AnkiActivity } from './anki-api';
import { shiftDateKey } from './anki-date';

const RESULTS = {
  correct: '✅',
  hard: '😩',
  wrong: '❌',
};
const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();

function formatAnkiActivity(entry: AnkiActivity): string {
  const content = `${oneLine(entry.deckName)} | ${oneLine(entry.question)}`;
  if (entry.kind === 'create') return `${content} | 新增`;
  const result =
    entry.rating === 'custom' ? `自定义间隔(${entry.customDays}天)` : RESULTS[entry.rating as keyof typeof RESULTS];
  return `${content} | ${result}`;
}

function formatAnkiActivityDay(date: string, entries: AnkiActivity[]): string {
  const note = entries.some((entry) => entry.historical)
    ? '\n注：历史补入记录的内容为启用日志时的卡片内容，可能与操作当时不同；缺失内容标为不可用。'
    : '';
  return `${date} Anki 操作记录${note}\n${entries.map(formatAnkiActivity).join('\n')}`;
}

const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function AnkiActivityLog({ today, refreshToken = 0 }: { today: string; refreshToken?: number }) {
  if (!today) return null;
  const yesterday = shiftDateKey(today, -1);
  return (
    <section aria-label="用户操作记录" className="anki-activity">
      <h2 className="text-[18px] font-medium">用户操作记录</h2>
      <p className="anki-activity-help">默认展示前天和昨天，可分别选择更早的日期。每次新增和记忆逐条保留。</p>
      <div className="anki-activity-days">
        {[shiftDateKey(today, -2), yesterday].map((date, index) => (
          <ActivityDay key={index} defaultDate={date} latestDate={yesterday} slot={index} refreshToken={refreshToken} />
        ))}
      </div>
    </section>
  );
}

function ActivityDay({
  defaultDate,
  latestDate,
  slot,
  refreshToken,
}: {
  defaultDate: string;
  latestDate: string;
  slot: number;
  refreshToken: number;
}) {
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const date = chosenDate && chosenDate <= latestDate ? chosenDate : defaultDate;
  const [loaded, setLoaded] = useState<{ date: string; entries: AnkiActivity[] } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');
  const [copying, setCopying] = useState(false);
  const generation = useRef(0);
  const copyPending = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const entries = loaded?.date === date ? loaded.entries : null;

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const current = ++generation.current;
    copyPending.current = false;
    setLoaded(null);
    setError('');
    setCopyStatus('');
    setCopying(false);
    fetchAnkiActivities(date, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && current === generation.current) setLoaded({ date, entries: data });
      })
      .catch((cause) => {
        if (!controller.signal.aborted && current === generation.current)
          setError(cause instanceof Error ? cause.message : '操作记录加载失败，请重试');
      });
    return () => {
      controller.abort();
      generation.current += 1;
    };
  }, [date, refreshToken, retry]);

  const changeDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > latestDate || value === date) return;
    generation.current += 1;
    controllerRef.current?.abort();
    setChosenDate(value);
    setLoaded(null);
    setError('');
    setCopyStatus('');
    setCopying(false);
    copyPending.current = false;
  };

  const copy = async () => {
    if (!entries?.length || copyPending.current) return;
    copyPending.current = true;
    const current = generation.current;
    setCopying(true);
    setCopyStatus('');
    try {
      const success = await copyTextToClipboard(formatAnkiActivityDay(date, entries));
      if (current === generation.current)
        setCopyStatus(success ? '已复制当天全部操作' : '复制失败，请重试或手动选择记录复制');
    } catch {
      if (current === generation.current) setCopyStatus('复制失败，请重试或手动选择记录复制');
    } finally {
      if (current === generation.current) {
        copyPending.current = false;
        setCopying(false);
      }
    }
  };

  return (
    <section aria-label={`第${slot + 1}天操作记录`} className="anki-activity-day">
      <header className="anki-activity-day-header">
        <label className="anki-activity-date">
          <span>日期</span>
          <input
            type="date"
            aria-label={`第${slot + 1}天操作日期`}
            value={date}
            max={latestDate}
            onChange={(event) => changeDate(event.target.value)}
          />
        </label>
        <div className="anki-activity-day-actions">
          {entries && <span>{entries.length} 条操作</span>}
          <button type="button" disabled={!entries?.length || copying} onClick={() => void copy()}>
            {copying ? '正在复制…' : '复制当天'}
          </button>
        </div>
      </header>
      <div role="status" aria-live="polite" className="anki-activity-status">
        {copyStatus}
      </div>
      {error ? (
        <div role="alert" className="anki-activity-error">
          <span>{error}</span>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            重新加载
          </button>
        </div>
      ) : entries ? (
        entries.length ? (
          <>
            {entries.some((entry) => entry.historical) && (
              <p className="anki-activity-help">
                历史补入记录的内容为启用日志时的卡片内容，可能与操作当时不同；缺失内容标为不可用。
              </p>
            )}
            <ol className="anki-activity-list">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <time dateTime={entry.occurredAt}>{timeFormat.format(new Date(entry.occurredAt))}</time>
                  <p>{formatAnkiActivity(entry)}</p>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="anki-activity-empty">这一天没有操作记录。</p>
        )
      ) : (
        <p role="status" className="anki-activity-empty">
          正在加载操作记录…
        </p>
      )}
    </section>
  );
}
