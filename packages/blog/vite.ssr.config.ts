import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { normalizeBasePath } from '../../config/basePath';

/**
 * SSR 构建配置：把 src/ssr-entry.tsx 编译为 Node 可用的服务端渲染 bundle（dist-ssr/），
 * 供 scripts/ssg.mjs 在构建期渲染每个页面的完整静态 HTML。
 * base 与主构建保持一致（共用 config/basePath.ts 的 normalizeBasePath），
 * 确保 import.meta.env.BASE_URL（getSiteBasePath 依赖它）在两端一致。
 */
const repositoryRoot = path.resolve(__dirname, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repositoryRoot, 'VITE_');

  return {
    root: __dirname,
    envDir: repositoryRoot,
    define: {
      'import.meta.env.VITE_DEPLOY_TARGET': JSON.stringify(
        mode === 'cloud' ? 'cloud' : env.VITE_DEPLOY_TARGET || 'pages',
      ),
    },
    plugins: [react()],
    base: normalizeBasePath(env.VITE_BASE_PATH),
    esbuild: {
      drop: ['console', 'debugger'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@config': path.resolve(repositoryRoot, 'config'),
      },
    },
    build: {
      outDir: path.resolve(repositoryRoot, 'dist-ssr'),
      emptyOutDir: true,
      sourcemap: false,
      target: 'node20',
      minify: false,
      ssr: path.resolve(__dirname, 'src/ssr-entry.tsx'),
      rollupOptions: {
        output: {
          entryFileNames: 'entry-server.js',
          chunkFileNames: 'assets/[name]-[hash].js',
        },
      },
    },
  };
});
