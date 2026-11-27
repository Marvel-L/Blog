import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Flag,
  MoreHorizontal,
  Plus,
  Search,
} from 'lucide-react';
import { Seo } from '@/components/Seo';
import { downloadBlob } from '@/utils/download';
import { assetUrl } from '@/utils/siteUrl';
import { parsePlannerMarkdown, plannerToMarkdown, tasksFor } from './planner/markdown';
import {
  CATEGORIES,
  emptyPlannerState,
  monthKey,
  parsePlannerState,
  PLANNER_STORAGE_KEY,
  samePlannerData,
  taskProgress,
  type MonthlyPlannerState,
  type MonthlyTask,
} from './planner/model';
import type { PlannerSyncUser } from './planner/sync';
import { TaskEditor, type TaskFields } from './planner/TaskEditor';
import { DailyPanel } from './planner/DailyPanel';
import { guestDaily } from './planner/daily-guest';
import { dateKey } from './planner/daily-model';
import './planner/planner.css';

const PlannerSync = lazy(() => import('./planner/PlannerSync'));
const PROJECT_FILE_URL = '/planner-data/monthly-planner.md';

export const Planner = () => {
  const [state, setState] = useState<MonthlyPlannerState>(emptyPlannerState);
  const [ready, setReady] = useState(false);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [today, setToday] = useState('2026-01-01');
  const [user, setUser] = useState<PlannerSyncUser | null>(null);
  const userRef = useRef<PlannerSyncUser | null>(null);
  const [newTask, setNewTask] = useState('');
  const [message, setMessage] = useState('');
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('order');
  const [primary, setPrimary] = useState<'daily' | 'monthly'>('daily');
  const [editor, setEditor] = useState<MonthlyTask | null>(null);
  const mounted = useRef(false);
  const projectFileLoaded = useRef(false);
  const anonymousBaseline = useRef<MonthlyPlannerState | null>(null);
  const anonymousEdited = useRef(false);
  const writeGeneration = useRef(0);
  const notify = useCallback((text: string, restore?: () => void) => {
    setMessage(text);
    setUndo(restore ? () => restore : null);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(
      () => {
        setMessage('');
        setUndo(null);
      },
      undo ? 8000 : 5000,
    );
    return () => window.clearTimeout(timer);
  }, [message, undo]);
  useEffect(() => {
    mounted.current = true;
    projectFileLoaded.current = false;
    anonymousEdited.current = false;
    setReady(false);
    const controller = new AbortController();
    const now = new Date();
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth() + 1);
    setToday(dateKey(now));
    void (async () => {
      try {
        const response = await fetch(assetUrl(PROJECT_FILE_URL), {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        });
        if (!response.ok) throw new Error('项目文件读取失败');
        let projectState = parsePlannerMarkdown(await response.text());
        if (!mounted.current || controller.signal.aborted) return;
        try {
          // Static Pages cannot write its Markdown file; keep the visitor's saved edits on refresh.
          if (!import.meta.env.DEV) {
            const stored = localStorage.getItem(PLANNER_STORAGE_KEY);
            if (stored) {
              try {
                projectState = parsePlannerState(stored);
              } catch {
                notify('本机缓存格式无效，已恢复项目 Markdown。');
              }
            }
          }
          anonymousBaseline.current = projectState;
          setState(projectState);
          localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(projectState));
        } catch {
          anonymousBaseline.current = projectState;
          setState(projectState);
          notify('项目 Markdown 已读取，但浏览器缓存保存失败。');
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        anonymousBaseline.current = emptyPlannerState();
        try {
          const stored = localStorage.getItem(PLANNER_STORAGE_KEY);
          if (stored) {
            const cached = parsePlannerState(stored);
            anonymousBaseline.current = cached;
            setState(cached);
          } else anonymousBaseline.current = emptyPlannerState();
          notify(stored ? '项目 Markdown 读取失败，已使用浏览器缓存。' : '项目 Markdown 读取失败，当前使用空计划。');
        } catch {
          notify(cause instanceof Error ? cause.message : '项目 Markdown 读取失败。');
        }
      } finally {
        if (mounted.current && !controller.signal.aborted) {
          projectFileLoaded.current = true;
          setReady(true);
        }
      }
    })();
    return () => {
      mounted.current = false;
      controller.abort();
      writeGeneration.current += 1;
    };
  }, [notify]);
  useEffect(() => {
    if (!ready || !projectFileLoaded.current || userRef.current || !anonymousEdited.current) return;
    if (samePlannerData(state, anonymousBaseline.current)) return;
    let cached = false;
    try {
      localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(state));
      cached = true;
    } catch {
      notify('浏览器缓存保存失败。');
    }
    if (!import.meta.env.DEV) {
      if (cached) anonymousBaseline.current = state;
      if (cached) anonymousEdited.current = false;
      return;
    }
    const generation = ++writeGeneration.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (userRef.current) return;
      void fetch(PROJECT_FILE_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown;charset=utf-8' },
        body: plannerToMarkdown(state),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      })
        .then((response) => {
          if (!response.ok) throw new Error('项目 Markdown 写入失败');
          if (!controller.signal.aborted && mounted.current && generation === writeGeneration.current) {
            anonymousBaseline.current = state;
            anonymousEdited.current = false;
          }
        })
        .catch((cause) => {
          if (!controller.signal.aborted && mounted.current && generation === writeGeneration.current)
            notify(cause instanceof Error ? cause.message : '项目 Markdown 写入失败');
        });
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [ready, state, user, notify]);
  const applySynced = useCallback((next: MonthlyPlannerState, identity: PlannerSyncUser | null) => {
    anonymousEdited.current = false;
    if (identity?.id !== userRef.current?.id) {
      setEditor(null);
      setUndo(null);
      setMessage('');
      setQuery('');
    }
    userRef.current = identity;
    setUser(identity);
    setState(next);
  }, []);
  const key = monthKey(selectedYear, selectedMonth);
  const tasks = useMemo(() => tasksFor(state, selectedYear, selectedMonth), [state, selectedYear, selectedMonth]);
  const progress = useMemo(
    () => taskProgress(state, selectedYear, selectedMonth),
    [state, selectedYear, selectedMonth],
  );
  const completed = tasks.filter((task) => task.completed).length;
  const visible = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            (filter === 'all' || task.completed === (filter === 'done')) &&
            `${task.text} ${CATEGORIES[task.category ?? 'other']}`.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .map((task, index) => ({ task, index }))
        .sort((a, b) =>
          sort === 'priority'
            ? Number(b.task.priority === 'high') - Number(a.task.priority === 'high') || a.index - b.index
            : a.index - b.index,
        )
        .map(({ task }) => task),
    [tasks, filter, query, sort],
  );
  const updateTasks = (next: MonthlyTask[]) => {
    anonymousEdited.current = !userRef.current;
    setState((current) => {
      const result = { ...current, months: { ...current.months, [key]: next } };
      return parsePlannerState(JSON.stringify(result));
    });
  };
  const add = (fields?: TaskFields) => {
    const text = (fields?.text ?? newTask).trim();
    if (!text) return;
    if (tasks.length >= 300) throw new Error('每月最多支持 300 个目标。');
    if (!Object.hasOwn(state.months, key) && Object.keys(state.months).length >= 120)
      throw new Error('最多保存 120 个月的目标。');
    updateTasks([
      ...tasks,
      {
        id: crypto.randomUUID(),
        text,
        completed: false,
        category: fields?.category ?? 'other',
        priority: fields?.priority ?? 'normal',
      },
    ]);
    setNewTask('');
  };
  const addTask = (event: FormEvent) => {
    event.preventDefault();
    try {
      add();
    } catch (cause) {
      notify((cause as Error).message);
    }
  };
  const restore = (deleted: MonthlyTask[]) => {
    anonymousEdited.current = !userRef.current;
    setState((current) => {
      const existing = current.months[key] ?? [];
      return {
        ...current,
        months: {
          ...current.months,
          [key]: [...existing, ...deleted.filter((task) => !existing.some((entry) => entry.id === task.id))],
        },
      };
    });
  };
  const remove = (task: MonthlyTask) => {
    updateTasks(tasks.filter((entry) => entry.id !== task.id));
    setEditor(null);
    notify('已删除月度目标', () => restore([task]));
  };
  const save = (fields: TaskFields) => {
    if (editor)
      updateTasks(
        tasks.map((task) =>
          task.id === editor.id
            ? { ...task, text: fields.text, category: fields.category, priority: fields.priority }
            : task,
        ),
      );
    setEditor(null);
    notify('目标已保存');
  };
  const selectMonth = (year: number, month: number) => {
    setSelectedYear(year);
    setSelectedMonth(month);
    setEditor(null);
  };
  const shiftMonth = (offset: number) => {
    const next = selectedYear * 12 + selectedMonth - 1 + offset;
    selectMonth(Math.floor(next / 12), (next % 12) + 1);
  };
  const connect = () => window.dispatchEvent(new Event('dblog-planner-sync-open'));
  return (
    <div className="planner-page">
      <Seo
        title="Planner · 每日遗留与月度目标"
        description="按月份整理工作、学习与生活目标，记录每日遗留任务并安排处理日期。支持目标编辑、搜索、优先级排序、Markdown 导出和按账号云端自动同步。"
        url="/planner"
      />
      <div className="planner-workspace">
        <div className="planner-main">
          <section className="planner-overview" aria-label="任务完成进度">
            <div className="planner-overview-month">
              <div
                className="planner-ring"
                role="progressbar"
                aria-label="本月完成率"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress.month)}
              >
                <svg viewBox="0 0 52 52" aria-hidden="true">
                  <circle cx="26" cy="26" r="22" />
                  <circle
                    className="planner-ring-fill"
                    cx="26"
                    cy="26"
                    r="22"
                    strokeDasharray={`${progress.month * 1.3823} 138.23`}
                  />
                </svg>
                <span>{Math.round(progress.month)}%</span>
              </div>
              <div>
                <strong>
                  {completed}
                  <small> / {tasks.length}</small>
                </strong>
                <p>本月目标已完成</p>
              </div>
            </div>
            {(
              [
                ['季度完成率', `第 ${Math.ceil(selectedMonth / 3)} 季度`, progress.quarter],
                ['年度完成率', `${selectedYear} 年度`, progress.year],
              ] as const
            ).map(([label, title, value]) => (
              <div className="planner-overview-period" key={label}>
                <div>
                  <span>{title}</span>
                  <strong>{Math.round(value)}%</strong>
                </div>
                <div
                  className="planner-progress-line"
                  role="progressbar"
                  aria-label={label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(value)}
                >
                  <i style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </section>
          <div className="planner-view-switch" role="group" aria-label="主视图切换">
            <button
              aria-pressed={primary === 'daily'}
              aria-controls="planner-daily-view"
              onClick={() => setPrimary('daily')}
            >
              <CalendarDays />
              每日遗留
            </button>
            <button
              aria-pressed={primary === 'monthly'}
              aria-controls="planner-monthly-view"
              onClick={() => setPrimary('monthly')}
            >
              <Flag />
              月视图
            </button>
            <span className="planner-view-note">点选切换主视图，另一侧保留为副栏</span>
          </div>
          <div className="planner-layout" data-primary={primary}>
            {ready ? (
              <Suspense fallback={<DailyPanel daily={guestDaily} today={today} onConnect={connect} notify={notify} />}>
                <PlannerSync state={state} onApply={applySynced} user={user} today={today} notify={notify} />
              </Suspense>
            ) : (
              <DailyPanel daily={guestDaily} today={today} onConnect={connect} notify={notify} />
            )}
            <section
              id="planner-monthly-view"
              className="planner-panel planner-monthly"
              aria-labelledby="monthly-task-heading"
            >
              <h2 id="monthly-task-heading" className="sr-only">
                月度目标
              </h2>
              <header className="planner-month-toolbar">
                <div className="planner-month-nav" role="group" aria-label="月视图日期">
                  <button
                    className="planner-icon"
                    aria-label="上个月"
                    disabled={selectedYear === 1970 && selectedMonth === 1}
                    onClick={() => shiftMonth(-1)}
                  >
                    <ChevronLeft />
                  </button>
                  <input
                    type="month"
                    aria-label="选择月份"
                    min="1970-01"
                    max="9999-12"
                    value={key}
                    onChange={(event) => {
                      const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(event.target.value);
                      if (match && Number(match[1]) >= 1970) selectMonth(Number(match[1]), Number(match[2]));
                    }}
                  />
                  <button
                    className="planner-icon"
                    aria-label="下个月"
                    disabled={selectedYear === 9999 && selectedMonth === 12}
                    onClick={() => shiftMonth(1)}
                  >
                    <ChevronRight />
                  </button>
                  <button
                    className="planner-today"
                    onClick={() => selectMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)))}
                  >
                    本月
                  </button>
                </div>
              </header>
              <div className="planner-list-toolbar">
                <div className="planner-tabs" aria-label="月度目标筛选">
                  {(
                    [
                      ['all', '全部', tasks.length],
                      ['open', '未完成', tasks.length - completed],
                      ['done', '已完成', completed],
                    ] as const
                  ).map(([value, label, count]) => (
                    <button
                      key={value}
                      className={filter === value ? 'is-active' : ''}
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                      <span>{count}</span>
                    </button>
                  ))}
                </div>
                <select aria-label="目标排序" value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="order">添加顺序</option>
                  <option value="priority">优先级优先</option>
                </select>
              </div>
              <label className="planner-search">
                <Search />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="搜索月度目标"
                  placeholder="搜索这个月的目标…"
                />
              </label>
              <div className="planner-task-list">
                {visible.map((task) => (
                  <article key={task.id} className={`planner-task-row ${task.completed ? 'is-completed' : ''}`}>
                    <button
                      className="planner-check"
                      aria-label={`${task.completed ? '取消完成' : '完成'} ${task.text}`}
                      aria-pressed={task.completed}
                      onClick={() =>
                        updateTasks(
                          tasks.map((entry) =>
                            entry.id === task.id ? { ...entry, completed: !entry.completed } : entry,
                          ),
                        )
                      }
                    >
                      {task.completed && <Check />}
                    </button>
                    <div>
                      <button className="planner-task-title" onClick={() => setEditor(task)}>
                        {task.text}
                      </button>
                      <div className="planner-task-meta">
                        <span className="planner-tag">{CATEGORIES[task.category ?? 'other']}</span>
                        {task.priority === 'high' && <span className="planner-tag planner-priority">优先</span>}
                      </div>
                    </div>
                    <button
                      className="planner-icon planner-edit"
                      aria-label={`编辑 ${task.text}`}
                      onClick={() => setEditor(task)}
                    >
                      <MoreHorizontal />
                    </button>
                  </article>
                ))}
                {visible.length === 0 && (
                  <div className="planner-empty">
                    <Flag />
                    <h3>{!ready ? '正在读取计划' : tasks.length === 0 ? '这个月还没有目标' : '没有匹配的目标'}</h3>
                    <p>{tasks.length === 0 ? '在下方输入目标，回车添加。' : '试试其他关键词，或切换筛选。'}</p>
                  </div>
                )}
              </div>
              <form className="planner-quick-add" onSubmit={addTask}>
                <Plus />
                <input
                  disabled={!ready}
                  value={newTask}
                  maxLength={500}
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="输入月度目标，回车添加"
                  aria-label="新增月度待办"
                />
                <button type="submit" disabled={!ready || !newTask.trim()}>
                  添加
                </button>
              </form>
              <footer className="planner-list-footer">
                <span>{tasks.length - completed} 个目标待完成</span>
                <button
                  disabled={completed === 0}
                  onClick={() => {
                    const deleted = tasks.filter((task) => task.completed);
                    updateTasks(tasks.filter((task) => !task.completed));
                    notify('已整理完成目标', () => restore(deleted));
                  }}
                >
                  整理已完成
                </button>
              </footer>
              <footer className="planner-file-footer">
                <span>
                  <FileText />
                  {user ? '自动保存到账号' : '本机 / Markdown'}
                </span>
                <button
                  onClick={() => {
                    try {
                      downloadBlob(
                        new Blob([plannerToMarkdown(state)], { type: 'text/markdown;charset=utf-8' }),
                        'monthly-planner.md',
                      );
                    } catch {
                      notify('导出失败，请重试');
                    }
                  }}
                >
                  <Download />
                  导出 Markdown
                </button>
              </footer>
            </section>
          </div>
        </div>
      </div>
      {editor && (
        <TaskEditor
          daily={false}
          editing
          initial={{
            text: editor.text,
            note: '',
            date: today,
            category: editor.category ?? 'other',
            priority: editor.priority ?? 'normal',
          }}
          onClose={() => setEditor(null)}
          onSave={save}
          onDelete={() => remove(editor)}
        />
      )}
      {message && (
        <div className="planner-toast" role="status" aria-live="polite">
          {message}
          {undo && (
            <button
              onClick={() => {
                try {
                  undo();
                  setUndo(null);
                  setMessage('已撤销');
                } catch (cause) {
                  setMessage(cause instanceof Error ? cause.message : '撤销失败，请重试');
                }
              }}
            >
              撤销
            </button>
          )}
        </div>
      )}
    </div>
  );
};
