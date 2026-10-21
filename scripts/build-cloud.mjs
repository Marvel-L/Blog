import { pathToFileURL } from 'node:url';
import { buildTarget } from './build-target.mjs';

/** Both targets use the existing build/SSG/audit pipeline and /Blog/ base. */
export function buildCloud() {
  return buildTarget('cloud');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await buildCloud();
  } catch {
    console.error('无法启动云端站点构建');
    process.exitCode = 1;
  }
}
