import { BatteryMedium } from 'lucide-react';
import type { TaskProgress } from './model';

const clampSegments = (value: number) => Math.max(0, Math.min(10, Math.round(value / 10)));

function BatteryProgress({ label, value }: { label: string; value: number }) {
  const rounded = Math.round(value);
  const segments = clampSegments(value);
  return (
    <div className="planner-progress-item">
      <div className="planner-progress-label">
        <span>{label}</span>
        <strong>{rounded}%</strong>
      </div>
      <div
        className="planner-battery"
        role="progressbar"
        aria-label={`${label}任务完成率`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
      >
        <div className="planner-battery-cells" aria-hidden="true">
          {Array.from({ length: 10 }, (_, index) => (
            <i key={index} className={index < segments ? 'is-filled' : ''} />
          ))}
        </div>
        <span aria-hidden="true" />
      </div>
    </div>
  );
}

export function TaskCharge({ progress }: { progress: TaskProgress }) {
  return (
    <section className="planner-progress" aria-label="任务完成进度">
      <header>
        <BatteryMedium aria-hidden="true" />
        <div>
          <strong>Task charge</strong>
          <span>根据已完成待办 / 全部待办计算；无任务为 0%</span>
        </div>
      </header>
      <div className="planner-progress-grid">
        <BatteryProgress label="YEAR" value={progress.year} />
        <BatteryProgress label="MONTH" value={progress.month} />
        <BatteryProgress label="QUARTER" value={progress.quarter} />
      </div>
    </section>
  );
}
