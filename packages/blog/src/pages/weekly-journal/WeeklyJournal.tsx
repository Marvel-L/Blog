import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHref, useSearchParams } from 'react-router-dom';
import {
  ArrowDownRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  Cloud,
  RefreshCw,
  X,
} from 'lucide-react';
import { AccountCredentials } from '@/cloud/AccountCredentials';
import { Seo } from '@/components/Seo';
import { downloadBlob } from '@/utils/download';
import { useWeeklyJournal } from './useWeeklyJournal';
import {
  WEEKDAYS,
  JOURNAL_TEMPLATE,
  emptyWeek,
  journalDocument,
  mondayOf,
  shiftDate,
  validJournalDate,
  type JournalDay,
} from './weekly-model';
import '../resume/resume.css';
import './weekly-journal.css';

const ResumeEditor = lazy(() => import('../resume/ResumeEditor'));
const statusText = {
  saved: '已保存到云端',
  pending: '待自动保存',
  saving: '正在保存…',
  error: '保存失败',
  conflict: '请核对版本冲突',
};

const button = 'journal-button';
export default function WeeklyJournal() {
  const [params, setParams] = useSearchParams();
  const rawWeek = params.get('week') ?? '';
  const selection = validJournalDate(rawWeek) ? mondayOf(rawWeek) : '';
  const journal = useWeeklyJournal(selection);
  const loginReturn = useHref('/weekly-journal');
  const { data, phase, busy, view } = journal;
  const state = view?.state ?? (data ? emptyWeek(data.weekStart) : null);
  const [navigationError, setNavigationError] = useState('');
  const [activeDay, setActiveDay] = useState<{ session: number; date: string } | null>(null);
  const commentsPending = useRef(new Set<string>());
  useEffect(() => {
    commentsPending.current.clear();
    setNavigationError('');
  }, [journal.session]);
  const selectDay = (date: string) => {
    if (activeDay?.session === journal.session && activeDay.date === date) return;
    if (commentsPending.current.size) {
      setNavigationError('请先提交或取消正在编写的留言，再切换记录。');
      return;
    }
    setNavigationError('');
    setActiveDay({ session: journal.session, date });
  };
  const pickWeek = async (date: string) => {
    if (busy || !validJournalDate(date)) return;
    if (view?.status === 'conflict') {
      setNavigationError('请先核对版本冲突，再切换周次。');
      return;
    }
    if (commentsPending.current.size) {
      setNavigationError('请先提交或取消正在编写的留言，再切换周次。');
      return;
    }
    if (!(await journal.sync())) return;
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
        description="以周一为起点，按周一到周日整理学习笔记、完成事项、遗留问题与生活记录。点击记录直接书写，内容自动保存，支持 Markdown、高亮和留言。"
        url="/weekly-journal"
        noindex
      />
      <header className="journal-heading">
        <div>
          <p className="journal-eyebrow">
            <CalendarDays size={14} aria-hidden="true" /> 每周一页
          </p>
          <h1>
            周记<span aria-hidden="true"> / </span>
            <small>Weekly Journal</small>
          </h1>
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
          <p className="journal-description mb-6 mt-2">周记仅自己可见，登录后可以查看和编辑。</p>
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
                {state.days.filter((day) => day.content.trim()).length} / 7 天有记录
              </p>
              {mondayOf(data.today) === data.weekStart && (
                <a
                  className="journal-today-link"
                  href={`#journal-day-${data.today}`}
                  onClick={() => selectDay(data.today)}
                >
                  写今天
                  <ArrowDownRight size={14} aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
          {(journal.error || navigationError) && (
            <p role="alert" className="journal-error">
              {journal.error || navigationError}
              {journal.error && (
                <button type="button" className={button} onClick={() => void journal.sync()}>
                  {view?.status === 'conflict' ? '使用当前版本' : '重试同步'}
                </button>
              )}
            </p>
          )}
          <ol className="journal-days">
            {state.days.map((day, index) => (
              <JournalDayCard
                key={`${journal.session}:${day.date}`}
                day={day}
                label={WEEKDAYS[index]}
                today={data.today}
                editing={activeDay?.session === journal.session && activeDay.date === day.date}
                onActivate={() => selectDay(day.date)}
                update={journal.update}
                status={view?.status ?? 'saved'}
                onCommentDraft={(pending) => {
                  if (pending) commentsPending.current.add(day.date);
                  else commentsPending.current.delete(day.date);
                }}
              />
            ))}
          </ol>
          <p className="journal-footer-note">以周一为起点 · 内容自动保存</p>
          <JournalSync journal={journal} />
        </>
      )}
    </section>
  );
}

