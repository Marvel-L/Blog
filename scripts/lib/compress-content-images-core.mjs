/**
 * 内容旁路图片幂等压缩（posts / shuoshuo / Summary）。
 *
 * 跳过条件：当前文件 sha256 已在清单中，且 profileId 与现行配置一致。
 * 这样已压缩过的文件不会被再次有损压缩；换图或升级 profile 会重新处理。
 *
 * 清单字段：
 * - bytes：当前文件大小（压缩后）
 * - originalBytes：压缩前大小（首次压缩时写入；可用 Git HEAD 回填）
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/** 升级压缩策略时递增，使旧清单条目失效并重压。 */
export const IMAGE_COMPRESS_PROFILE = Object.freeze({
  id: 'v1',
  maxEdge: 1920,
  jpegQuality: 82,
  webpQuality: 80,
  pngCompressionLevel: 9,
  /** 压缩后体积 ≥ 原图该比例则保留原文件，只写入清单避免反复尝试。 */
  minUsefulRatio: 0.98,
});

const COMPRESS_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export const sha256Buffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

export const loadImageCompressManifest = (manifestPath) => {
  if (!fs.existsSync(manifestPath)) {
    return { version: 1, profileId: IMAGE_COMPRESS_PROFILE.id, files: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return {
      version: 1,
      profileId: typeof raw.profileId === 'string' ? raw.profileId : IMAGE_COMPRESS_PROFILE.id,
      files: raw.files && typeof raw.files === 'object' ? raw.files : {},
    };
  } catch {
    return { version: 1, profileId: IMAGE_COMPRESS_PROFILE.id, files: {} };
  }
};

export const saveImageCompressManifest = (manifestPath, manifest) => {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const payload = {
    version: 1,
    profileId: IMAGE_COMPRESS_PROFILE.id,
    files: Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b))),
  };
  fs.writeFileSync(`${manifestPath}`, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

export const listCompressibleImages = (rootDir, contentDirs) => {
  const results = [];
  for (const dirName of contentDirs) {
    const absDir = path.join(rootDir, dirName);
    if (!fs.existsSync(absDir)) continue;
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (!COMPRESS_EXTS.has(ext)) continue;
        results.push(full);
      }
    };
    walk(absDir);
  }
  return results.sort((a, b) => a.localeCompare(b));
};

const shouldSkipByManifest = (manifest, relPath, hash) => {
  const entry = manifest.files[relPath];
  return Boolean(entry && entry.hash === hash && entry.profileId === IMAGE_COMPRESS_PROFILE.id);
};

