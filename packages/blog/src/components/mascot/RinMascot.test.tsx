import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RinMascot from './RinMascot';
import { RIN_PREFERENCE_KEY, readRinPreference, saveRinPreference, rinConfig } from './rinConfig';
import { createLive2D, type RinDriver } from './live2dRuntime';

vi.mock('./live2dRuntime', () => ({ createLive2D: vi.fn() }));

const LocationProbe = () => <output aria-label="当前路径">{useLocation().pathname}</output>;
const mount = () =>
  render(
    <StrictMode>
      <MemoryRouter>
        <RinMascot />
        <LocationProbe />
      </MemoryRouter>
    </StrictMode>,
  );

const media = (desktop: boolean, reduced = false) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('1024') ? desktop : reduced,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
};

describe('RinMascot', () => {
  beforeEach(() => {
    localStorage.clear();
    rinConfig.modelUrl = '';
    media(true);
  });
  afterEach(() => {
    rinConfig.modelUrl = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('SSR 不读取存储、不渲染依赖视口的角色', () => {
    const get = vi.fn(() => {
      throw new Error('unavailable');
    });
    vi.stubGlobal('localStorage', { getItem: get });
    expect(
      renderToString(
        <MemoryRouter>
          <RinMascot />
        </MemoryRouter>,
      ),
    ).toBe('');
    expect(get).not.toHaveBeenCalled();
  });

  it('桌面展开预览，可聊天、喝茶，搜索使用站内路由', async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.queryByRole('region', { name: '和凛互动' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '和凛打个招呼' }));
    const panel = screen.getByRole('region', { name: '和凛互动' });
    expect(panel).toHaveTextContent('2D 预览');
    expect(panel).toHaveTextContent('代码看累了');
    await user.click(within(panel).getByRole('button', { name: '聊一会儿' }));
    expect(panel).toHaveTextContent('今天也有好好吃饭吗');
    await user.click(within(panel).getByRole('button', { name: '喝杯热茶' }));
    expect(panel).toHaveTextContent('热茶好了');
    expect(screen.getByRole('complementary')).toHaveAttribute('data-reaction', 'tea');
    await user.click(within(panel).getByRole('link', { name: '找篇文章' }));
    expect(screen.getByLabelText('当前路径')).toHaveTextContent('/search');
    expect(screen.queryByRole('region', { name: '和凛互动' })).not.toBeInTheDocument();
    expect(createLive2D).not.toHaveBeenCalled();
  });

  it('移动端初始收起，显式展开后持久化且焦点跟随', async () => {
    media(false);
    const user = userEvent.setup();
    const first = mount();
    expect(screen.queryByRole('button', { name: '和凛打个招呼' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '唤醒看板娘凛' }));
    expect(screen.getByRole('button', { name: '和凛打个招呼' })).toHaveFocus();
    expect(readRinPreference().collapsed).toBe(false);
    first.unmount();
    mount();
    expect(screen.getByRole('button', { name: '和凛打个招呼' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '收起看板娘凛' }));
    expect(screen.getByRole('button', { name: '唤醒看板娘凛' })).toHaveFocus();
    expect(readRinPreference().collapsed).toBe(true);
  });

  it('暂停与换边在重挂载后恢复，收起后关闭对话', async () => {
    const user = userEvent.setup();
    const first = mount();
    await user.click(screen.getByRole('button', { name: '和凛打个招呼' }));
    await user.click(screen.getByRole('button', { name: '暂停角色动画' }));
    await user.click(screen.getByRole('button', { name: '把凛移到另一侧' }));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-paused', 'true');
    expect(screen.getByRole('complementary')).toHaveAttribute('data-side', 'right');
    first.unmount();
    mount();
    expect(screen.getByRole('complementary')).toHaveAttribute('data-paused', 'true');
    expect(screen.getByRole('complementary')).toHaveAttribute('data-side', 'right');
    await user.click(screen.getByRole('button', { name: '和凛打个招呼' }));
    await user.click(screen.getAllByRole('button', { name: '收起看板娘凛' })[0]);
    expect(screen.queryByRole('region', { name: '和凛互动' })).not.toBeInTheDocument();
  });

  it('Escape 关闭面板并恢复角色焦点，外部点击也关闭', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: '和凛打个招呼' }));
    await user.tab();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: '和凛打个招呼' })).toHaveFocus();
    expect(screen.queryByRole('region', { name: '和凛互动' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '和凛打个招呼' }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('region', { name: '和凛互动' })).not.toBeInTheDocument();
  });

  it('尊重减少动态效果设置，不能通过面板强行启用', async () => {
    media(true, true);
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: '和凛打个招呼' }));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-paused', 'true');
    expect(screen.getByRole('button', { name: '暂停角色动画' })).toBeDisabled();
  });

  it('后台暂停、恢复可见时继续，卸载清理监听与帧请求', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const first = mount();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-paused', 'true');
    hidden.mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-paused', 'false');
    first.unmount();
    const added = add.mock.calls.filter(([type]) => type === 'pointermove').map(([, fn]) => fn);
    const removed = remove.mock.calls.filter(([type]) => type === 'pointermove').map(([, fn]) => fn);
    expect(added.length).toBeGreaterThan(0);
    expect(removed).toEqual(added);
  });

  it('损坏存储回退，写入失败反馈且当前操作依然有效', async () => {
    localStorage.setItem(RIN_PREFERENCE_KEY, '{');
    expect(readRinPreference()).toEqual({});
    localStorage.setItem(RIN_PREFERENCE_KEY, '{"collapsed":"true","side":"top","paused":1}');
    expect(readRinPreference()).toEqual({});
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    });
    expect(saveRinPreference({ collapsed: false, paused: false, side: 'left' })).toBe(false);
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: '和凛打个招呼' }));
    await user.click(screen.getByRole('button', { name: '把凛移到另一侧' }));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-side', 'right');
    expect(screen.getByText(/偏好暂时无法保存/)).toBeInTheDocument();
  });

  it('Live2D 加载失败显示真实状态并保留可交互预览', async () => {
    rinConfig.modelUrl = '/live2d/rin/rin.model3.json';
    vi.mocked(createLive2D).mockRejectedValue(new Error('missing model'));
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: '和凛打个招呼' }));
    expect(await screen.findByText(/模型加载失败/)).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toHaveAttribute('data-renderer', 'layered-preview');
    await user.click(screen.getByRole('button', { name: '喝杯热茶' }));
    expect(screen.getByText(/热茶好了/)).toBeInTheDocument();
  });

  it('模型完成后连接暂停与互动，收起释放实例', async () => {
    rinConfig.modelUrl = '/live2d/rin/rin.model3.json';
    const driver: RinDriver = { lookAt: vi.fn(), react: vi.fn(), setPaused: vi.fn(), destroy: vi.fn() };
    vi.mocked(createLive2D).mockResolvedValue(driver);
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(screen.getByRole('complementary')).toHaveAttribute('data-renderer', 'cubism'));
    await user.click(screen.getByRole('button', { name: '和凛打个招呼' }));
    expect(driver.react).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: '暂停角色动画' }));
    expect(driver.setPaused).toHaveBeenLastCalledWith(true);
    await user.click(screen.getAllByRole('button', { name: '收起看板娘凛' })[0]);
    expect(driver.destroy).toHaveBeenCalledOnce();
  });

  it('模型尚未完成就卸载时，取消信号并销毁迟到的实例', async () => {
    rinConfig.modelUrl = '/live2d/rin/rin.model3.json';
    let resolveModel!: (driver: RinDriver) => void;
    vi.mocked(createLive2D).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveModel = resolve;
        }),
    );
    const driver: RinDriver = { lookAt: vi.fn(), react: vi.fn(), setPaused: vi.fn(), destroy: vi.fn() };
    const first = mount();
    await waitFor(() => expect(createLive2D).toHaveBeenCalled());
    const signal = vi.mocked(createLive2D).mock.calls[0][3];
    first.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => resolveModel(driver));
    expect(driver.destroy).toHaveBeenCalledOnce();
    expect(driver.setPaused).not.toHaveBeenCalled();
  });
});