function weekNumber(monday: string) {
  const thursday = new Date(`${shiftDate(monday, 3)}T00:00:00Z`);
  const yearStart = new Date(`${thursday.getUTCFullYear()}-01-01T00:00:00Z`);
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function JournalDayCard({
  day,
  label,
  today,
  editing,
  onActivate,
  update,
  status,
  onCommentDraft,
}: {
  day: JournalDay;
  label: string;
  today: string;
  editing: boolean;
  onActivate: () => void;
  update: ReturnType<typeof useWeeklyJournal>['update'];
  status: keyof typeof statusText;
  onCommentDraft: (pending: boolean) => void;
}) {
  const [mode, setMode] = useState<'edit' | 'markdown' | 'preview'>('edit');
  const [editorError, setEditorError] = useState('');
  useEffect(() => {
    if (editing) setMode('edit');
  }, [editing]);
  return (
    <li
      id={`journal-day-${day.date}`}
      aria-label={`${label}记录`}
      tabIndex={editing ? -1 : 0}
      onClick={(event) => {
        if (editing || !(event.target instanceof Element)) return;
        if (event.target.closest('a, button, input, textarea, select, .resume-comments, [data-resume-comments]'))
          return;
        onActivate();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || editing) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate();
        }
      }}
      className={`journal-day ${day.date === today ? 'journal-day-today' : ''} ${editing ? 'journal-day-editing' : ''}`}
    >
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
      </div>
      {editing && (
        <div>
          <div className="journal-editor-modes">
            <div role="group" aria-label={`${label}编辑模式`}>
              {(
                [
                  ['edit', '文档编辑'],
                  ['markdown', 'Markdown'],
                  ['preview', '预览'],
                ] as const
              ).map(([value, text]) => (
                <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>
                  {text}
                </button>
              ))}
            </div>
            <span role="status">{statusText[status]}</span>
          </div>
          {editorError && (
            <p role="alert" className="journal-error">
              {editorError}
            </p>
          )}
        </div>
      )}
      {editing || day.content.trim() || day.comments?.length ? (
        <>
          <div
            className={`journal-document-workspace resume-page ${editing ? '' : 'journal-document-preview'} ${day.comments?.length ? 'has-comments' : ''}`}
          >
            <Suspense fallback={<p role="status">正在打开编辑器…</p>}>
              <ResumeEditor
                state={journalDocument(day)}
                onChange={(value) => {
                  update((state) => ({
                    ...state,
                    days: state.days.map((item) =>
                      item.date === day.date
                        ? { ...item, content: value.markdown, comments: value.comments ?? [] }
                        : item,
                    ),
                  }));
                  setEditorError('');
                }}
                mode={editing ? mode : 'preview'}
                onModeChange={(next) => {
                  if (!editing) onActivate();
                  setMode(next);
                }}
                autoFocus={editing}
                documentLabel={`${label}记录内容`}
                commentsLabel={`${label}留言`}
                maxMarkdown={20000}
                placeholder="### 今日完成&#10;&#10;写下完成事项、学习笔记和生活感想…"
                onError={setEditorError}
                onCommentDraft={onCommentDraft}
              />
            </Suspense>
          </div>
          {editing && (
            <p className="journal-editor-hint">
              {mode === 'markdown'
                ? '高亮和留言定位随 Markdown 保存，切换文档编辑可继续批注。'
                : '直接点击正文书写；选中文字后右键，或用工具栏高亮、添加评论。'}
            </p>
          )}
          {editing && !day.content.trim() && (
            <div className="mt-3">
              <button
                type="button"
                className="text-xs text-zinc-500 underline underline-offset-4"
                onClick={() => {
                  update((state) => ({
                    ...state,
                    days: state.days.map((item) =>
                      item.date === day.date ? { ...item, content: JOURNAL_TEMPLATE } : item,
                    ),
                  }));
                }}
              >
                插入记录模板
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="journal-empty">
          <p>{day.date === today ? '今天，值得留下一点什么。' : '这一天，等待你的记录。'}</p>
          <span>完成事项 / 学习笔记 / 生活片段</span>
        </div>
      )}
    </li>
  );
}

function JournalSync({ journal }: { journal: ReturnType<typeof useWeeklyJournal> }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const orb = useRef<HTMLButtonElement>(null);
  const view = journal.view!;
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !orb.current?.contains(event.target)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        orb.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);
  return createPortal(
    <div className="resume-page resume-sync journal-sync">
      {open && (
        <div ref={panel} className="resume-sync-panel" role="region" aria-label="周记同步详情" tabIndex={-1}>
          <header>
            <strong>周记云端同步</strong>
            <button type="button" aria-label="关闭同步详情" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </header>
          <p>
            {journal.data?.user.name || journal.data?.user.login} · {statusText[view.status]}
          </p>
          <p className="resume-sync-note">修改后自动保存，本机草稿按账号和周次保留。</p>
          {view.updatedAt && (
            <p className="resume-sync-note">最近保存：{new Date(view.updatedAt).toLocaleString('zh-CN')}</p>
          )}
          {journal.error && <p role="alert">{journal.error}</p>}
          <div className="resume-sync-actions">
            {(view.status === 'error' || view.status === 'conflict') && (
              <button type="button" className={button} onClick={() => void journal.sync()}>
                {view.status === 'conflict' ? '使用当前版本' : '重试同步'}
              </button>
            )}
            <button
              type="button"
              className={button}
              disabled={view.status !== 'saved'}
              onClick={() => void journal.reload()}
            >
              刷新云端
            </button>
            <button
              type="button"
              className={button}
              onClick={() =>
                downloadBlob(
                  new Blob([JSON.stringify(view.state, null, 2)], { type: 'application/json' }),
                  `周记-${journal.data?.weekStart}.json`,
                )
              }
            >
              下载备份
            </button>
            {view.status === 'conflict' && (
              <button
                type="button"
                className={button}
                onClick={() => {
                  if (window.confirm('读取云端将替换本机草稿，请先下载需要保留的备份。继续？'))
                    void journal.reload(true);
                }}
              >
                读取云端版本
              </button>
            )}
          </div>
        </div>
      )}
      <button
        ref={orb}
        type="button"
        className={`resume-sync-orb is-${view.status}`}
        aria-label={`周记云端同步：${statusText[view.status]}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {journal.busy ? <RefreshCw size={21} aria-hidden="true" /> : <Cloud size={23} aria-hidden="true" />}
        <i />
      </button>
    </div>,
    document.body,
  );
}
