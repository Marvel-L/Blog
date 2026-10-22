import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Download,
  LayoutDashboard,
  Plus,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { Seo } from '@/components/Seo';
import { downloadBlob } from '@/utils/download';
import { TrendChart } from './trend/TrendChart';
import {
  STORAGE_KEY,
  METRICS,
  NUTRITION_METRICS,
  axisLabel,
  createCategory,
  defaultState,
  emptyItem,
  formatNumber,
  getPoints,
  metricValue,
  parseState,
  type Metric,
  type TrendCategory,
  type TrendItem,
  type TrendState,
} from './trend/model';
import type { SyncUser } from './trend/sync';
import './trend/trend.css';

const TrendSync = lazy(() => import('./trend/TrendSync'));

const NumberField = ({
  value,
  label,
  onCommit,
  min,
}: {
  value: number;
  label: string;
  onCommit: (value: number) => void;
  min?: number;
}) => {
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(String(value));
    setInvalid(false);
  }, [value]);
  const commit = () => {
    const number = Number(draft);
    if (!draft.trim() || !Number.isFinite(number) || (min !== undefined && number < min)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onCommit(number);
  };
  return (
    <span className="trend-number-field">
      <input
        type="number"
        step="any"
        min={min}
        value={draft}
        aria-label={label}
        aria-invalid={invalid}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      {invalid && (
        <span role="alert" className="trend-field-error">
          {min !== undefined ? `请输入 ≥ ${min} 的数值` : '请输入有效数值'}
        </span>
      )}
    </span>
  );
};

