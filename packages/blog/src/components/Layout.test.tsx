import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { useReadingMode } from './ReadingModeContext';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Layout } from './Layout';
import { siteConfig } from '@config/site.config';
import { RESUME_TYPOGRAPHY_KEY } from '@/hooks/useResumeTypography';
import { PARTICLE_EFFECT_STORAGE_KEY } from '@/utils/particleEffect';
import { BACKGROUND_APPEARANCE_KEY } from '@/hooks/useBackgroundAppearance';

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
    vi.unstubAllEnvs();
    // 恢复 stubReducedMotionForDrawer 的 matchMedia spy 等所有 spyOn 桩。
    vi.restoreAllMocks();
  });

  // 局部让 prefers-reduced-motion 命中：移动抽屉状态机动画时长 340ms→1ms
  // （Layout.tsx: mobileNavDuration = shouldReduceMotion ? 1 : MOBILE_NAV_ANIMATION_DURATION_MS）。
  // 仅用于只断言面板内容/导航、不断画动画时长与过渡守卫的用例，消除对真实定时器的竞争依赖；
  // 动画时长/状态机守卫专项用例不调用本 helper，保持真实 340ms 路径。
  // 用 vi.spyOn 包裹 beforeEach 已定义的 matchMedia，afterEach 的 vi.restoreAllMocks 统一恢复，
  // 其他媒体查询仍返回 matches:false，与全局桩一致。
  const stubReducedMotionForDrawer = () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  };

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
    expect(screen.getAllByRole('link', { name: '文章' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: '展开Static菜单' })).toHaveTextContent('Static');
    expect(screen.queryByRole('link', { name: /^(标签|统计|归档)$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '积累' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '沉沦之海' })).toHaveAttribute('href', '/ocean');
    expect(screen.getByRole('link', { name: '忏悔' })).toHaveAttribute('href', '/confession');
    const links = screen.getAllByRole('link');
    expect(links.indexOf(screen.getByRole('link', { name: '忏悔' }))).toBe(
      links.indexOf(screen.getByRole('link', { name: '沉沦之海' })) + 1,
    );
    expect(links.indexOf(screen.getByRole('link', { name: '沉沦之海' }))).toBeGreaterThan(
      links.indexOf(screen.getByRole('link', { name: 'Planner' })),
    );
    expect(links.indexOf(screen.getByRole('link', { name: '沉沦之海' }))).toBeLessThan(
      links.indexOf(screen.getByRole('link', { name: '关于' })),
    );
  });

  it.each(['/articles', '/post/test-post'])('文章入口在 %s 保持高亮并返回独立列表', async (pathname) => {
    const user = userEvent.setup();
    renderLayout([pathname]);
    const articles = screen.getAllByRole('link', { name: '文章' })[0];
    expect(articles).toHaveAttribute('href', '/articles');
    expect(articles).toHaveAttribute('aria-current', 'page');
    await user.click(articles);
    expect(probePathname).toBe('/articles');
    await user.click(screen.getAllByRole('link', { name: 'Blog' })[0]);
    expect(probePathname).toBe('/');
    screen.getAllByRole('link', { name: '文章' }).forEach((link) => expect(link).not.toHaveAttribute('aria-current'));
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

  it.each(['/book', '/book/'])('书架 %s 在页面外壳渲染全屏天空', (pathname) => {
    renderLayout([pathname]);
    const shell = document.querySelector('.site-shell')!;
    expect(shell).toHaveAttribute('data-book-sky', 'true');
    expect(shell.firstElementChild).toHaveClass('book-sky-world');
    expect(shell.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(shell.querySelector('main .book-sky-world')).not.toBeInTheDocument();
    expect(shell.querySelectorAll(':scope > canvas')).toHaveLength(0);
  });

  it.each(['/', '/archive', '/book/algorithms', '/book/algorithms/chapter/hello'])(
    '页面 %s 保持原有背景',
    (pathname) => {
      renderLayout([pathname]);
      expect(document.querySelector('.site-shell')).not.toHaveAttribute('data-book-sky');
      expect(document.querySelector('.book-sky-world')).not.toBeInTheDocument();
    },
  );

  it('点击 Book 进入天空，离开后恢复用户原有氛围', async () => {
    const user = userEvent.setup();
    renderLayout(['/archive']);
    await waitFor(() => expect(document.querySelectorAll('.site-shell > canvas')).toHaveLength(2));
    const savedEffects = window.localStorage.getItem(PARTICLE_EFFECT_STORAGE_KEY);
    await user.click(screen.getByRole('link', { name: 'Book' }));
    expect(probePathname).toBe('/book');
    expect(document.querySelector('.book-sky-world')).toBeInTheDocument();
    expect(document.querySelectorAll('.site-shell > canvas')).toHaveLength(0);
    expect(window.localStorage.getItem(PARTICLE_EFFECT_STORAGE_KEY)).toBe(savedEffects);
    await user.click(within(document.querySelector('.site-navbar') as HTMLElement).getByRole('link', { name: 'Blog' }));
    expect(probePathname).toBe('/');
    expect(document.querySelector('.book-sky-world')).not.toBeInTheDocument();
    await waitFor(() => expect(document.querySelectorAll('.site-shell > canvas')).toHaveLength(2));
  });

  it('Book 进入 Love 面沿用天空，退出后恢复书架背景标记', async () => {
    const user = userEvent.setup();
    renderLayout(['/book']);
    await user.click(screen.getByRole('button', { name: '进入 Love 面' }));
    await screen.findByRole('region', { name: 'Love 首页' });
    expect(document.querySelector('.site-shell')).not.toHaveAttribute('data-book-sky');
    expect(document.querySelector('.book-sky-world')).toBeInTheDocument();
    expect(document.querySelector('.site-shell')).toHaveAttribute('data-sky-background', 'true');
    await user.click(screen.getByRole('button', { name: '退出 Love 面' }));
    await waitFor(() => expect(document.querySelector('.site-shell')).toHaveAttribute('data-book-sky', 'true'));
    expect(document.querySelector('.book-sky-world')).toBeInTheDocument();
  });

  it('渲染主题切换按钮（桌面端与移动端顶栏各一个）', () => {
    renderLayout();
    expect(screen.getAllByRole('button', { name: /外观与氛围/ }).length).toBeGreaterThanOrEqual(1);
  });

  it('天空背景可搭配浅色和深色，保留原有氛围组合', async () => {
    const user = userEvent.setup();
    renderLayout(['/archive']);
    await waitFor(() => expect(document.querySelectorAll('.site-shell > canvas')).toHaveLength(2));
    const savedEffects = window.localStorage.getItem(PARTICLE_EFFECT_STORAGE_KEY);
    await user.click(screen.getAllByRole('button', { name: /外观与氛围/ })[0]);
    const appearance = within(screen.getByRole('group', { name: '外观' }));
    const sky = appearance.getByRole('button', { name: '天空背景' });
    expect(sky).toHaveAttribute('aria-pressed', 'false');
    await user.click(sky);
    expect(sky).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.site-shell')).toHaveAttribute('data-sky-background', 'true');
    expect(document.querySelector('.site-shell')).not.toHaveAttribute('data-book-sky');
    expect(document.querySelector('.book-sky-world')).toBeInTheDocument();
    expect(document.querySelectorAll('.site-shell > canvas')).toHaveLength(2);
    await user.click(appearance.getByRole('button', { name: '深色' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(sky).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('theme')).toBe('dark');
    expect(window.localStorage.getItem(BACKGROUND_APPEARANCE_KEY)).toBe('sky');
    await user.click(appearance.getByRole('button', { name: '浅色' }));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.querySelector('.book-sky-world')).toBeInTheDocument();
    await user.click(sky);
    expect(document.querySelector('.site-shell')).not.toHaveAttribute('data-sky-background');
    expect(document.querySelector('.book-sky-world')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(PARTICLE_EFFECT_STORAGE_KEY)).toBe(savedEffects);
  });

  it('全站天空在导航、重新挂载及专注阅读退出后恢复', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(BACKGROUND_APPEARANCE_KEY, 'sky');
    const first = renderLayout(['/archive']);
    expect(document.querySelector('.site-shell')).toHaveAttribute('data-sky-background', 'true');
    await user.click(screen.getAllByRole('link', { name: '文章' })[0]);
    expect(probePathname).toBe('/articles');
    expect(document.querySelector('.book-sky-world')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '进入专注阅读' }));
    expect(document.querySelector('.book-sky-world')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '退出专注阅读' }));
    expect(document.querySelector('.book-sky-world')).toBeInTheDocument();
    first.unmount();
    renderLayout(['/archive']);
    expect(document.querySelector('.site-shell')).toHaveAttribute('data-sky-background', 'true');
    screen.getAllByRole('button', { name: /外观与氛围/ }).forEach((button) => {
      expect(button).toHaveAccessibleName(/天空背景/);
    });
  });

  it('Love 面沿用全站天空，退出后保留个人背景选择', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(BACKGROUND_APPEARANCE_KEY, 'sky');
    renderLayout(['/archive']);
    await user.click(screen.getByRole('button', { name: '进入 Love 面' }));
    await screen.findByRole('region', { name: 'Love 首页' });
    expect(document.querySelector('.book-sky-world')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '退出 Love 面' }));
    await waitFor(() => expect(document.querySelector('.book-sky-world')).toBeInTheDocument());
    expect(window.localStorage.getItem(BACKGROUND_APPEARANCE_KEY)).toBe('sky');
  });

  it('默认背景进入 Love 时展示全屏天空，退出后恢复默认背景', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(BACKGROUND_APPEARANCE_KEY, 'default');
    renderLayout(['/archive']);
    expect(document.querySelector('.book-sky-world')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '进入 Love 面' }));
    await screen.findByRole('region', { name: 'Love 首页' });
    const shell = document.querySelector('.site-shell')!;
    expect(shell).toHaveAttribute('data-sky-background', 'true');
    expect(shell.firstElementChild).toHaveClass('book-sky-world');
    expect(shell.querySelector('main .book-sky-world')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '文章' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '退出 Love 面' }));
    await waitFor(() => expect(shell).not.toHaveAttribute('data-sky-background'));
    expect(document.querySelector('.book-sky-world')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(BACKGROUND_APPEARANCE_KEY)).toBe('default');
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
    await user.click(screen.getAllByRole('link', { name: '文章' })[0]);
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

  it('渲染移动端底部标签栏（文章/说说/搜索/Trend/更多），友链和留言移入更多', () => {
    renderLayout();
    expect(
      within(screen.getByRole('navigation', { name: '移动端底部导航' })).getByRole('link', { name: '文章' }),
    ).toHaveAttribute('href', '/articles');
    expect(screen.getByRole('button', { name: '展开移动端说说菜单' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /搜索/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Trend' })).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /友链|留言/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开更多菜单' })).toBeInTheDocument();
  });

  it('说说导航仅点击展开，提供独立页面，点击外部或再次点击关闭', () => {
    renderLayout();
    const trigger = screen.getByRole('button', { name: '展开说说菜单' });
    fireEvent.mouseOver(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu', { name: '展开说说菜单' })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: '展开说说菜单' });
    expect(within(menu).getByRole('menuitem', { name: /^说说/ })).toHaveAttribute('href', '/shuoshuo');
    const weekly = within(menu).getByRole('menuitem', { name: /^周记/ });
    expect(weekly).toHaveAttribute('href', 'https://43.138.216.53/Blog/weekly-journal');
    expect(weekly).not.toHaveAttribute('target');
    fireEvent.mouseLeave(trigger.parentElement!);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('cloud 说说菜单通过键盘进入独立周记并标记当前页，Escape 恢复焦点', async () => {
    vi.stubEnv('VITE_DEPLOY_TARGET', 'cloud');
    renderLayout();
    const trigger = screen.getByRole('button', { name: '展开说说菜单' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const items = within(screen.getByRole('menu', { name: '展开说说菜单' })).getAllByRole('menuitem');
    await waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    await waitFor(() => expect(items[1]).toHaveFocus());
    expect(items[1]).toHaveAttribute('href', '/weekly-journal');
    fireEvent.click(items[1]);
    expect(probePathname).toBe('/weekly-journal');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    await waitFor(() => expect(items[1]).toHaveFocus());
    expect(items[1]).toHaveAttribute('aria-current', 'page');
    fireEvent.keyDown(items[1], { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('移动端说说菜单展开后可进入周记，再返回说说列表', async () => {
    vi.stubEnv('VITE_DEPLOY_TARGET', 'cloud');
    const user = userEvent.setup();
    renderLayout();
    const trigger = within(screen.getByRole('navigation', { name: '移动端底部导航' })).getByRole('button', {
      name: '展开移动端说说菜单',
    });
    await user.click(trigger);
    await user.click(
      within(screen.getByRole('menu', { name: '展开移动端说说菜单' })).getByRole('menuitem', { name: /^周记/ }),
    );
    expect(probePathname).toBe('/weekly-journal');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    await user.click(
      within(screen.getByRole('menu', { name: '展开移动端说说菜单' })).getByRole('menuitem', { name: /^说说/ }),
    );
    expect(probePathname).toBe('/shuoshuo');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('Static 悬停展开三个入口，移入选项保持展开，移出后关闭', () => {
    renderLayout();
    const trigger = screen.getByRole('button', { name: '展开Static菜单' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.mouseOver(trigger);
    const menu = screen.getByRole('menu', { name: '展开Static菜单' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('href'))).toEqual(['/tags', '/stats', '/archive']);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.mouseOut(trigger, { relatedTarget: items[0] });
    fireEvent.mouseOver(items[0], { relatedTarget: trigger });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.mouseOut(items[0], { relatedTarget: document.body });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it.each([
    ['标签', '/tags'],
    ['统计', '/stats'],
    ['归档', '/archive'],
  ])('Static 中的%s跳转到 %s，关闭菜单并高亮当前项', async (label, path) => {
    const user = userEvent.setup();
    renderLayout();
    const trigger = screen.getByRole('button', { name: '展开Static菜单' });
    fireEvent.mouseOver(trigger);
    await user.click(screen.getByRole('menuitem', { name: new RegExp(label) }));
    expect(probePathname).toBe(path);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveClass('text-ink');
    fireEvent.mouseOver(trigger);
    expect(screen.getByRole('menuitem', { name: new RegExp(label) })).toHaveAttribute('aria-current', 'page');
  });

  it('Static 与更多互斥展开，点击触发按钮可切换关闭', () => {
    renderLayout();
    const staticTrigger = screen.getByRole('button', { name: '展开Static菜单' });
    const moreTrigger = screen.getByRole('button', { name: '展开更多菜单' });
    fireEvent.click(staticTrigger);
    expect(staticTrigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.mouseOver(moreTrigger);
    expect(staticTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(moreTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    fireEvent.click(moreTrigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Static 支持方向键循环、Home/End 和 Escape 返回触发按钮', async () => {
    renderLayout();
    const trigger = screen.getByRole('button', { name: '展开Static菜单' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const items = within(screen.getByRole('menu', { name: '展开Static菜单' })).getAllByRole('menuitem');
    await waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(items[0], { key: 'ArrowUp' });
    await waitFor(() => expect(items[2]).toHaveFocus());
    fireEvent.keyDown(items[2], { key: 'ArrowDown' });
    await waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(items[0], { key: 'End' });
    await waitFor(() => expect(items[2]).toHaveFocus());
    fireEvent.keyDown(items[2], { key: 'Home' });
    await waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(items[0], { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('桌面更多菜单可访问友链与留言，移动端更多包含同样入口', async () => {
    const user = userEvent.setup();
    stubReducedMotionForDrawer();
    renderLayout();
    // 桌面菜单仅靠容器 onMouseEnter 展开：mouseOver 经 React 委托合成同一 mouseEnter 语义，
    // 省去 userEvent 完整指针序列；导航点击仍保留 userEvent 真实交互。
    fireEvent.mouseOver(screen.getByRole('button', { name: '展开更多菜单' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /友链/ })).toHaveAttribute('href', '/friends');
    expect(within(menu).getByRole('menuitem', { name: /留言/ })).toHaveAttribute('href', '/guestbook');
    await user.click(within(menu).getByRole('menuitem', { name: /留言/ }));
    expect(probePathname).toBe('/guestbook');
    // 抽屉开关只是触发点（断言的是面板内容），用 fireEvent 触发 onClick 语义。
    fireEvent.click(screen.getByRole('button', { name: '打开更多菜单' }));
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
    stubReducedMotionForDrawer();
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: '打开更多菜单' }));
    await screen.findByRole('dialog', { name: '移动端导航菜单' });
    await waitForNavOpen();
    expect(screen.getByRole('button', { name: /归档/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /标签/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /统计/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /积累/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /沉沦之海/ })).toBeInTheDocument();
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
    stubReducedMotionForDrawer();
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: '打开更多菜单' }));
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

  it('Love 导航提供必做入口，点击后显示登录提示，再次点击收起', async () => {
    const user = userEvent.setup();
    renderLayout();
    expect(screen.queryByRole('button', { name: '必做' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '进入 Love 面' }));
    await screen.findByRole('region', { name: 'Love 首页' });
    const buttons = screen.getAllByRole('button', { name: '必做' });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].parentElement).toBe(screen.getByRole('button', { name: '退出 Love 面' }).parentElement);
    expect(screen.getByRole('button', { name: '退出 Love 面' }).nextElementSibling).toBe(buttons[0]);
    await user.click(buttons[0]);
    expect(screen.getByText('必做清单需要登录云端账号。')).toBeInTheDocument();
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('navigation', { name: '移动端底部导航' })).not.toBeInTheDocument();
    await user.click(buttons[0]);
    expect(screen.queryByText('必做清单需要登录云端账号。')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '退出 Love 面' }));
    expect((await screen.findAllByRole('link', { name: '文章' })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '必做' })).not.toBeInTheDocument();
  });

  it('cloud 构建：头部 Anki 入口是 /anki 同源路由链接，DOM 顺序在品牌与 Love 按钮之间', () => {
    vi.stubEnv('VITE_DEPLOY_TARGET', 'cloud');
    renderLayout();

    const navbar = document.querySelector('nav.site-navbar') as HTMLElement;
    const brandLink = within(navbar).getByRole('link', { name: /Blog/ });
    const ankiLink = screen.getByRole('link', { name: 'Anki 记忆卡片' });
    const loveButton = screen.getByRole('button', { name: '进入 Love 面' });

    expect(ankiLink).toHaveAttribute('href', '/anki');
    // DOM 相邻顺序：品牌 → Anki → Love 按钮。
    expect(brandLink.compareDocumentPosition(ankiLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ankiLink.compareDocumentPosition(loveButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(['/', '/Blog/'])(
    'pages 构建（BASE_URL=%s）：头部 Anki 入口外链恒定指向云端受保护页面，不随当前 build basename 漂移',
    (baseUrl) => {
      vi.stubEnv('VITE_DEPLOY_TARGET', 'pages');
      vi.stubEnv('BASE_URL', baseUrl);
      renderLayout();

      const ankiLink = screen.getByRole('link', { name: /Anki 记忆卡片/ });
      expect(ankiLink).toHaveAttribute('href', 'https://43.138.216.53/Blog/anki');
      // 同 tab 跳转受保护服务器页，非新窗口探针。
      expect(ankiLink).not.toHaveAttribute('target');
    },
  );

  it('进入 Love 面时头部 Anki 入口移出可访问树，退出后恢复，心形开关行为不变', async () => {
    const user = userEvent.setup();
    renderLayout();

    expect(screen.getByRole('link', { name: /Anki 记忆卡片/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '进入 Love 面' }));
    expect(await screen.findByRole('region', { name: 'Love 首页' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Anki 记忆卡片/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退出 Love 面' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '退出 Love 面' }));
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Anki 记忆卡片/ })).toBeInTheDocument();
    });
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
    stubReducedMotionForDrawer();
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: '打开更多菜单' }));
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
