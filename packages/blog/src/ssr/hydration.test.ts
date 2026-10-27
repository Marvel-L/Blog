import { afterEach, describe, expect, it } from 'vitest';
import { shouldHydrateRoot } from './hydration';

afterEach(() => document.body.replaceChildren());

const rootWith = (html: string) => {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
};

describe('Anki 刷新水合保护', () => {
  it.each(['/Blog/anki', '/Blog/anki/', '/Blog/anki/login', '/Blog/anki/login/'])(
    '%s 拒绝旧博客回退 HTML',
    (pathname) => {
      const root = rootWith('<div class="site-shell"><nav>Blog</nav></div>');
      expect(shouldHydrateRoot(root, pathname, '/Blog', 'cloud')).toBe(false);
    },
  );

  it('保留 Anki 专属静态壳的水合', () => {
    const root = rootWith('<!--$--><div class="anki-surface">正在加载卡片库…</div><!--/$-->');
    expect(shouldHydrateRoot(root, '/Blog/anki', '/Blog', 'cloud')).toBe(true);
  });

  it('根路径部署同样拒绝错误回退', () => {
    const root = rootWith('<div class="site-shell">Blog</div>');
    expect(shouldHydrateRoot(root, '/anki/login', '/', 'cloud')).toBe(false);
  });

  it('不影响 Pages、博客与相似路径', () => {
    const root = rootWith('<div class="site-shell">Blog</div>');
    for (const [pathname, target] of [
      ['/Blog/anki', 'pages'],
      ['/Blog/', 'cloud'],
      ['/Blog/ankiology', 'cloud'],
      ['/other/anki', 'cloud'],
    ]) {
      expect(shouldHydrateRoot(root, pathname, '/Blog', target)).toBe(true);
    }
  });

  it('空挂载点继续走客户端渲染', () => {
    expect(shouldHydrateRoot(rootWith(''), '/Blog/anki', '/Blog', 'cloud')).toBe(false);
  });
});
