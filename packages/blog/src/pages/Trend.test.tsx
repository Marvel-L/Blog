import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Trend } from './Trend';
import { STORAGE_KEY, createCategory, defaultState, emptyItem, parseState } from './trend/model';

vi.mock('@/components/Seo', () => ({ Seo: () => null }));
vi.mock('@/utils/download', () => ({ downloadBlob: vi.fn() }));

describe('Trend 页面', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('展示零食示例、一个条目一个点，蚂蚁线颜色与点相同', () => {
    const { container } = render(<Trend />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Trend.');
    expect(screen.getByLabelText('鸭脖价格')).toHaveValue(30);
    expect(screen.getByLabelText('鸭脖重量')).toHaveValue(500);
    expect(screen.getByLabelText('鸭腿重量')).toHaveValue(130);
    const chart = screen.getByRole('figure', { name: /零食.*折线图/ });
    expect(chart.querySelectorAll('[data-trend-item]')).toHaveLength(6);
    expect(chart.querySelectorAll('.trend-ant-line')).toHaveLength(6);
    for (const point of container.querySelectorAll('[data-trend-item]')) {
      expect(point.querySelector('.trend-ant-line')?.getAttribute('stroke')).toBe(
        point.querySelectorAll('circle')[1].getAttribute('fill'),
      );
    }
    expect(chart.querySelector('[data-trend-item="duck-neck"]')).toHaveAttribute('data-exceeded', 'true');
  });

  it('悬停数据点显示数值，键盘可选中并用 Escape 清除选择', async () => {
    const user = userEvent.setup();
    render(<Trend />);
    const chart = screen.getByRole('figure', { name: /零食.*折线图/ });
    const neck = within(chart).getByRole('button', { name: /鸭脖：/ });
    await user.hover(neck);
    expect(chart.querySelector('figcaption')).toHaveTextContent('鸭脖');
    expect(chart.querySelector('figcaption')).toHaveTextContent('超出阈值');
    await user.click(neck);
    await user.keyboard('{Enter}');
    expect(neck).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Escape}');
    expect(neck).toHaveAttribute('aria-pressed', 'false');
    expect(chart.querySelector('figcaption')).toHaveTextContent('悬停、点击或用 Tab');
  });

  it('切换坐标与阈值后更新越界状态，并恢复本地配置', async () => {
    const user = userEvent.setup();
    const view = render(
      <StrictMode>
        <Trend />
      </StrictMode>,
    );
    await user.selectOptions(screen.getByLabelText('纵坐标 Y'), 'kcal100g');
    const threshold = screen.getByLabelText('阈值数值');
    await user.clear(threshold);
    await user.type(threshold, '350');
    await user.tab();
    expect(view.container.querySelector('[data-trend-item="duck-neck"]')).toHaveAttribute('data-exceeded', 'false');
    expect(view.container.querySelector('[data-trend-item="chips"]')).toHaveAttribute('data-exceeded', 'true');
    const saved = parseState(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.categories[0].yMetric).toBe('kcal100g');
    expect(saved.categories[0].threshold.value).toBe(350);
    view.unmount();
    render(
      <StrictMode>
        <Trend />
      </StrictMode>,
    );
    expect(screen.getByLabelText('纵坐标 Y')).toHaveValue('kcal100g');
    expect(screen.getByLabelText('阈值数值')).toHaveValue(350);
  });

  it('添加自定义类别、设置坐标、输入负值条目、加入 dashboard 并删除', async () => {
    const user = userEvent.setup();
    const { container } = render(<Trend />);
    await user.click(screen.getByRole('button', { name: '添加类别' }));
    await user.type(screen.getAllByLabelText('类别名称')[0], '咖啡比较');
    await user.click(screen.getByRole('button', { name: '创建类别' }));
    await user.type(screen.getByLabelText('横坐标 X'), '价格（元）');
    await user.type(screen.getByLabelText('纵坐标 Y'), '评分');
    await user.click(screen.getByRole('button', { name: '添加条目' }));
    await user.type(screen.getByLabelText('新条目名称'), '冷萃');
    fireEvent.change(screen.getByLabelText('冷萃横坐标'), { target: { value: '-2' } });
    fireEvent.blur(screen.getByLabelText('冷萃横坐标'));
    fireEvent.change(screen.getByLabelText('冷萃纵坐标'), { target: { value: '80' } });
    fireEvent.blur(screen.getByLabelText('冷萃纵坐标'));
    const chart = screen.getByRole('figure', { name: '咖啡比较折线图' });
    expect(within(chart).getByRole('button', { name: /冷萃：横坐标 -2，纵坐标 80/ })).toBeInTheDocument();
    expect(chart.querySelectorAll('.trend-ant-line')).toHaveLength(1);
    expect(container.querySelectorAll('svg')).not.toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /零食.*6 个条目/ }));
    expect(screen.getByRole('region', { name: 'Dashboard 中的其他类别' })).toHaveTextContent('咖啡比较');
    await user.click(screen.getByRole('button', { name: /咖啡比较.*1 个条目/ }));
    await user.click(screen.getByRole('button', { name: '已加入 dashboard' }));
    expect(screen.getByRole('button', { name: '加入 dashboard' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: '删除冷萃' }));
    expect(screen.queryByLabelText('冷萃名称')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '删除当前类别' }));
    await user.click(screen.getByRole('button', { name: '确认删除' }));
    expect(screen.queryByRole('heading', { name: '咖啡比较' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '零食 · 单位热量性价比' })).toBeInTheDocument();
  });

  it('拒绝空值和零重量，保留原始数据并反馈校验失败', async () => {
    const user = userEvent.setup();
    render(<Trend />);
    await user.clear(screen.getByLabelText('鸭腿重量'));
    await user.type(screen.getByLabelText('鸭腿重量'), '0');
    await user.tab();
    expect(screen.getByLabelText('鸭腿重量')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('请输入 ≥ 0.001 的数值');
    expect(screen.getByRole('button', { name: /鸭腿：横坐标 3.85，纵坐标 37.28/ })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('阈值数值'));
    await user.tab();
    expect(screen.getByLabelText('阈值数值')).toHaveAttribute('aria-invalid', 'true');
  });

  it('损坏存储不会崩溃或自动覆盖；保存失败有明确反馈', async () => {
    localStorage.setItem(STORAGE_KEY, '{broken');
    render(
      <StrictMode>
        <Trend />
      </StrictMode>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('无法读取已保存的配置');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{broken');
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => {
        throw new Error('quota');
      }),
    });
    await userEvent.setup().selectOptions(screen.getByLabelText('参照轴'), 'x');
    expect(screen.getByText('浏览器保存失败，请导出 JSON 备份')).toBeInTheDocument();
  });

  it('导入有效配置，拒绝无效文件，异步导入不覆盖期间的新编辑', async () => {
    const user = userEvent.setup();
    const category = createCategory('coffee', '导入的咖啡', 'custom');
    category.items = [{ ...emptyItem('iced'), name: '冰咖啡', x: 15, y: 100 }];
    const imported = { version: 1, categories: [category], selectedId: category.id };
    render(<Trend />);
    const input = screen.getByLabelText('导入 Trend 配置文件');
    const file = new File(['data'], 'trend.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(imported) });
    await user.upload(input, file);
    expect(await screen.findByRole('heading', { name: '导入的咖啡' })).toBeInTheDocument();
    const badFile = new File(['bad'], 'bad.json', { type: 'application/json' });
    Object.defineProperty(badFile, 'text', { value: async () => '{"version":9}' });
    await user.upload(input, badFile);
    expect(await screen.findByRole('status')).toHaveTextContent('导入失败');
    expect(screen.getByRole('heading', { name: '导入的咖啡' })).toBeInTheDocument();
    let finish!: (value: string) => void;
    const pendingFile = new File(['pending'], 'pending.json', { type: 'application/json' });
    Object.defineProperty(pendingFile, 'text', {
      value: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });
    await user.upload(input, pendingFile);
    await user.click(screen.getByRole('button', { name: '添加条目' }));
    finish(JSON.stringify(defaultState()));
    await waitFor(() => expect(screen.getByLabelText('新条目名称')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: '导入的咖啡' })).toBeInTheDocument();
  });

  it('SSR 首帧不读取浏览器配置，始终输出可见的确定性示例', () => {
    const stored = defaultState();
    stored.categories[0].name = '本地私人配置';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const html = renderToString(<Trend />);
    expect(html).toContain('零食 · 单位热量性价比');
    expect(html).not.toContain('本地私人配置');
    expect(html).toContain('data-trend-item="duck-neck"');
  });
});