export const Trend = () => {
  const [state, setState] = useState(defaultState);
  const [storageReady, setStorageReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState('配置保存在当前浏览器');
  const [message, setMessage] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryKind, setCategoryKind] = useState<TrendCategory['kind']>('custom');
  const [deletingCategory, setDeletingCategory] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  const skipInitialSave = useRef(true);
  const mounted = useRef(false);
  const importGeneration = useRef(0);
  const syncScope = useRef<string | null>(null);
  const applySyncedState = useCallback((next: TrendState, user: SyncUser | null) => {
    syncScope.current = user?.id ?? null;
    importGeneration.current += 1;
    setState(next);
    setDeletingCategory(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (!initialized.current) {
      initialized.current = true;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) setState(parseState(stored));
      } catch {
        setMessage('无法读取已保存的配置，当前显示示例。你可以导入备份或重新编辑。');
      }
      setStorageReady(true);
    }
    return () => {
      mounted.current = false;
      importGeneration.current += 1;
    };
  }, []);
  useEffect(() => {
    if (!storageReady || syncScope.current) return;
    if (skipInitialSave.current) {
      skipInitialSave.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStorageStatus('已保存到当前浏览器');
    } catch {
      setStorageStatus('浏览器保存失败，请导出 JSON 备份');
    }
  }, [state, storageReady]);

  const category = state.categories.find((entry) => entry.id === state.selectedId) ?? state.categories[0];
  const points = useMemo(() => getPoints(category), [category]);
  const exceeded = points.filter((point) => point.exceeded).length;
  const previewCategories = state.categories.filter((entry) => entry.onDashboard && entry.id !== category.id);
  const updateCategory = (patch: Partial<TrendCategory>) => {
    importGeneration.current += 1;
    setState((current) => ({
      ...current,
      categories: current.categories.map((entry) => (entry.id === category.id ? { ...entry, ...patch } : entry)),
    }));
  };
  const updateItem = (id: string, patch: Partial<TrendItem>) =>
    updateCategory({ items: category.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  const selectCategory = (id: string) => {
    importGeneration.current += 1;
    setState((current) => ({ ...current, selectedId: id }));
    setDeletingCategory(false);
    setMessage('');
  };
  const addCategory = (event: React.FormEvent) => {
    event.preventDefault();
    if (!categoryName.trim()) {
      setMessage('请填写类别名称。');
      return;
    }
    if (state.categories.length >= 50) {
      setMessage('最多支持 50 个类别。');
      return;
    }
    const id = crypto.randomUUID();
    const entry = createCategory(id, categoryName.trim(), categoryKind);
    importGeneration.current += 1;
    setState((current) => ({ ...current, categories: [...current.categories, entry], selectedId: id }));
    setCategoryName('');
    setAddingCategory(false);
    setDeletingCategory(false);
    setMessage('类别已添加，可以设置坐标并添加条目。');
  };
  const removeCategory = () => {
    if (state.categories.length === 1) {
      setMessage('请至少保留一个类别。');
      return;
    }
    importGeneration.current += 1;
    setState((current) => {
      const categories = current.categories.filter((entry) => entry.id !== category.id);
      return { ...current, categories, selectedId: categories[0].id };
    });
    setDeletingCategory(false);
    setMessage('类别已删除。');
  };
  const exportData = () => {
    try {
      downloadBlob(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), 'trend-dashboard.json');
      setMessage('已导出类别、条目与图表配置。');
    } catch {
      setMessage('导出失败，请重试。');
    }
  };
  const importData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const generation = ++importGeneration.current;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('文件不能超过 2MB。');
      const imported = parseState(await file.text());
      if (!mounted.current || generation !== importGeneration.current) return;
      setState(imported);
      setDeletingCategory(false);
      setMessage('已导入配置，并替换当前 dashboard。');
    } catch (error) {
      if (mounted.current && generation === importGeneration.current) {
        setMessage(error instanceof Error ? `导入失败：${error.message}` : '导入失败，请检查文件。');
      }
    }
  };

  return (
    <div className="trend-page">
      <Seo
        title="Trend · 数据趋势"
        description="配置类别与条目，用折线图比较零食价格、单位热量性价比与自定义数据。支持阈值颜色渐变、垂直蚂蚁线、本地保存、云端自动同步与 JSON 导入导出。"
        url="/trend"
      />
      <header className="trend-page-header">
        <div>
          <p className="trend-eyebrow">
            <span /> EVERYDAY DATA / 日常数据
          </p>
          <h1>
            Trend<span className="trend-title-dot">.</span>
          </h1>
          <p className="trend-intro">把日常选择，放在同一张图上。</p>
        </div>
        <div className="trend-header-actions">
          <button className="trend-button" onClick={() => importRef.current?.click()}>
            <Upload size={15} />
            导入 JSON
          </button>
          <button className="trend-button" onClick={exportData}>
            <Download size={15} />
            导出 JSON
          </button>
          <input
            ref={importRef}
            className="sr-only"
            type="file"
            accept=".json,application/json"
            aria-label="导入 Trend 配置文件"
            onChange={importData}
          />
        </div>
      </header>
      {storageReady && (
        <Suspense fallback={<p className="trend-sync-note">正在加载同步功能…</p>}>
          <TrendSync state={state} onApply={applySyncedState} />
        </Suspense>
      )}
      <div className="trend-workspace">
        <aside className="trend-sidebar" aria-label="Trend 类别">
          <div className="trend-sidebar-heading">
            <LayoutDashboard size={16} />
            <span>Dashboard</span>
            <span className="trend-count">{state.categories.length}</span>
          </div>
          <p className="trend-section-label">我的类别</p>
          <div className="trend-category-list">
            {state.categories.map((entry) => (
              <button
                key={entry.id}
                className={`trend-category ${entry.id === category.id ? 'is-active' : ''}`}
                aria-pressed={entry.id === category.id}
                onClick={() => selectCategory(entry.id)}
              >
                <TrendingUp size={16} />
                <span>
                  <strong>{entry.name}</strong>
                  <small>
                    {entry.items.length} 个条目 · {entry.kind === 'nutrition' ? '热量与价格' : '自定义坐标'}
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
          <button
            className="trend-add-category"
            onClick={() => setAddingCategory((open) => !open)}
            aria-expanded={addingCategory}
          >
            <Plus size={16} />
            添加类别
          </button>
          {addingCategory && (
            <form className="trend-category-form" onSubmit={addCategory}>
              <label>
                类别名称
                <input
                  autoFocus
                  value={categoryName}
                  maxLength={80}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="例如：咖啡性价比"
                  required
                />
              </label>
              <label>
                数据类型
                <select
                  value={categoryKind}
                  onChange={(event) => setCategoryKind(event.target.value as TrendCategory['kind'])}
                >
                  <option value="custom">自定义 X / Y</option>
                  <option value="nutrition">食品热量与价格</option>
                </select>
              </label>
              <div className="trend-inline-actions">
                <button className="trend-button trend-button-primary" type="submit">
                  创建类别
                </button>
                <button className="trend-button" type="button" onClick={() => setAddingCategory(false)}>
                  取消
                </button>
              </div>
            </form>
          )}
          <div className="trend-sidebar-note">
            <span className="trend-note-icon">
              <SlidersHorizontal size={17} />
            </span>
            <p>由你定义比较方式</p>
            <small>
              选择坐标、调整阈值，
              <br />
              让每一项数据都有参照。
            </small>
          </div>
        </aside>
        <div className="trend-main">
          <div className="trend-dashboard-heading">
            <div>
              <p className="trend-section-label">OVERVIEW / 数据概览</p>
              <h2>{category.name}</h2>
            </div>
            <button
              className={`trend-pin ${category.onDashboard ? 'is-pinned' : ''}`}
              aria-pressed={category.onDashboard}
              onClick={() => updateCategory({ onDashboard: !category.onDashboard })}
            >
              {category.onDashboard ? <Check size={14} /> : <Plus size={14} />}
              {category.onDashboard ? '已加入 dashboard' : '加入 dashboard'}
            </button>
          </div>
          <div className="trend-summary">
            <div>
              <span>比较条目</span>
              <strong>
                {points.length}
                <small> items</small>
              </strong>
              <p>
                {points.length !== category.items.length
                  ? `${category.items.length - points.length} 项待补全名称或有效数值`
                  : '每个条目对应一个数据点'}
              </p>
            </div>
            <div>
              <span>阈值内</span>
              <strong>
                {category.threshold.enabled ? points.length - exceeded : '—'}
                <small> items</small>
              </strong>
              <p>{category.threshold.enabled ? '颜色随接近阈值的程度变化' : '开启阈值后显示'}</p>
            </div>
            <div>
              <span>超出阈值</span>
              <strong className={exceeded ? 'trend-exceeded-text' : ''}>
                {category.threshold.enabled ? exceeded : '—'}
                <small> items</small>
              </strong>
              <p>
                {category.threshold.enabled
                  ? `${category.threshold.direction === 'above' ? '上限' : '下限'} ${formatNumber(category.threshold.value)} · ${category.threshold.axis.toUpperCase()} 轴`
                  : '当前未启用阈值'}
              </p>
            </div>
          </div>
          <section className="trend-chart-card" aria-label="趋势 dashboard">
            <div className="trend-card-heading">
              <div>
                <span className="trend-chart-icon">
                  <TrendingUp size={18} />
                </span>
                <h3>条目趋势</h3>
              </div>
              <span className="trend-live">
                <span />
                随配置更新
              </span>
            </div>
            <TrendChart key={category.id} category={category} />
            <div className="trend-legend">
              <span>阈值内</span>
              <span className="trend-gradient" />
              <span>绿 → 蓝 → 紫 → 橙 → 红</span>
              <span className="trend-legend-divider" />
              <span>越界</span>
              <span className="trend-gradient trend-gradient-red" />
              <span>淡红 → 深红</span>
            </div>
          </section>

          <section className="trend-settings" aria-label="类别与图表配置">
            <div className="trend-card-heading">
              <div>
                <SlidersHorizontal size={17} />
                <h3>类别与坐标</h3>
              </div>
              <span>修改后自动更新</span>
            </div>
            <div className="trend-settings-grid">
              <label>
                类别名称
                <input
                  value={category.name}
                  maxLength={80}
                  onChange={(event) => {
                    if (event.target.value.trim()) updateCategory({ name: event.target.value });
                  }}
                />
              </label>
              <label>
                横坐标 X
                {category.kind === 'nutrition' ? (
                  <select
                    value={category.xMetric}
                    onChange={(event) => updateCategory({ xMetric: event.target.value as Metric })}
                  >
                    {NUTRITION_METRICS.map((metric) => (
                      <option key={metric} value={metric}>
                        {METRICS[metric].label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={category.xLabel}
                    maxLength={80}
                    placeholder="例如：价格（元）"
                    onChange={(event) => updateCategory({ xLabel: event.target.value })}
                  />
                )}
              </label>
              <label>
                纵坐标 Y
                {category.kind === 'nutrition' ? (
                  <select
                    value={category.yMetric}
                    onChange={(event) => updateCategory({ yMetric: event.target.value as Metric })}
                  >
                    {NUTRITION_METRICS.map((metric) => (
                      <option key={metric} value={metric}>
                        {METRICS[metric].label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={category.yLabel}
                    maxLength={80}
                    placeholder="例如：热量（kcal）"
                    onChange={(event) => updateCategory({ yLabel: event.target.value })}
                  />
                )}
              </label>
            </div>
            <div className="trend-threshold-settings">
              <label className="trend-checkbox">
                <input
                  type="checkbox"
                  checked={category.threshold.enabled}
                  onChange={(event) =>
                    updateCategory({ threshold: { ...category.threshold, enabled: event.target.checked } })
                  }
                />
                启用阈值
              </label>
              <label>
                参照轴
                <select
                  value={category.threshold.axis}
                  disabled={!category.threshold.enabled}
                  onChange={(event) =>
                    updateCategory({ threshold: { ...category.threshold, axis: event.target.value as 'x' | 'y' } })
                  }
                >
                  <option value="y">纵坐标 Y</option>
                  <option value="x">横坐标 X</option>
                </select>
              </label>
              <label>
                超出条件
                <select
                  value={category.threshold.direction}
                  disabled={!category.threshold.enabled}
                  onChange={(event) =>
                    updateCategory({
                      threshold: { ...category.threshold, direction: event.target.value as 'above' | 'below' },
                    })
                  }
                >
                  <option value="above">高于上限</option>
                  <option value="below">低于下限</option>
                </select>
              </label>
              <label>
                阈值数值
                <NumberField
                  key={`${category.id}-${category.threshold.axis}`}
                  value={category.threshold.value}
                  label="阈值数值"
                  onCommit={(value) => updateCategory({ threshold: { ...category.threshold, value } })}
                />
              </label>
            </div>
            <p className="trend-settings-note">
              阈值对应{axisLabel(category, category.threshold.axis)}；数值输入在离开输入框或按 Enter 后应用。
            </p>
          </section>

          <section className="trend-data-card" aria-label="条目数据">
            <div className="trend-card-heading">
              <div>
                <h3>条目数据</h3>
                <span className="trend-count">{category.items.length}</span>
              </div>
              <button
                className="trend-button trend-button-primary"
                onClick={() => {
                  if (category.items.length >= 500) {
                    setMessage('每个类别最多支持 500 个条目。');
                    return;
                  }
                  updateCategory({ items: [...category.items, emptyItem(crypto.randomUUID())] });
                }}
              >
                <Plus size={15} />
                添加条目
              </button>
            </div>
            <p className="trend-data-note">
              {category.kind === 'nutrition'
                ? '价格与重量填写同一次购买的总价、总克数；热量填写每 100g 的数值，支持千焦与 kcal。1 斤 = 500g，1 kcal = 4.184 kJ。'
                : '为每个条目输入名称与 X / Y 数值。坐标支持小数和负数，折线按 X 值排序。'}
            </p>
            <div className="trend-table-scroll">
              <table className="trend-table">
                <thead>
                  <tr>
                    <th>条目名称</th>
                    {category.kind === 'nutrition' ? (
                      <>
                        <th>购买价格 / 元</th>
                        <th>购买重量 / g</th>
                        <th>每 100g 热量</th>
                        <th>热量单位</th>
                        <th>每元热量</th>
                      </>
                    ) : (
                      <>
                        <th>{axisLabel(category, 'x')}</th>
                        <th>{axisLabel(category, 'y')}</th>
                      </>
                    )}
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {category.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          aria-label={`${item.name || '新条目'}名称`}
                          value={item.name}
                          maxLength={80}
                          placeholder="条目名称"
                          onChange={(event) => updateItem(item.id, { name: event.target.value })}
                        />
                      </td>
                      {category.kind === 'nutrition' ? (
                        <>
                          <td>
                            <NumberField
                              value={item.price}
                              min={0}
                              label={`${item.name || '新条目'}价格`}
                              onCommit={(price) => updateItem(item.id, { price })}
                            />
                          </td>
                          <td>
                            <NumberField
                              value={item.weight}
                              min={0.001}
                              label={`${item.name || '新条目'}重量`}
                              onCommit={(weight) => updateItem(item.id, { weight })}
                            />
                          </td>
                          <td>
                            <NumberField
                              value={item.energy}
                              min={0}
                              label={`${item.name || '新条目'}热量`}
                              onCommit={(energy) => updateItem(item.id, { energy })}
                            />
                          </td>
                          <td>
                            <select
                              aria-label={`${item.name || '新条目'}热量单位`}
                              value={item.energyUnit}
                              onChange={(event) =>
                                updateItem(item.id, { energyUnit: event.target.value as TrendItem['energyUnit'] })
                              }
                            >
                              <option value="kJ">kJ / 千焦</option>
                              <option value="kcal">kcal / 千卡</option>
                            </select>
                          </td>
                          <td className="trend-computed">
                            {metricValue(item, 'kcalPerYuan') === null
                              ? '—'
                              : formatNumber(metricValue(item, 'kcalPerYuan')!)}
                            <small> kcal / 元</small>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>
                            <NumberField
                              value={item.x}
                              label={`${item.name || '新条目'}横坐标`}
                              onCommit={(x) => updateItem(item.id, { x })}
                            />
                          </td>
                          <td>
                            <NumberField
                              value={item.y}
                              label={`${item.name || '新条目'}纵坐标`}
                              onCommit={(y) => updateItem(item.id, { y })}
                            />
                          </td>
                        </>
                      )}
                      <td>
                        <button
                          className="trend-delete-item"
                          aria-label={`删除${item.name || '新条目'}`}
                          onClick={() =>
                            updateCategory({ items: category.items.filter((entry) => entry.id !== item.id) })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {category.items.length === 0 && <div className="trend-empty">还没有条目，点击“添加条目”开始比较。</div>}
            </div>
            {category.id === 'snacks' && (
              <p className="trend-example-note">
                示例：鸭脖 30 元 / 斤、1300 kJ / 100g；鸭腿 5 元 / 个（130g）、600 kJ /
                100g。其余条目为演示数值，可按实际数据修改。
              </p>
            )}
          </section>
          {previewCategories.length > 0 && (
            <section className="trend-previews" aria-label="Dashboard 中的其他类别">
              <h3>Dashboard 中的其他类别</h3>
              <div>
                {previewCategories.map((entry) => (
                  <article key={entry.id} className="trend-preview">
                    <button onClick={() => selectCategory(entry.id)}>
                      <strong>{entry.name}</strong>
                      <span>
                        查看与编辑
                        <ArrowUpRight size={15} />
                      </span>
                    </button>
                    <TrendChart category={entry} compact />
                  </article>
                ))}
              </div>
            </section>
          )}
          <footer className="trend-footer">
            <span aria-live="polite">
              <Check size={13} />
              {storageStatus}
            </span>
            {state.categories.length > 1 &&
              (deletingCategory ? (
                <span className="trend-inline-actions">
                  删除此类别及全部条目？
                  <button className="trend-button trend-button-danger" onClick={removeCategory}>
                    确认删除
                  </button>
                  <button className="trend-button" onClick={() => setDeletingCategory(false)}>
                    取消
                  </button>
                </span>
              ) : (
                <button className="trend-delete-category" onClick={() => setDeletingCategory(true)}>
                  <Trash2 size={13} />
                  删除当前类别
                </button>
              ))}
          </footer>
        </div>
      </div>
      {message && (
        <p className="trend-message" role="status">
          {message}
          <button aria-label="关闭提示" onClick={() => setMessage('')} className="ml-3 px-1 text-base">
            ×
          </button>
        </p>
      )}
    </div>
  );
};
