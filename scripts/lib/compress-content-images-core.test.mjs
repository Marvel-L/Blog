import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  IMAGE_COMPRESS_PROFILE,
  compressContentImageFile,
  compressContentImages,
  loadImageCompressManifest,
  sha256Buffer,
} from './compress-content-images-core.mjs';

const tempRoots = [];

const makeTempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dblog-img-compress-'));
  tempRoots.push(root);
  return root;
};

afterEach(() => {
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
});

const writeBigJpeg = async (filePath) => {
  // 构造大图再压成较高质量 JPEG，便于第一次压缩明显变小。
  const raw = await sharp({
    create: {
      width: 2400,
      height: 1600,
      channels: 3,
      noise: { type: 'gaussian', mean: 128, sigma: 40 },
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, raw);
  return raw.length;
};

describe('compress-content-images-core', () => {
  it('压缩后写入清单，第二次同内容跳过', async () => {
    const root = makeTempRoot();
    const imagePath = path.join(root, 'posts', 'demo', 'hero.jpg');
    const before = await writeBigJpeg(imagePath);
    const manifestPath = path.join(root, 'manifest.json');

    const first = await compressContentImages({
      rootDir: root,
      manifestPath,
      contentDirs: ['posts'],
      concurrency: 1,
    });
    expect(first.compressed).toBe(1);
    expect(fs.statSync(imagePath).size).toBeLessThan(before);

    const second = await compressContentImages({
      rootDir: root,
      manifestPath,
      contentDirs: ['posts'],
      concurrency: 1,
    });
    expect(second.compressed).toBe(0);
    expect(second.skipped).toBe(1);

    const manifest = loadImageCompressManifest(manifestPath);
    expect(manifest.files['posts/demo/hero.jpg'].profileId).toBe(IMAGE_COMPRESS_PROFILE.id);
    expect(manifest.files['posts/demo/hero.jpg'].hash).toBe(sha256Buffer(fs.readFileSync(imagePath)));
  });

  it('换图后会再次压缩', async () => {
    const root = makeTempRoot();
    const imagePath = path.join(root, 'posts', 'demo', 'hero.jpg');
    await writeBigJpeg(imagePath);
    const manifestPath = path.join(root, 'manifest.json');

    await compressContentImages({ rootDir: root, manifestPath, contentDirs: ['posts'], concurrency: 1 });
    const firstHash = sha256Buffer(fs.readFileSync(imagePath));

    await writeBigJpeg(imagePath);
    const again = await compressContentImages({
      rootDir: root,
      manifestPath,
      contentDirs: ['posts'],
      concurrency: 1,
    });
    expect(again.compressed).toBe(1);
    expect(sha256Buffer(fs.readFileSync(imagePath))).not.toBe(firstHash);
  });

  it('profile 不一致时不跳过', async () => {
    const root = makeTempRoot();
    const imagePath = path.join(root, 'posts', 'a.jpg');
    await writeBigJpeg(imagePath);
    const manifest = {
      version: 1,
      profileId: 'old',
      files: {
        'posts/a.jpg': {
          hash: sha256Buffer(fs.readFileSync(imagePath)),
          profileId: 'old',
          bytes: fs.statSync(imagePath).size,
        },
      },
    };
    const result = await compressContentImageFile({
      absPath: imagePath,
      rootDir: root,
      manifest,
    });
    expect(result.status).toBe('compressed');
  });
});
