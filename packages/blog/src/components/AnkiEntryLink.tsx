/**
 * 头部 Anki 入口：紧贴 Love 心形按钮左侧的紧凑图标入口。
 *
 * 边界（依据 cloud-platform / anki 规则）：
 * - cloud 构建：同源 SPA `<Link to="/anki">`，basename 由 react-router 按 dev/prod
 *   配置自动挂载；
 * - Pages 构建：产物不打包 Anki 页面与账号 API（不把账号跨域带进 Pages），
 *   入口按用户指定的常量 URL 直接指向云端服务器受保护页面——该地址是服务器部署
 *   路径的既定事实（/Blog/anki），与当前 build/dev 的 basename 无关，不做拼接。
 *
 * 纯渲染组件：无时钟/随机/客户端 API 依赖，SSG 首帧与水合一致。
 */
import { Link } from 'react-router-dom';
import { Layers } from 'lucide-react';

// 用户指定的 Pages 外链确切目标：云端服务器上受保护的 Anki 页面（需登录）。
const PAGES_EXTERNAL_ANKI_URL = 'https://43.138.216.53/Blog/anki';

// 与 Love 心形同款紧凑尺寸（h-9/w-9，sm 起 h-10/w-10），中性灰配色避免与粉色心形混淆；
// 保持低可见默认态，hover/focus 增强，不挤压品牌文字与心形按钮。
const entryClassName =
  'group relative z-50 ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-[opacity,background-color,border-color,color,transform] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/80 active:scale-[0.97] sm:h-10 sm:w-10 border-zinc-300/60 bg-zinc-100/40 text-zinc-500 opacity-75 hover:bg-zinc-200/60 hover:text-ink hover:opacity-100 dark:border-zinc-700/60 dark:bg-zinc-800/40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white';

const tooltip = (
  <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-control border border-zinc-300/70 bg-white/95 px-2 py-1 text-xs text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:border-zinc-700 dark:bg-zinc-950/95 dark:text-zinc-300">
    Anki 记忆卡片
  </span>
);

export const AnkiEntryLink = () => {
  // 构建期常量：cloud/pages 两目标产物各自恒定，SSR 首帧与水合一致。
  if (import.meta.env.VITE_DEPLOY_TARGET === 'cloud') {
    return (
      <Link to="/anki" aria-label="Anki 记忆卡片" className={entryClassName}>
        <Layers size={16} aria-hidden="true" />
        {tooltip}
      </Link>
    );
  }

  return (
    <a href={PAGES_EXTERNAL_ANKI_URL} aria-label="Anki 记忆卡片（云端受保护页面，需登录）" className={entryClassName}>
      <Layers size={16} aria-hidden="true" />
      {tooltip}
    </a>
  );
};
