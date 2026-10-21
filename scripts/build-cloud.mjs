import { loadSiteConfig } from './site-config-loader.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Both targets use the existing build/SSG/audit pipeline and /Blog/ base. */
export function buildCloud() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/build.mjs'], {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_DEPLOY_TARGET: 'cloud',
        VITE_BASE_PATH: '/Blog/',
        VITE_SITE_URL: loadSiteConfig().url,
      },
    });
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await buildCloud();
  } catch {
    console.error('无法启动云端站点构建');
    process.exitCode = 1;
  }
}
