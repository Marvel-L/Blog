import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, FileText, Plus, Save, Trash2, Upload } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { downloadBlob } from '@/utils/download';
import { CalendarProgress, PlannerClock } from './planner/PlannerStatus';
import { parsePlannerMarkdown, plannerToMarkdown, tasksFor } from './planner/markdown';
import {
  emptyPlannerState,
  monthKey,
  parsePlannerState,
  PLANNER_STORAGE_KEY,
  type MonthlyPlannerState,
} from './planner/model';
import type { PlannerSyncUser } from './planner/sync';
import './planner/planner.css';

const PlannerSync = lazy(() => import('./planner/PlannerSync'));
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
type WritableHandle = {
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<{ write: (value: string) => Promise<void>; close: () => Promise<void> }>;
};
type PickerWindow = Window & { showOpenFilePicker?: (options: object) => Promise<WritableHandle[]> };

export const Planner = () => {
  const [state, setState] = useState<MonthlyPlannerState>(emptyPlannerState);
  const [ready, setReady] = useState(false);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [newTask, setNewTask] = useState('');
  const [message, setMessage] = useState('');
  const [fileName, setFileName] = useState('monthly-planner.md');
  const fileHandle = useRef<WritableHandle | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const importGeneration = useRef(0);
  const syncScope = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    const now = new Date();
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth() + 1);
    try {
      const stored = localStorage.getItem(PLANNER_STORAGE_KEY);
      if (stored) setState(parsePlannerState(stored));
    } catch {
      setMessage('无法读取浏览器中的计划，可重新导入 Markdown。');
    }
    setReady(true);
    return () => {
      mounted.current = false;
      importGeneration.current += 1;
    };
  }, []);
  useEffect(() => {
    if (!ready || syncScope.current) return;
    try {
      localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(state));
    } catch {
      setMessage('浏览器保存失败，请保存或导出 Markdown 备份。');
    }
  }, [ready, state]);
  const applySynced = useCallback((next: MonthlyPlannerState, user: PlannerSyncUser | null) => {
    syncScope.current = user?.id ?? null;
    setState(next);
  }, []);
  const key = monthKey(selectedYear, selectedMonth);
  const tasks = useMemo(() => tasksFor(state, selectedYear, selectedMonth), [state, selectedYear, selectedMonth]);
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
  const loadFile = async (file: File) => {
    const generation = ++importGeneration.current;
    try {
      const next = parsePlannerMarkdown(await file.text());
      if (!mounted.current || generation !== importGeneration.current) return;
      syncScope.current = null;
      setState(next);
      setFileName(file.name || 'monthly-planner.md');
      setMessage(`已载入 ${file.name}`);
    } catch (cause) {
      if (mounted.current && generation === importGeneration.current)
        setMessage(cause instanceof Error ? `导入失败：${cause.message}` : '导入失败');
    }
  };
  const openLocalFile = async () => {
    const picker = (window as PickerWindow).showOpenFilePicker;
    if (!picker) {
      importRef.current?.click();
      return;
    }
    try {
      const [handle] = await picker({
        multiple: false,
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
      });
      if (!handle) return;
      fileHandle.current = handle;
      await loadFile(await handle.getFile());
    } catch (cause) {
      if ((cause as DOMException).name !== 'AbortError') setMessage('无法打开本地 Markdown 文件。');
    }
  };
  const saveMarkdown = async () => {
    const markdown = plannerToMarkdown(state);
    try {
      if (fileHandle.current) {
        const writer = await fileHandle.current.createWritable();
        await writer.write(markdown);
        await writer.close();
        setMessage(`已写入 ${fileHandle.current.name}`);
        return;
      }
      downloadBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), fileName);
      setMessage('已下载 Markdown；重新用“打开 Markdown”选择该文件后可直接覆盖保存。');
    } catch {
      setMessage('保存 Markdown 失败，请重试。');
    }
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
          <button onClick={() => void openLocalFile()}>
            <Upload />
            打开 Markdown
          </button>
          <button onClick={() => void saveMarkdown()}>
            <Save />
            保存 Markdown
          </button>
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
          <input
            ref={importRef}
            className="sr-only"
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void loadFile(file);
            }}
          />
        </div>
      </div>
      <CalendarProgress />
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