/** 从 Git HEAD 取提交时的 blob 大小，用于回填 originalBytes。 */
export const gitHeadBlobSize = (rootDir, relPath) => {
  try {
    const out = execFileSync('git', ['cat-file', '-s', `HEAD:${relPath}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const size = Number.parseInt(String(out).trim(), 10);
    return Number.isFinite(size) && size > 0 ? size : null;
  } catch {
    return null;
  }
};

const resolveOriginalBytes = ({ rootDir, relPath, inputLength, previousEntry }) => {
  if (previousEntry && Number.isFinite(previousEntry.originalBytes) && previousEntry.originalBytes > 0) {
    return previousEntry.originalBytes;
  }
  const fromGit = gitHeadBlobSize(rootDir, relPath);
  if (fromGit && fromGit > inputLength) {
    return fromGit;
  }
  return inputLength;
};

/**
 * 压缩单张图片（可能原地改写）。返回状态供汇总。
 */
export const compressContentImageFile = async ({ absPath, rootDir, manifest, profile = IMAGE_COMPRESS_PROFILE }) => {
  const relPath = path.relative(rootDir, absPath).split(path.sep).join('/');
  const input = fs.readFileSync(absPath);
  const hash = sha256Buffer(input);
  const previousEntry = manifest.files[relPath];

  if (shouldSkipByManifest(manifest, relPath, hash)) {
    const originalBytes = resolveOriginalBytes({
      rootDir,
      relPath,
      inputLength: input.length,
      previousEntry,
    });
    manifest.files[relPath] = {
      ...previousEntry,
      hash,
      profileId: profile.id,
      bytes: input.length,
      originalBytes,
    };
    return { status: 'skipped', relPath, before: originalBytes, after: input.length };
  }

  let metadata;
  try {
    metadata = await sharp(input, { animated: true }).metadata();
  } catch {
    return { status: 'ignored', relPath, reason: 'unreadable' };
  }

  if ((metadata.pages && metadata.pages > 1) || metadata.format === 'gif') {
    manifest.files[relPath] = {
      hash,
      profileId: profile.id,
      bytes: input.length,
      originalBytes: input.length,
      skipped: 'animated',
    };
    return { status: 'ignored', relPath, reason: 'animated' };
  }

  const ext = path.extname(absPath).toLowerCase();
  let pipeline = sharp(input).rotate();

  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (Math.max(width, height) > profile.maxEdge) {
    pipeline = pipeline.resize({
      width: profile.maxEdge,
      height: profile.maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  let output;
  if (ext === '.jpg' || ext === '.jpeg') {
    output = await pipeline.jpeg({ quality: profile.jpegQuality, mozjpeg: true }).toBuffer();
  } else if (ext === '.png') {
    output = await pipeline.png({ compressionLevel: profile.pngCompressionLevel, effort: 8 }).toBuffer();
  } else if (ext === '.webp') {
    output = await pipeline.webp({ quality: profile.webpQuality }).toBuffer();
  } else {
    return { status: 'ignored', relPath, reason: 'ext' };
  }

  const originalBytes = resolveOriginalBytes({
    rootDir,
    relPath,
    inputLength: input.length,
    previousEntry,
  });

  if (output.length >= Math.floor(input.length * profile.minUsefulRatio)) {
    manifest.files[relPath] = {
      hash,
      profileId: profile.id,
      bytes: input.length,
      originalBytes,
      unchanged: true,
    };
    return { status: 'unchanged', relPath, before: originalBytes, after: input.length };
  }

  fs.writeFileSync(absPath, output);
  const newHash = sha256Buffer(output);
  manifest.files[relPath] = {
    hash: newHash,
    profileId: profile.id,
    bytes: output.length,
    originalBytes,
  };
  return { status: 'compressed', relPath, before: originalBytes, after: output.length };
};

const runPool = async (items, concurrency, worker) => {
  const results = [];
  let index = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await worker(current));
    }
  });
  await Promise.all(runners);
  return results;
};

/**
 * 扫描并压缩内容目录图片，更新清单。
 */
export const compressContentImages = async ({
  rootDir,
  manifestPath,
  contentDirs = ['posts', 'shuoshuo', 'Summary'],
  concurrency = 4,
  profile = IMAGE_COMPRESS_PROFILE,
} = {}) => {
  const manifest = loadImageCompressManifest(manifestPath);
  const files = listCompressibleImages(rootDir, contentDirs);
  const outcomes = await runPool(files, concurrency, (absPath) =>
    compressContentImageFile({ absPath, rootDir, manifest, profile }),
  );

  const living = new Set(files.map((abs) => path.relative(rootDir, abs).split(path.sep).join('/')));
  for (const key of Object.keys(manifest.files)) {
    if (!living.has(key)) {
      delete manifest.files[key];
    }
  }

  manifest.profileId = profile.id;
  saveImageCompressManifest(manifestPath, manifest);

  return {
    total: files.length,
    compressed: outcomes.filter((o) => o.status === 'compressed').length,
    skipped: outcomes.filter((o) => o.status === 'skipped').length,
    unchanged: outcomes.filter((o) => o.status === 'unchanged').length,
    ignored: outcomes.filter((o) => o.status === 'ignored').length,
    savedBytes: outcomes
      .filter((o) => o.status === 'compressed' || o.status === 'skipped')
      .reduce((sum, o) => sum + Math.max(0, (o.before || 0) - (o.after || 0)), 0),
    outcomes,
    manifest,
  };
};

/**
 * 把清单整理成前端可读报告（按节省字节降序）。
 * postsMeta: Array<{ id, title, filePath }>
 */
export const buildImageCompressReport = (manifest, postsMeta = []) => {
  const posts = Array.isArray(postsMeta) ? postsMeta : [];
  const items = [];

  for (const [relPath, entry] of Object.entries(manifest.files || {})) {
    if (!entry || entry.skipped || entry.unchanged) continue;
    const originalBytes = Number(entry.originalBytes);
    const bytes = Number(entry.bytes);
    if (!Number.isFinite(originalBytes) || !Number.isFinite(bytes) || originalBytes <= bytes) continue;

    const fileName = relPath.split('/').pop() || relPath;
    let article = relPath.split('/')[0] || '内容';
    let articleId = '';

    if (relPath.startsWith('posts/')) {
      const dirAsUrl = `/${path.posix.dirname(relPath)}/`;
      const matched = posts.find((post) => {
        const filePath = String(post.filePath || '');
        return filePath.startsWith(dirAsUrl) || filePath.startsWith(dirAsUrl.slice(1));
      });
      if (matched) {
        article = matched.title || matched.id || article;
        articleId = matched.id || '';
      } else {
        const parts = relPath.split('/');
        article = parts.length >= 2 ? parts[parts.length - 2] : article;
      }
    } else if (relPath.startsWith('shuoshuo/')) {
      const parts = relPath.split('/');
      article = `说说 · ${parts[1] || fileName}`;
    } else if (relPath.startsWith('Summary/')) {
      article = `积累 · ${relPath.split('/')[1] || fileName}`;
    }

    items.push({
      article,
      articleId,
      image: fileName,
      path: relPath,
      originalBytes,
      bytes,
      savedBytes: originalBytes - bytes,
    });
  }

  items.sort((a, b) => b.savedBytes - a.savedBytes || a.path.localeCompare(b.path));
  return {
    profileId: manifest.profileId || IMAGE_COMPRESS_PROFILE.id,
    items,
  };
};
