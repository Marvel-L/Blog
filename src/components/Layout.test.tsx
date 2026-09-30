import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Layout } from './Layout';
import { siteConfig } from '@config/site.config';

// 懒加载子组件用简单 stub 替代，避免测试中等待 dynamic import 与动画。
// 注意：Layout 以命名导出方式解构（import('./X').then(m => m.X)），mock 需提供同名导出。
vi.mock('@/components/BackToTop', () => ({
  BackToTop: () => <div data-testid="mock-back-to-top" />,
}));
vi.mock('@/components/CookieNotice', () => ({
  CookieNotice: () => <div data-testid="mock-cookie-notice" />,
}));
// 不蒜子统计：避免测试环境发起真实网络请求。
vi.mock('@/services/busuanzi', () => ({
  pingBusuanzi: vi.fn(),
  fillBusuanziSpans: vi.fn(),
}));

// 路由探针：MemoryRouter 不更新 window.location，断言跳转必须经
// useLocation 读取（否则「跳转到搜索页」的断言恒真、无回归保护）。
let probePathname = '';
const LocationProbe = () => {
  probePathname = useLocation().pathname;
  return null;
};

const renderLayout = (initialEntries: string[] = ['/']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Layout>
        <LocationProbe />
        <div>页面内容</div>
      </Layout>
    </MemoryRouter>,
  );

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    delete document.documentElement.dataset.loveMode;
    delete document.documentElement.dataset.loveModeBoot;
    siteConfig.loveMode = { personName: '' };
    // jsdom 不实现 matchMedia：ThemeToggle / Navbar 的媒体查询依赖它。
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    // 移动端导航锁定 body 滚动：重置避免跨用例污染。
    document.body.style.overflow = '';
    delete document.documentElement.dataset.loveMode;
    delete document.documentElement.dataset.loveModeBoot;
    siteConfig.loveMode = { personName: '' };
  });

  it.each(['/', '/shuoshuo', '/stats', '/road', '/about', '/accumulate'])(
    '页面 %s 把氛围粒子抬到阅读区之上',
    (pathname) => {
      renderLayout([pathname]);
      expect(document.querySelector('.site-shell')).toHaveAttribute('data-particle-front', 'true');
    },
  );

  it('未列入白名单的页面不抬高氛围粒子', () => {
    renderLayout(['/archive']);
    expect(document.querySelector('.site-shell')).not.toHaveAttribute('data-particle-front');
  });

  it('渲染导航栏主导航项（桌面端可见）', () => {
    renderLayout();
    // 顶栏导航 + 移动端底部标签栏各是一个 nav
    expect(screen.getAllByRole('navigation').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('link', { name: '文章' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /归档/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: '标签' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '积累' })).toBeInTheDocument();
  });

  it('渲染主题切换按钮（桌面端与移动端顶栏各一个）', () => {
    renderLayout();
    expect(screen.getAllByRole('button', { name: /外观与氛围/ }).length).toBeGreaterThanOrEqual(1);
  });

  it('渲染待补完文章入口按钮', () => {
    renderLayout();
    expect(screen.getAllByRole('link', { name: /查看待补完文章页/ }).length).toBeGreaterThanOrEqual(1);
  });

  it('渲染搜索入口按钮', () => {
    renderLayout();
    // 桌面端搜索按钮；移动端入口在底部标签栏的「搜索」标签
    expect(screen.getAllByRole('button', { name: '打开搜索页' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: /搜索/ })).toBeInTheDocument();
  });

  it('渲染移动端底部标签栏（首页/说说/搜索/友链/更多）', () => {
    renderLayout();
    expect(screen.getAllByRole('link', { name: /首页/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /说说/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: /搜索/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /友链/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: '打开更多菜单' })).toBeInTheDocument();
  });

  it('归档等栏目收纳进「更多」面板', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: '打开更多菜单' }));
    await screen.findByRole('dialog', { name: '移动端导航菜单' });
    await waitForNavOpen();
    expect(screen.getByRole('button', { name: /归档/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /标签/ })).toBeInTheDocument();
  });

  it('渲染 children 内容', () => {
    renderLayout();
    expect(screen.getByText('页面内容')).toBeInTheDocument();
  });

  it('氛围粒子层低于正文，避免花瓣盖住文章图片', () => {
    renderLayout();
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas).toHaveClass('z-particle');
  });

  it('不再渲染反馈侧签', () => {
    renderLayout();
    expect(screen.queryByTestId('mock-feedback-dock')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /反馈/ })).not.toBeInTheDocument();
  });

  it('导航「更多」面板中不包含反馈入口', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: '打开更多菜单' }));
    await screen.findByRole('dialog', { name: '移动端导航菜单' });
    await waitForNavOpen();
    expect(screen.queryByRole('button', { name: /反馈/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /反馈/ })).not.toBeInTheDocument();
  });

  it('渲染页脚（站点标题与备案链接）', () => {
    renderLayout();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('Ctrl+K 跳转到搜索页', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.keyboard('{Control>}k{/Control}');
    await waitFor(() => expect(probePathname).toBe('/search'));
  });

  it('点击搜索按钮跳转到搜索页', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getAllByRole('button', { name: '打开搜索页' })[0]);
    await waitFor(() => expect(probePathname).toBe('/search'));
  });

  it('点击爱心按钮进入 Love 面并隐藏原有导航入口', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: '进入 Love 面' }));

    expect(await screen.findByRole('region', { name: 'Love 首页' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Love 地域，当前湘潭' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('link', { name: '文章' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开更多菜单' })).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(document.querySelector('canvas')).not.toBeInTheDocument();
  });

  it('启动阶段已标记 Love 模式时，首帧直接进入 Love 面', async () => {
    document.documentElement.dataset.loveMode = 'true';
    document.documentElement.dataset.loveModeBoot = 'true';
    window.localStorage.setItem('d-blog-love-mode', 'true');
    renderLayout();

    expect(await screen.findByRole('region', { name: 'Love 首页' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退出 Love 面' })).toBeInTheDocument();
  });

  it('Love 面点击导航栏地域按钮后进入地域页', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: '进入 Love 面' }));
    await screen.findByRole('region', { name: 'Love 首页' });

    await user.click(screen.getAllByRole('button', { name: 'Love 地域，当前湘潭' })[0]);
    await user.click(await screen.findByRole('button', { name: '北京地域选项' }));

    expect(await screen.findByRole('heading', { name: '北京' })).toBeInTheDocument();
    expect(screen.getByTestId('love-region-stage')).toBeInTheDocument();
  });

  it('配置 Love 面人名后，背景会铺陈该名字', async () => {
    siteConfig.loveMode = { personName: '刘宇' };
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: '进入 Love 面' }));
    await screen.findByRole('region', { name: 'Love 首页' });

    expect(screen.getAllByText(/刘宇/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('love-name-marquee')).toBeInTheDocument();
  });

  it('Love 面导航可以切换人名特效模式', async () => {
    siteConfig.loveMode = { personName: '刘宇' };
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: '进入 Love 面' }));
    await screen.findByRole('region', { name: 'Love 首页' });
    expect(screen.getByTestId('love-name-marquee')).toBeInTheDocument();
    expect(screen.queryByTestId('love-name-rain')).not.toBeInTheDocument();

    const effectTriggers = screen.getAllByRole('button', { name: 'Love 面特效，当前走动' });
    await user.click(effectTriggers[0]);
    const rainButtons = await screen.findAllByRole('button', { name: '代码雨特效选项' });

    await user.click(rainButtons[0]);
    expect(screen.getAllByRole('button', { name: 'Love 面特效，当前代码雨' })[0]).toBeInTheDocument();
    expect(screen.queryByTestId('love-name-marquee')).not.toBeInTheDocument();
    expect(screen.getByTestId('love-name-rain')).toBeInTheDocument();
  });

  // 等待移动端导航动画完成（data-state 从 opening 推进到 open）：
  // 用 waitFor 轮询状态而非固定 sleep —— 动画时长（MOBILE_NAV_ANIMATION_DURATION_MS）
  // 调整时测试不脆断，也不拖慢套件。
  const waitForNavOpen = async () => {
    await waitFor(() => {
      const panel = screen.getByTestId('mobile-nav-panel');
      expect(panel.getAttribute('data-state')).toBe('open');
    });
  };
  const waitForNavClosed = async () => {
    await waitFor(() => {
      expect(screen.queryByTestId('mobile-nav-panel')).not.toBeInTheDocument();
    });
  };

  it('移动端「更多」标签打开导航面板并可关闭', async () => {
    const user = userEvent.setup();
    renderLayout();
    const moreButton = screen.getByRole('button', { name: '打开更多菜单' });
    await user.click(moreButton);
    expect(await screen.findByRole('dialog', { name: '移动端导航菜单' })).toBeInTheDocument();
    // 等待打开动画完成（否则切换关闭会被 isMobileNavAnimating 守卫忽略）。
    await waitForNavOpen();
    // aria-expanded 在面板真正进入 opening/open 态后才为 true：openMobileNav 先以
    // closed 态挂载面板（离屏）再经双 rAF 切入 opening，刚挂载那一刻仍是 false。
    expect(moreButton).toHaveAttribute('aria-expanded', 'true');

    // 再次点击「更多」切换关闭。
    await user.click(moreButton);
    // 关闭动画后面板卸载。
    await waitForNavClosed();
    expect(screen.queryByRole('dialog', { name: '移动端导航菜单' })).not.toBeInTheDocument();
  });

  it('点击「更多」面板导航项后菜单关闭（close-then-navigate 守卫回归）', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: '打开更多菜单' }));
    await screen.findByRole('dialog', { name: '移动端导航菜单' });
    // 等待打开动画完成。
    await waitForNavOpen();

    // 点击「更多」面板中的「标签」导航项：菜单应关闭且不吞掉导航动作。
    await user.click(screen.getByRole('button', { name: /标签/ }));
    await waitForNavClosed();
    expect(screen.queryByRole('dialog', { name: '移动端导航菜单' })).not.toBeInTheDocument();
  });
});
