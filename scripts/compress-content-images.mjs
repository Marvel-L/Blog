/**
 * CLI：幂等压缩 posts / shuoshuo / Summary 旁路图片。
 *
 *   node scripts/compress-content-images.mjs
 *   SKIP_IMAGE_COMPRESS=1  — 跳过（调试用）
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildImageCompressReport,
  compressContentImages,
  loadImageCompressManifest,
} from './lib/compress-content-images-core.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT_DIR, 'config', 'image-compress-manifest.json');
const REPORT_PATH = path.join(ROOT_DIR, 'generated', 'image-compress-report.json');

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MiB`;
};

export const writeImageCompressReport = (
  postsMeta = [],
  { manifestPath = MANIFEST_PATH, reportPath = REPORT_PATH } = {},
) => {
  const manifest = loadImageCompressManifest(manifestPath);
  const report = buildImageCompressReport(manifest, postsMeta);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
};

export const runCompressContentImagesCli = async ({
  rootDir = ROOT_DIR,
  manifestPath = MANIFEST_PATH,
  logger = console,
  postsMeta = [],
} = {}) => {
  if (process.env.SKIP_IMAGE_COMPRESS === '1') {
    logger.log('[compress-images] skipped (SKIP_IMAGE_COMPRESS=1)');
    writeImageCompressReport(postsMeta, { manifestPath });
    return { skippedAll: true };
  }

  const started = Date.now();
  const summary = await compressContentImages({ rootDir, manifestPath });
  writeImageCompressReport(postsMeta, { manifestPath });
  const elapsed = ((Date.now() - started) / 1000).toFixed(2);
  logger.log(
    `[compress-images] done total=${summary.total} compressed=${summary.compressed} skipped=${summary.skipped} unchanged=${summary.unchanged} ignored=${summary.ignored} saved=${formatBytes(summary.savedBytes)} elapsed=${elapsed}s`,
  );
  return summary;
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  runCompressContentImagesCli().catch((error) => {
    console.error('[compress-images] failed', error);
    process.exitCode = 1;
  });
}
