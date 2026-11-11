import { useEffect, useMemo, useRef, useState } from 'react';
import { useHref, useSearchParams } from 'react-router-dom';
import {
  ArrowDownRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  PencilLine,
  Plus,
  Sparkles,
} from 'lucide-react';
import { AccountCredentials } from '@/cloud/AccountCredentials';
import { Seo } from '@/components/Seo';
import { MarkdownBody } from '@/components/markdown/MarkdownBody';
import { useWeeklyJournal } from './useWeeklyJournal';
import {
  WEEKDAYS,
  JOURNAL_TEMPLATE,
  emptyWeek,
  mondayOf,
  shanghaiDate,
  shiftDate,
  thoughtTime,
  validJournalDate,
  type JournalDay,
  type WeeklyState,
} from './weekly-model';
import './weekly-journal.css';

const button = 'journal-button';
const input = 'journal-input';

function useMounted() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

export default function WeeklyJournal() {
  const [params, setParams] = useSearchParams();
  const rawWeek = params.get('week') ?? '';
  const selection = validJournalDate(rawWeek) ? mondayOf(rawWeek) : '';
  const journal = useWeeklyJournal(selection);
  const loginReturn = useHref('/weekly-journal');
  const { data, phase, busy } = journal;
  const state = useMemo(() => (data ? (data.archive.state ?? emptyWeek(data.weekStart)) : null), [data]);
  const pickWeek = (date: string) => {
    if (busy || !validJournalDate(date)) return;
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('week', mondayOf(date));
      return next;
    });
  };

  return (
    <section aria-label="我的周记" className="weekly-journal">
      <Seo
        title="我的周记"
        description="以周一为起点，按周一到周日整理学习笔记、完成事项、遗留问题与生活记录。随想写在当天的卡片里，登录后回顾和编辑只属于自己的每一周。"
        url="/weekly-journal"
        noindex
      />
      <header className="journal-heading">
        <div>
          <p className="journal-eyebrow">
            <CalendarDays size={14} aria-hidden="true" /> 每周一页 · 生活有迹
          </p>
          <h1>
            周记<span aria-hidden="true"> / </span>
            <small>Weekly Journal</small>
          </h1>
          <p className="journal-description">记下做过的事、学到的东西，还有一闪而过的想法。</p>
        </div>
        <span className="journal-privacy">
          <LockKeyhole size={13} aria-hidden="true" /> 仅自己可见
        </span>
      </header>
      {phase === 'loading' && (
        <p role="status" className="journal-loading">
          正在加载周记…
        </p>
      )}
      {phase === 'unauthorized' && (
        <div className="journal-access">
          <div className="journal-access-icon">
            <LockKeyhole size={23} aria-hidden="true" />
          </div>
          <h3 className="text-lg font-semibold">登录后，记录自己的这一周</h3>
          <p className="journal-description mb-6 mt-2">周记和随想仅自己可见，登录后可以查看和编辑。</p>
          <AccountCredentials user={null} onUser={journal.retry} />
          <a
            className={`${button} mt-5 inline-flex`}
            href={`/api/v1/auth/github/start?return_to=${encodeURIComponent(loginReturn)}`}
          >
            使用 GitHub 登录
          </a>
        </div>
      )}
      {phase === 'error' && (
        <div className="journal-access space-y-4">
          <p role="alert">{journal.error}</p>
          <button type="button" className={button} onClick={journal.retry}>
            重新加载周记
          </button>
        </div>
      )}
      {phase === 'ready' && data && state && (
        <>
          <div className="journal-week">
            <div className="journal-week-main">
              <div className="journal-week-title">
                <span className="journal-eyebrow">
                  {shiftDate(data.weekStart, 3).slice(0, 4)} · 第 {weekNumber(data.weekStart)} 周
                </span>
                <p className="journal-week-range">
                  {data.weekStart} — {shiftDate(data.weekStart, 6)}
                </p>
              </div>
              <div className="journal-week-controls">
                <div className="journal-date-control">
                  <button
                    type="button"
                    aria-label="上一周"
                    className={`${button} journal-icon-button`}
                    disabled={busy || data.weekStart <= '1900-01-01'}
                    onClick={() => pickWeek(shiftDate(data.weekStart, -7))}
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  <input
                    type="date"
                    aria-label="选择一周"
                    value={data.weekStart}
                    min="1900-01-01"
                    max="2100-12-26"
                    disabled={busy}
                    onChange={(event) => pickWeek(event.target.value)}
                  />
                  <button
                    type="button"
                    aria-label="下一周"
                    className={`${button} journal-icon-button`}
                    disabled={busy || data.weekStart >= '2100-12-20'}
                    onClick={() => pickWeek(shiftDate(data.weekStart, 7))}
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
                <button type="button" className={button} disabled={busy} onClick={() => pickWeek(data.today)}>
                  回到本周
                </button>
              </div>
            </div>
            <div className="journal-week-foot">
              <p>
                周一至周日<span> · </span>
                {state.days.filter((day) => day.content.trim() || day.thoughts.length).length} / 7 天有记录
              </p>
              {mondayOf(data.today) === data.weekStart && (
                <a className="journal-today-link" href={`#journal-day-${data.today}`}>
                  写今天
                  <ArrowDownRight size={14} aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
          {journal.error && (
            <p role="alert" className="journal-error">
              {journal.error}
            </p>
          )}
          <ol className="journal-days">
            {state.days.map((day, index) => (
              <JournalDayCard
                key={`${journal.session}:${day.date}`}
                day={day}
                label={WEEKDAYS[index]}
                today={data.today}
                busy={busy}
                save={journal.save}
              />
            ))}
          </ol>
          <p className="journal-footer-note">以周一为起点 · 日期与随想时间按北京时间展示</p>
        </>
      )}
    </section>
  );
}

type SaveWeek = (key: string, transform: (state: WeeklyState) => WeeklyState) => Promise<boolean>;

function weekNumber(monday: string) {
  const thursday = new Date(`${shiftDate(monday, 3)}T00:00:00Z`);
  const yearStart = new Date(`${thursday.getUTCFullYear()}-01-01T00:00:00Z`);
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function ThoughtComposer({ date, busy, save }: { date: string; busy: boolean; save: SaveWeek }) {
  const mounted = useMounted();
  const [content, setContent] = useState('');
  const [notice, setNotice] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="journal-thought-composer" role="group" aria-label="当天随想">
      <h4>
        <Sparkles size={14} aria-hidden="true" /> 当天随想
      </h4>
      <p>刚想到的，先记下来。</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const today = shanghaiDate(new Date());
          if (today !== date) {
            setNotice('日期已变化，请回到本周后再记录今天的随想。');
            return;
          }
          if (!content.trim() || busy) return;
          void save(`thought:${today}:${content}`, (state) => ({
            ...state,
            days: state.days.map((day) =>
              day.date === today
                ? {
                    ...day,
                    thoughts: [
                      ...day.thoughts,
                      { id: crypto.randomUUID(), content: content.trim(), createdAt: new Date().toISOString() },
                    ],
                  }
                : day,
            ),
          })).then((success) => {
            if (success && mounted.current) {
              setContent('');
              setNotice('已记到今天的随想');
              textarea.current?.focus();
            }
          });
        }}
      >
        <label className="sr-only" htmlFor={`thought-${date}`}>
          当天随想内容
        </label>
        <textarea
          ref={textarea}
          id={`thought-${date}`}
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            setNotice('');
          }}
          maxLength={5000}
          rows={2}
          placeholder="今天有什么想法？一句话也可以。"
          disabled={busy}
          required
          className={input}
        />
        <div className="journal-thought-actions">
          <span>支持 Markdown</span>
          <button type="submit" className={`${button} journal-button-primary`} disabled={busy || !content.trim()}>
            <Plus size={15} aria-hidden="true" /> {busy ? '正在保存…' : '记下随想'}
          </button>
        </div>
        <p role="status" aria-live="polite" className="journal-notice">
          {notice}
        </p>
      </form>
    </div>
  );
}

