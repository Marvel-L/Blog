import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { useReadingMode } from './ReadingModeContext';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Layout } from './Layout';
import { siteConfig } from '@config/site.config';
import { RESUME_TYPOGRAPHY_KEY } from '@/hooks/useResumeTypography';
import { PARTICLE_EFFECT_STORAGE_KEY } from '@/utils/particleEffect';

// 懒加载子组件用简单 stub 替代，避免测试中等待 dynamic import 与动画。
// 注意：Layout 以命名导出方式解构（import('./X').then(m => m.X)），mock 需提供同名导出。
vi.mock('@/components/BackToTop', () => ({
  BackToTop: () => <div data-testid="mock-back-to-top" />,
}));
vi.mock('@/components/mascot/RinMascot', () => ({
  default: () => <aside aria-label="凛的陪伴角落" />,
}));
vi.mock('@/components/CookieNotice', () => ({
  CookieNotice: () => <div data-testid="mock-cookie-notice" />,
}));
vi.mock('@/components/effects/AsciiOceanField', () => ({
  AsciiOceanField: ({ effect }: { effect: string }) => <canvas data-atmosphere-effect={effect} />,
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
  const { toggleReadingMode, exitReadingMode } = useReadingMode();
  return (
    <>
      <button onClick={toggleReadingMode}>进入专注阅读</button>
      <button onClick={exitReadingMode}>退出专注阅读</button>
    </>
  );
};

const renderLayout = (initialEntries: string[] = ['/']) =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={initialEntries}>
        <Layout>
          <LocationProbe />
          <div>页面内容</div>
        </Layout>
      </MemoryRouter>
    </StrictMode>,
  );

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
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
    document.documentElement.classList.remove('dark');
    Reflect.deleteProperty(document, 'startViewTransition');
    delete document.documentElement.dataset.loveMode;
    delete document.documentElement.dataset.loveModeBoot;
    siteConfig.loveMode = { personName: '' };
  });

  it.each(['/', '/shuoshuo', '/stats', '/about', '/accumulate'])('页面 %s 把氛围粒子抬到阅读区之上', (pathname) => {
    renderLayout([pathname]);
    expect(document.querySelector('.site-shell')).toHaveAttribute('data-particle-front', 'true');
  });

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

  it.each(['/book', '/book/algorithms', '/book/algorithms/chapter/hello'])(
    'Book 入口在 %s 保持高亮并可返回书架',
    async (pathname) => {
      const user = userEvent.setup();
      renderLayout([pathname]);
      const book = screen.getByRole('link', { name: 'Book' });
      expect(book).toHaveAttribute('aria-current', 'page');
      await user.click(book);
      expect(probePathname).toBe('/book');
    },
  );

  it('渲染主题切换按钮（桌面端与移动端顶栏各一个）', () => {
    renderLayout();
    expect(screen.getAllByRole('button', { name: /外观与氛围/ }).length).toBeGreaterThanOrEqual(1);
  });

  it('新访客默认开启小雨、Ascall 鲸鱼和 Aa 排版', async () => {
    renderLayout();
    await waitFor(() => expect(document.querySelector('[data-atmosphere-effect="ascii-whale"]')).toBeInTheDocument());
    expect(document.querySelectorAll('.site-shell > canvas')).toHaveLength(2);
    screen.getAllByRole('button', { name: /外观与氛围/ }).forEach((button) => {
      expect(button).toHaveAccessibleName(/小雨 \+ Ascall 鲸鱼/);
    });
    expect(document.querySelector('.site-shell')).toHaveAttribute('data-typography', 'resume');
    screen.getAllByRole('button', { name: 'Resume 排版' }).forEach((button) => {
      expect(button).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('氛围支持双选，满额禁止第三个，移除选中项后重新开放选择', async () => {
    localStorage.setItem(PARTICLE_EFFECT_STORAGE_KEY, '["sakura"]');
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getAllByRole('button', { name: /外观与氛围/ })[0]);
    const effects = within(screen.getByRole('group', { name: '氛围' }));
    const whale = effects.getByRole('button', { name: /Ascall 鲸鱼/ });
    const rain = effects.getByRole('button', { name: /小雨/ });
    const sakura = effects.getByRole('button', { name: /樱花/ });
    await user.click(whale);
    await waitFor(() => expect(document.querySelector('[data-atmosphere-effect="ascii-whale"]')).toBeTruthy());
    expect(document.querySelectorAll('.site-shell > canvas')).toHaveLength(2);
    expect(whale).toHaveAttribute('aria-pressed', 'true');
    expect(sakura).toBeEnabled();
    expect(rain).toBeDisabled();
    await user.click(rain);
    expect(rain).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('已选 2/2');
    await user.click(sakura);
    expect(rain).toBeEnabled();
    await user.click(rain);
    expect(JSON.parse(localStorage.getItem(PARTICLE_EFFECT_STORAGE_KEY)!)).toEqual(['ascii-whale', 'rain']);
    await user.click(whale);
    expect(document.querySelector('[data-atmosphere-effect="ascii-whale"]')).toBeNull();
    expect(rain).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelectorAll('.site-shell > canvas')).toHaveLength(1);
  });

  it('鲸鱼和鱼群可分别选择、同时开启，并独立关闭', async () => {
    const user = userEvent.setup();
    localStorage.setItem(PARTICLE_EFFECT_STORAGE_KEY, '[]');
    renderLayout();
    await user.click(screen.getAllByRole('button', { name: /外观与氛围/ })[0]);
    const effects = within(screen.getByRole('group', { name: '氛围' }));
    const whale = effects.getByRole('button', { name: /Ascall 鲸鱼/ });
    const fish = effects.getByRole('button', { name: /Ascall 鱼群/ });
    await user.click(fish);
    await waitFor(() => expect(document.querySelector('[data-atmosphere-effect="ascii-fish"]')).toBeTruthy());
    expect(document.querySelector('[data-atmosphere-effect="ascii-whale"]')).toBeNull();
    await user.click(whale);
    await waitFor(() => expect(document.querySelector('[data-atmosphere-effect="ascii-whale"]')).toBeTruthy());
    expect(document.querySelectorAll('.site-shell > canvas')).toHaveLength(2);
    expect(effects.getByRole('button', { name: /樱花/ })).toBeDisabled();
    await user.click(fish);
    expect(document.querySelector('[data-atmosphere-effect="ascii-fish"]')).toBeNull();
    expect(document.querySelector('[data-atmosphere-effect="ascii-whale"]')).toBeTruthy();
    expect(localStorage.getItem(PARTICLE_EFFECT_STORAGE_KEY)).toBe('["ascii-whale"]');
  });

  it('全部关闭后重新挂载仍没有特效，桌面与移动端入口同步', async () => {
    const user = userEvent.setup();
    const first = renderLayout();
    await user.click(screen.getAllByRole('button', { name: /外观与氛围/ })[0]);
    await user.click(within(screen.getByRole('group', { name: '氛围' })).getByRole('button', { name: /小雨/ }));
    await user.click(within(screen.getByRole('group', { name: '氛围' })).getByRole('button', { name: /Ascall 鲸鱼/ }));
    expect(document.querySelectorAll('.site-shell > canvas')).toHaveLength(0);
    expect(localStorage.getItem(PARTICLE_EFFECT_STORAGE_KEY)).toBe('[]');
    first.unmount();
    renderLayout();
    expect(document.querySelectorAll('.site-shell > canvas')).toHaveLength(0);
    screen.getAllByRole('button', { name: /外观与氛围/ }).forEach((button) => {
      expect(button).toHaveAccessibleName(/无特效/);
    });
  });

  it('恢复两个已选特效，专注阅读暂停，退出后恢复组合', async () => {
    localStorage.setItem(PARTICLE_EFFECT_STORAGE_KEY, '["ascii-whale","fireflies"]');
    const user = userEvent.setup();
    renderLayout(['/post/test']);
    await waitFor(() => expect(document.querySelectorAll('.site-shell > canvas')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: '进入专注阅读' }));
    expect(document.querySelectorAll('.site-shell > canvas')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '退出专注阅读' }));
    await waitFor(() => expect(document.querySelectorAll('.site-shell > canvas')).toHaveLength(2));
    expect(localStorage.getItem(PARTICLE_EFFECT_STORAGE_KEY)).toBe('["ascii-whale","fireflies"]');
  });

  it.each(['saved', 'selected'])('%s 深色外观在退出专注阅读后保持，且不会被延迟的主题动画覆盖', async (source) => {
    const pendingUpdates: Array<() => void> = [];
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: vi.fn((update: () => void) => pendingUpdates.push(update)),
    });
    if (source === 'saved') {
      window.localStorage.setItem('theme', 'dark');
    }
    const user = userEvent.setup();
    renderLayout(['/post/test']);
    if (source === 'selected') {
      await user.click(screen.getAllByRole('button', { name: /外观与氛围/ })[0]);
      await user.click(screen.getByRole('button', { name: '深色' }));
    }
    await act(async () => pendingUpdates.splice(0).forEach((update) => update()));
    expect(document.documentElement).toHaveClass('dark');

    await user.click(screen.getByRole('button', { name: '进入专注阅读' }));
    expect(screen.queryByRole('button', { name: /外观与氛围/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '退出专注阅读' }));
    await act(async () => pendingUpdates.splice(0).forEach((update) => update()));

    expect(document.documentElement).toHaveClass('dark');
    screen.getAllByRole('button', { name: /外观与氛围/ }).forEach((button) => {
      expect(button).toHaveAccessibleName(/当前深色/);
    });
    expect(window.localStorage.getItem('theme')).toBe('dark');
  });

  it('桌面与移动端排版开关同步，关闭后恢复原样式', async () => {
    const user = userEvent.setup();
    renderLayout();
    const toggles = screen.getAllByRole('button', { name: 'Resume 排版' });
    expect(toggles).toHaveLength(2);
    expect(document.querySelector('.site-shell')).toHaveAttribute('data-typography', 'resume');
    toggles.forEach((toggle) => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
    await user.click(toggles[0]);
    expect(document.querySelector('.site-shell')).not.toHaveAttribute('data-typography');
    toggles.forEach((toggle) => expect(toggle).toHaveAttribute('aria-pressed', 'false'));
    expect(window.localStorage.getItem(RESUME_TYPOGRAPHY_KEY)).toBe('false');
    await user.click(toggles[1]);
    expect(document.querySelector('.site-shell')).toHaveAttribute('data-typography', 'resume');
    toggles.forEach((toggle) => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
    expect(window.localStorage.getItem(RESUME_TYPOGRAPHY_KEY)).toBe('true');
  });

  it('恢复排版选择，导航到其他页面仍保持新排版', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(RESUME_TYPOGRAPHY_KEY, 'true');
    renderLayout();
    await waitFor(() => expect(document.querySelector('.site-shell')).toHaveAttribute('data-typography', 'resume'));
    await user.click(screen.getByRole('link', { name: '文章' }));
    expect(document.querySelector('.site-shell')).toHaveAttribute('data-typography', 'resume');
    await user.click(screen.getAllByRole('button', { name: '打开搜索页' })[0]);
    await waitFor(() => expect(probePathname).toBe('/search'));
    expect(document.querySelector('.site-shell')).toHaveAttribute('data-typography', 'resume');
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

  it('渲染移动端底部标签栏（首页/说说/搜索/Trend/更多），友链和留言移入更多', () => {
    renderLayout();
    expect(screen.getAllByRole('link', { name: /首页/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /说说/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: /搜索/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Trend' })).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /友链|留言/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开更多菜单' })).toBeInTheDocument();
  });

  it('桌面更多菜单可访问友链与留言，移动端更多包含同样入口', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.hover(screen.getByRole('button', { name: '展开更多菜单' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /友链/ })).toHaveAttribute('href', '/friends');
    expect(within(menu).getByRole('menuitem', { name: /留言/ })).toHaveAttribute('href', '/guestbook');
    await user.click(within(menu).getByRole('menuitem', { name: /留言/ }));
    expect(probePathname).toBe('/guestbook');
    await user.click(screen.getByRole('button', { name: '打开更多菜单' }));
    await screen.findByRole('dialog', { name: '移动端导航菜单' });
    await waitForNavOpen();
    expect(screen.getByRole('button', { name: /友链/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /留言/ })).toBeInTheDocument();
  });

  it('桌面和移动端 Trend 入口指向同一路由并保持高亮', () => {
    renderLayout(['/trend']);
    const links = screen.getAllByRole('link', { name: 'Trend' });
    expect(links).toHaveLength(2);
    links.forEach((link) => {
      expect(link).toHaveAttribute('href', '/trend');
      expect(link).toHaveAttribute('aria-current', 'page');
    });
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

  it('看板娘在专注阅读与 Love 面隐藏，退出后恢复', async () => {
    const user = userEvent.setup();
    renderLayout();
    expect(await screen.findByRole('complementary', { name: '凛的陪伴角落' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '进入专注阅读' }));
    expect(screen.queryByRole('complementary', { name: '凛的陪伴角落' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '退出专注阅读' }));
    expect(await screen.findByRole('complementary', { name: '凛的陪伴角落' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '进入 Love 面' }));
    expect(screen.queryByRole('complementary', { name: '凛的陪伴角落' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '退出 Love 面' }));
    expect(await screen.findByRole('complementary', { name: '凛的陪伴角落' })).toBeInTheDocument();
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

  it('首页页脚笑脸入口需要密码通过后才记录隐藏内容访问状态', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: '打开隐藏内容密码框' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.type(screen.getByLabelText('隐私页密码'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '验证并进入' }));
    expect(await screen.findByText('密码错误，请重新输入。')).toBeInTheDocument();
    expect(probePathname).toBe('/');

    await user.clear(screen.getByLabelText('隐私页密码'));
    await user.type(screen.getByLabelText('隐私页密码'), 'Mx179516');
    await user.click(screen.getByRole('button', { name: '验证并进入' }));

    await waitFor(() => {
      expect(window.sessionStorage.getItem('d-blog-privacy-access')).toBe('granted');
    });
    expect(probePathname).toBe('/');
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

  it('移动端可从更多菜单进入 Book', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: '打开更多菜单' }));
    await screen.findByRole('dialog', { name: '移动端导航菜单' });
    await waitForNavOpen();
    await user.click(screen.getByRole('button', { name: /Book/ }));
    await waitForNavClosed();
    await waitFor(() => expect(probePathname).toBe('/book'));
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
