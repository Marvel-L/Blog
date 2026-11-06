import { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, LockKeyhole, Plus, Sun, Sunrise } from 'lucide-react';
import { dailyTasksFor, shiftDate, validDate, type DailyTask } from './daily-model';
import { TaskEditor, type TaskFields } from './TaskEditor';
import type { useDailyPlanner } from './useDailyPlanner';

export function DailyPanel({
  daily,
  today,
  onConnect,
  notify,
}: {
  daily: ReturnType<typeof useDailyPlanner>;
  today: string;
  onConnect: () => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const [dayOverride, setDay] = useState('');
  const day = dayOverride || today;
  const [filter, setFilter] = useState<'open' | 'recorded' | 'done'>('open');
  const [editor, setEditor] = useState<DailyTask | 'new' | null>(null);
  const tasks = useMemo(
    () =>
      dailyTasksFor(daily.state, day, filter).sort(
        (a, b) => Number(b.priority === 'high') - Number(a.priority === 'high') || a.date.localeCompare(b.date),
      ),
    [daily.state, day, filter],
  );
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftDate(day, index - 3)), [day]);
  const update = (task: DailyTask) =>
    daily.edit({ ...daily.state, tasks: daily.state.tasks.map((entry) => (entry.id === task.id ? task : entry)) });
  const remove = (task: DailyTask) => {
    daily.edit({ ...daily.state, tasks: daily.state.tasks.filter((entry) => entry.id !== task.id) });
    setEditor(null);
    notify('已删除遗留任务', () => daily.restore(task));
  };
  const save = (fields: TaskFields) => {
    const old = editor === 'new' ? null : editor;
    const task: DailyTask = {
      id: old?.id ?? crypto.randomUUID(),
      text: fields.text,
      date: fields.date,
      note: fields.note,
      priority: fields.priority,
      scheduledFor: old?.scheduledFor && old.scheduledFor >= fields.date ? old.scheduledFor : null,
      completedOn: old?.completedOn && old.completedOn >= fields.date ? old.completedOn : null,
    };
    if (old) update(task);
    else {
      if (daily.state.tasks.length >= 1000) throw new Error('最多保留 1000 条遗留记录，请先整理旧记录。');
      daily.edit({ ...daily.state, tasks: [...daily.state.tasks, task] });
    }
    setEditor(null);
    setDay(fields.date);
    notify('遗留任务已记录');
  };
  const ready = !!daily.view.user;
  return (
    <section className="planner-panel planner-daily" aria-labelledby="daily-heading">
      <header className="planner-panel-head">
        <div>
          <h2 id="daily-heading">
            <CalendarDays />
            每日遗留
          </h2>
          <p>给没做完的事，一个安放的位置</p>
        </div>
        <span className="planner-private">
          <LockKeyhole />
          仅自己可见
        </span>
      </header>
      <div className="planner-day-nav">
        <button className="planner-icon" aria-label="前一天" onClick={() => setDay(shiftDate(day, -1))}>
          <ChevronLeft />
        </button>
        <input
          aria-label="查看遗留日期"
          type="date"
          min="1970-01-01"
          max="9999-12-31"
          value={day}
          onChange={(e) => {
            if (validDate(e.target.value)) setDay(e.target.value);
          }}
        />
        <button className="planner-icon" aria-label="后一天" onClick={() => setDay(shiftDate(day, 1))}>
          <ChevronRight />
        </button>
        <button className="planner-today" onClick={() => setDay(today)}>
          今天
        </button>
      </div>
      <nav className="planner-week" aria-label="一周日期">
        {days.map((date, index) => (
          <button
            key={`${date}-${index}`}
            aria-label={`查看 ${date}`}
            aria-current={date === day ? 'date' : undefined}
            className={date === day ? 'is-active' : ''}
            onClick={() => setDay(date)}
          >
            <span>{['日', '一', '二', '三', '四', '五', '六'][new Date(`${date}T12:00:00`).getDay()]}</span>
            <strong>{date.slice(8)}</strong>
            <i className={daily.state.tasks.some((task) => task.date === date) ? 'has-record' : ''} />
          </button>
        ))}
      </nav>
      <div className="planner-tabs planner-daily-tabs" aria-label="遗留筛选">
        {(
          [
            ['open', '待处理'],
            ['recorded', '当日记录'],
            ['done', '已完成'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={filter === key}
            className={filter === key ? 'is-active' : ''}
            onClick={() => setFilter(key)}
          >
            {label}
            <span>{ready ? dailyTasksFor(daily.state, day, key).length : '—'}</span>
          </button>
        ))}
      </div>
      {!ready ? (
        <div className="planner-empty">
          <LockKeyhole />
          <h3>{daily.view.connecting ? '正在读取你的记录' : '留一点空间给明天'}</h3>
          <p>{daily.view.error || '登录并连接云端后，可以记录自己的每日遗留任务。'}</p>
          <button className="planner-button planner-soft" onClick={onConnect}>
            连接账号
          </button>
        </div>
      ) : (
        <div className="planner-daily-list">
          {tasks.map((task) => (
            <article className={`planner-daily-item ${task.completedOn ? 'is-completed' : ''}`} key={task.id}>
              <div className="planner-daily-title">
                <button className="planner-task-title" onClick={() => setEditor(task)}>
                  {task.text}
                </button>
                {task.priority === 'high' && <span className="planner-tag planner-priority">优先</span>}
              </div>
              {task.note && <p>{task.note}</p>}
              <div className="planner-task-meta">
                <span>{task.date === day ? '当日记录' : `遗留自 ${task.date.slice(5)}`}</span>
                {task.scheduledFor && <span className="planner-scheduled">安排于 {task.scheduledFor.slice(5)}</span>}
                {task.completedOn && <span>{task.completedOn.slice(5)} 完成</span>}
              </div>
              <div className="planner-daily-actions">
                {!task.completedOn && (
                  <div>
                    <button
                      disabled={today < task.date}
                      onClick={() => {
                        update({ ...task, scheduledFor: today });
                        notify('已安排今天处理');
                      }}
                    >
                      <Sun />
                      今天
                    </button>
                    <button
                      disabled={shiftDate(today, 1) < task.date}
                      onClick={() => {
                        update({ ...task, scheduledFor: shiftDate(today, 1) });
                        notify('已安排明天处理');
                      }}
                    >
                      <Sunrise />
                      明天
                    </button>
                  </div>
                )}
                <button
                  className="planner-complete-action"
                  onClick={() => update({ ...task, completedOn: task.completedOn ? null : day })}
                >
                  <Check />
                  {task.completedOn ? '撤销完成' : '完成'}
                </button>
              </div>
            </article>
          ))}
          {tasks.length === 0 && (
            <div className="planner-empty">
              <CalendarDays />
              <h3>{filter === 'open' ? '这一天，轻装前行' : '还没有相关记录'}</h3>
              <p>
                {filter === 'open'
                  ? '没有待处理的遗留任务，也可以主动记录需要跟进的事。'
                  : '切换日期或筛选查看其他记录。'}
              </p>
            </div>
          )}
        </div>
      )}
      <button className="planner-record" disabled={!ready} onClick={() => setEditor('new')}>
        <Plus />
        记录一条遗留
      </button>
      <p className="planner-daily-note">未完成的记录会跨日保留，完成后可按日期回看。</p>
      {ready && editor && (
        <TaskEditor
          daily
          editing={editor !== 'new'}
          initial={
            editor === 'new'
              ? { text: '', note: '', date: day, category: 'other', priority: 'normal' }
              : { ...editor, category: 'other' }
          }
          onClose={() => setEditor(null)}
          onSave={save}
          onDelete={editor !== 'new' ? () => remove(editor) : undefined}
        />
      )}
    </section>
  );
}