function JournalDayCard({
  day,
  label,
  today,
  busy,
  save,
}: {
  day: JournalDay;
  label: string;
  today: string;
  busy: boolean;
  save: SaveWeek;
}) {
  const mounted = useMounted();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(day.content);
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  return (
    <li id={`journal-day-${day.date}`} className={`journal-day ${day.date === today ? 'journal-day-today' : ''}`}>
      <div className="journal-day-heading">
        <div className="journal-day-date">
          <span className="journal-day-number" aria-hidden="true">
            {day.date.slice(8)}
          </span>
          <div>
            <h3>
              {label}
              {day.date === today && <span className="journal-today-badge">今天</span>}
            </h3>
            <time dateTime={day.date}>{day.date.slice(5).replace('-', ' / ')}</time>
          </div>
        </div>
        {!editing && (
          <button
            type="button"
            className="journal-edit-button"
            disabled={busy}
            aria-label={`${label}${day.content ? '编辑记录' : '写点记录'}`}
            onClick={() => {
              setDraft(day.content);
              setNotice('');
              setEditing(true);
            }}
          >
            <PencilLine size={14} aria-hidden="true" />
            {day.content ? '编辑记录' : '写点记录'}
          </button>
        )}
      </div>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            void save(`day:${day.date}:${draft}`, (state) => ({
              ...state,
              days: state.days.map((item) => (item.date === day.date ? { ...item, content: draft } : item)),
            })).then((success) => {
              if (success && mounted.current) {
                setEditing(false);
                setNotice('记录已保存');
              }
            });
          }}
        >
          <label className="sr-only" htmlFor={`journal-${day.date}`}>
            {label}记录内容
          </label>
          <textarea
            ref={editor}
            autoFocus
            id={`journal-${day.date}`}
            className={input}
            rows={9}
            maxLength={20000}
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="写下完成事项、学习链接、遗留问题或生活感想…"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={busy || Boolean(draft.trim())}
              className="text-xs text-zinc-500 underline underline-offset-4"
              onClick={() => {
                setDraft(JOURNAL_TEMPLATE);
                editor.current?.focus();
              }}
            >
              插入记录模板
            </button>
            <div className="flex gap-2">
              <button type="button" className={button} disabled={busy} onClick={() => setEditing(false)}>
                取消
              </button>
              <button type="submit" className={`${button} journal-button-primary`} disabled={busy}>
                {busy ? '正在保存…' : '保存记录'}
              </button>
            </div>
          </div>
        </form>
      ) : day.content.trim() ? (
        <div className="journal-markdown">
          <MarkdownBody content={day.content} />
        </div>
      ) : (
        <div className="journal-empty">
          <p>{day.date === today ? '今天，值得留下一点什么。' : '这一天，等待你的记录。'}</p>
          <span>完成事项 / 学习笔记 / 生活片段</span>
        </div>
      )}
      {day.date === today && <ThoughtComposer date={day.date} busy={busy} save={save} />}
      {day.thoughts.length > 0 && (
        <div className="journal-thoughts">
          <h4>随想 · {day.thoughts.length} 条</h4>
          <ol>
            {day.thoughts.map((thought) => (
              <li key={thought.id} className="journal-thought">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <time dateTime={thought.createdAt} className="text-xs text-zinc-400">
                    {thoughtTime(thought.createdAt)}
                  </time>
                  <button
                    type="button"
                    className="text-xs text-zinc-500 underline underline-offset-4 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => setDeleting(thought.id)}
                    aria-label={`删除${label}${thoughtTime(thought.createdAt)}的随想`}
                  >
                    删除
                  </button>
                </div>
                <div className="journal-markdown">
                  <MarkdownBody content={thought.content} />
                </div>
                {deleting === thought.id && (
                  <div className="mt-3 flex flex-wrap items-center gap-3" role="group" aria-label="确认删除随想">
                    <span className="text-xs text-zinc-500">删除这条随想？</span>
                    <button type="button" className={button} disabled={busy} onClick={() => setDeleting(null)}>
                      保留
                    </button>
                    <button
                      type="button"
                      className={button}
                      disabled={busy}
                      onClick={() => {
                        void save(`delete:${day.date}:${thought.id}`, (state) => ({
                          ...state,
                          days: state.days.map((item) =>
                            item.date === day.date
                              ? { ...item, thoughts: item.thoughts.filter((entry) => entry.id !== thought.id) }
                              : item,
                          ),
                        })).then((success) => {
                          if (success && mounted.current) {
                            setDeleting(null);
                            setNotice('随想已删除');
                          }
                        });
                      }}
                    >
                      确认删除
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      <p role="status" aria-live="polite" className="journal-notice">
        {notice}
      </p>
    </li>
  );
}
