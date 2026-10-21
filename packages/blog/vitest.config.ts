import { defineConfig } from 'vitest/config';
import type { UserConfig } from 'vite';
import path from 'node:path';
import viteConfigExport from './vite.config';

/**
 * 复用 vite.config.ts 的 resolve.alias（@ → ./src、@config → ./config），
 * 保证测试环境与构建/开发环境的模块解析完全一致。
 *
 * vite.config.ts 的默认导出是 defineConfig 回调（UserConfigFn），
 * 以 serve/test 环境调用一次即可取到其配置对象。
 */
const resolveViteConfig = async (): Promise<UserConfig> => {
  if (typeof viteConfigExport === 'function') {
    return await viteConfigExport({ command: 'serve', mode: 'test' });
  }
  return viteConfigExport;
};

const resolvedViteConfig = await resolveViteConfig();

export default defineConfig({
  root: path.resolve(__dirname, '../..'),
  esbuild: {
    // 与 @vitejs/plugin-react 的 JSX 处理保持一致（react-jsx 自动运行时），
    // 否则测试文件里的 TSX 会按 classic 转换，运行时需要显式引入 React。
    jsx: 'automatic',
  },
  resolve: {
    alias: resolvedViteConfig.resolve?.alias,
  },
  test: {
    // 全局 jsdom；scripts 的 Node 侧测试在文件头用 // @vitest-environment node 声明
    // （Vitest 4 已移除 environmentMatchGlobs，per-file docblock 是受支持的环境切换方式）。
    environment: 'jsdom',
    setupFiles: ['./packages/blog/src/test/setup.ts'],
    include: ['packages/blog/src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/blog/src/**/*.{ts,tsx}'],
      exclude: [
        'packages/blog/src/**/*.test.{ts,tsx}',
        'packages/blog/src/**/*.test-d.ts',
        'packages/blog/src/test/**',
        'packages/blog/src/vite-env.d.ts',
        'scripts/**/*.test.mjs',
      ],
      // 按当前实际覆盖率定基（全量 Stmts≈53/Branch≈47），防止覆盖率继续下滑；
      // 本地 test:coverage 与 CI（ci.yml 的 test job 跑 test:coverage）都受门槛约束。
      thresholds: {
        statements: 50,
        lines: 50,
        functions: 50,
        branches: 45,
      },
    },
  },
});
