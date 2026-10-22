import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

/** Check the actual release bundle, including tree shaking of cloud-only code. */
export async function auditDeployment(target, distDir = fileURLToPath(new URL('../dist/', import.meta.url))) {
  if (!['pages', 'cloud'].includes(target)) throw new Error('VITE_DEPLOY_TARGET must be pages or cloud');
  const assets = path.join(distDir, 'assets');
  const files = (await readdir(assets)).filter((file) => file.endsWith('.js'));
  const hasCloudChunk = files.some((file) => file.startsWith('CloudAccount-'));
  let hasCloudApi = false;
  for (const file of files) {
    const source = await readFile(path.join(assets, file), 'utf8');
    // Trend is explicitly shared across Pages/cloud, loaded only on its route.
    if (file.startsWith('TrendSync-')) {
      if (/\/api\/v1(?!\/trend)/.test(source)) throw new Error(`${target} Trend API 隔离检查失败`);
    } else if (source.includes('/api/v1')) hasCloudApi = true;
  }
  const expected = target === 'cloud';
  if (hasCloudChunk !== expected || hasCloudApi !== expected)
    throw new Error(`${target} 产物的账号代码/API 隔离检查失败`);
  return { target, hasCloudChunk, hasCloudApi };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await auditDeployment(process.env.VITE_DEPLOY_TARGET || 'pages');
    console.log(`[audit:deployment] ${result.target} 产物隔离检查通过`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : '部署产物检查失败');
    process.exitCode = 1;
  }
}
