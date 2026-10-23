import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, FileText, Plus, Trash2 } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { downloadBlob } from '@/utils/download';
import { assetUrl } from '@/utils/siteUrl';
import { PlannerClock, TaskCharge } from './planner/PlannerStatus';
import { parsePlannerMarkdown, plannerToMarkdown, tasksFor } from './planner/markdown';
import {
  emptyPlannerState,
  monthKey,
  parsePlannerState,
  PLANNER_STORAGE_KEY,
  taskProgress,
  type MonthlyPlannerState,
} from './planner/model';
import type { PlannerSyncUser } from './planner/sync';
import './planner/planner.css';

const PlannerSync = lazy(() => import('./planner/PlannerSync'));
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const PROJECT_FILE_URL = '/planner-data/monthly-planner.md';

export const Planner = () => {
  const [state, setState] = useState<MonthlyPlannerState>(emptyPlannerState);
  const [ready, setReady] = useState(false);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [newTask, setNewTask] = useState('');
  const [message, setMessage] = useState('');
  const mounted = useRef(false);
  const projectFileLoaded = useRef(false);
  const skipInitialProjectWrite = useRef(true);
  const writeGeneration = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const now = new Date();
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth() + 1);
    void (async () => {
      try {
        const response = await fetch(assetUrl(PROJECT_FILE_URL), {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        });
        if (!response.ok) throw new Error('项目文件读取失败');
        const projectState = parsePlannerMarkdown(await response.text());
        if (!mounted.current || controller.signal.aborted) return;
        setState(projectState);
        try {
          localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(projectState));
        } catch {
          setMessage('项目 Markdown 已读取，但浏览器缓存保存失败。');
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        try {
          const stored = localStorage.getItem(PLANNER_STORAGE_KEY);
          if (stored) setState(parsePlannerState(stored));
          setMessage(
            stored ? '项目 Markdown 读取失败，已使用浏览器缓存。' : '项目 Markdown 读取失败，当前使用空计划。',
          );
        } catch {
          setMessage(cause instanceof Error ? cause.message : '项目 Markdown 读取失败。');
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
  }, []);
  useEffect(() => {
    if (!ready || !projectFileLoaded.current) return;
    if (skipInitialProjectWrite.current) {
      skipInitialProjectWrite.current = false;
      return;
    }
    try {
      localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(state));
    } catch {
      setMessage('浏览器缓存保存失败。');
    }
    if (!import.meta.env.DEV) return;
    const generation = ++writeGeneration.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(PROJECT_FILE_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown;charset=utf-8' },
        body: plannerToMarkdown(state),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      })
        .then((response) => {
          if (!response.ok) throw new Error('项目 Markdown 写入失败');
          if (mounted.current && generation === writeGeneration.current)
            setMessage('已写入项目文件 planner-data/monthly-planner.md');
        })
        .catch((cause) => {
          if (controller.signal.aborted || !mounted.current || generation !== writeGeneration.current) return;
          setMessage(cause instanceof Error ? cause.message : '项目 Markdown 写入失败');
        });
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [ready, state]);
  const applySynced = useCallback((next: MonthlyPlannerState, _user: PlannerSyncUser | null) => {
    setState(next);
  }, []);
  const key = monthKey(selectedYear, selectedMonth);
  const tasks = useMemo(() => tasksFor(state, selectedYear, selectedMonth), [state, selectedYear, selectedMonth]);
  const progress = useMemo(
    () => taskProgress(state, selectedYear, selectedMonth),
    [state, selectedYear, selectedMonth],
  );
  const completed = tasks.filter((task) => task.completed).length;
  const updateTasks = (next: typeof tasks) =>
    setState((current) => ({ ...current, months: { ...current.months, [key]: next } }));
  const addTask = (event: React.FormEvent) => {
    event.preventDefault();
    const text = newTask.trim();
    if (!text) return;
    if (tasks.length >= 300) {
      setMessage('每月最多支持 300 个待办事项。');
      return;
    }
    updateTasks([...tasks, { id: crypto.randomUUID(), text, completed: false }]);
    setNewTask('');
  };
  return (
    <div className="planner-page">
      <Seo
        title="Monthly Planner · 月度规划"
        description="支持本地 Markdown 文件、GitHub Pages 与登录云端自动同步的月度规划模板，可按年份和月份管理、完成与删除待办事项。"
        url="/planner"
      />
      <header className="planner-hero">
        <div>
          <p className="planner-kicker">TWELVE MONTHS / ONE CLEAR VIEW</p>
          <h1>
            Monthly
            <br />
            <em>Planner</em>
          </h1>
          <p>把一年拆成十二个可完成的月份。</p>
        </div>
        <PlannerClock />
      </header>
      <div className="planner-toolbar">
        <div className="planner-year-switch" aria-label="选择年份">
          <button aria-label="上一年" onClick={() => setSelectedYear((year) => Math.max(1970, year - 1))}>
            <ChevronLeft />
          </button>
          <label>
            <span>YEAR</span>
            <input
              type="number"
              min="1970"
              max="9999"
              value={selectedYear}
              onChange={(event) => setSelectedYear(Math.max(1970, Math.min(9999, Number(event.target.value) || 1970)))}
            />
          </label>
          <button aria-label="下一年" onClick={() => setSelectedYear((year) => Math.min(9999, year + 1))}>
            <ChevronRight />
          </button>
        </div>
        <div className="planner-file-actions">
          <span className="planner-project-file">
            <FileText aria-hidden="true" />
            planner-data/monthly-planner.md
          </span>
          <button
            onClick={() => {
              downloadBlob(
                new Blob([plannerToMarkdown(state)], { type: 'text/markdown;charset=utf-8' }),
                'monthly-planner.md',
              );
            }}
          >
            <Download />
            导出副本
          </button>
        </div>
      </div>
      <TaskCharge progress={progress} />
      {ready && (
        <Suspense fallback={<p className="planner-sync-loading">正在加载同步状态…</p>}>
          <PlannerSync state={state} onApply={applySynced} />
        </Suspense>
      )}
      <nav className="planner-months" aria-label={`${selectedYear} 年月份`}>
        {MONTHS.map((month, index) => {
          const count = tasksFor(state, selectedYear, index + 1).filter((task) => !task.completed).length;
          return (
            <button
              key={month}
              className={selectedMonth === index + 1 ? 'is-active' : ''}
              aria-current={selectedMonth === index + 1 ? 'date' : undefined}
              onClick={() => setSelectedMonth(index + 1)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{month}</strong>
              {count > 0 && <i>{count}</i>}
            </button>
          );
        })}
      </nav>
      <section className="planner-tasks" aria-labelledby="monthly-task-heading">
        <header>
          <div>
            <p>
              {selectedYear} / {String(selectedMonth).padStart(2, '0')}
            </p>
            <h2 id="monthly-task-heading">Monthly Task</h2>
          </div>
          <span>
            {completed} / {tasks.length} DONE
          </span>
        </header>
        <form onSubmit={addTask}>
          <input
            value={newTask}
            maxLength={500}
            onChange={(event) => setNewTask(event.target.value)}
            placeholder="写下本月待办事项"
            aria-label="新增月度待办"
          />
          <button type="submit">
            <Plus />
            新增
          </button>
        </form>
        <div className="planner-task-list">
          {tasks.map((task, index) => (
            <article key={task.id} className={task.completed ? 'is-completed' : ''}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <button
                className="planner-check"
                aria-label={`${task.completed ? '取消完成' : '完成'} ${task.text}`}
                aria-pressed={task.completed}
                onClick={() =>
                  updateTasks(
                    tasks.map((entry) => (entry.id === task.id ? { ...entry, completed: !entry.completed } : entry)),
                  )
                }
              >
                {task.completed && <Check />}
              </button>
              <p>{task.text}</p>
              <button
                className="planner-delete"
                aria-label={`删除 ${task.text}`}
                onClick={() => updateTasks(tasks.filter((entry) => entry.id !== task.id))}
              >
                <Trash2 />
              </button>
            </article>
          ))}
          {tasks.length === 0 && (
            <div className="planner-empty">
              <FileText />
              <strong>这个月还没有待办</strong>
              <span>从上方输入一件真正想完成的事。</span>
            </div>
          )}
        </div>
      </section>
      {message && (
        <p className="planner-toast" role="status">
          {message}
          <button aria-label="关闭提示" onClick={() => setMessage('')}>
            ×
          </button>
        </p>
      )}
    </div>
  );
};
