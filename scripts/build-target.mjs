import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';
import { loadSiteConfig } from './site-config-loader.mjs';

export function buildTargetSettings(target, root = fileURLToPath(new URL('../', import.meta.url))) {
  if (!['pages', 'cloud'].includes(target)) throw new Error('构建目标必须为 pages 或 cloud');
  const publicEnv = loadEnv('production', root, 'VITE_');
  const site = loadSiteConfig();
  return {
    VITE_DEPLOY_TARGET: target,
    VITE_BASE_PATH: publicEnv.VITE_BASE_PATH || '/Blog/',
    VITE_SITE_URL: publicEnv.VITE_SITE_URL || site.url,
  };
}

/** Select capabilities, then use the single content/SSG/build/audit pipeline. */
export function buildTarget(target) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const settings = buildTargetSettings(target, root);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['scripts/build.mjs', ...(process.argv.includes('--verbose') ? ['--verbose'] : [])],
      {
        cwd: root,
        stdio: 'inherit',
        env: {
          ...process.env,
          ...settings,
        },
      },
    );
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await buildTarget(process.argv[2]);
  } catch {
    console.error('无法启动目标构建，请使用 pages 或 cloud 并检查站点配置');
    process.exitCode = 1;
  }
}
