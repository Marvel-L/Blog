import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  IMAGE_COMPRESS_PROFILE,
  buildImageCompressReport,
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

  it('默认也会压缩 posts-img 下的文章封面', async () => {
    const root = makeTempRoot();
    const imagePath = path.join(root, 'posts-img', 'covers', 'hero.jpg');
    const before = await writeBigJpeg(imagePath);
    const manifestPath = path.join(root, 'manifest.json');

    const result = await compressContentImages({
      rootDir: root,
      manifestPath,
      concurrency: 1,
    });

    expect(result.compressed).toBe(1);
    expect(fs.statSync(imagePath).size).toBeLessThan(before);
    expect(result.manifest.files['posts-img/covers/hero.jpg']).toBeTruthy();
  });

  it('压缩报告会把 posts-img 封面映射回文章标题', () => {
    const report = buildImageCompressReport(
      {
        profileId: IMAGE_COMPRESS_PROFILE.id,
        files: {
          'posts-img/算法/leetcode.png': {
            profileId: IMAGE_COMPRESS_PROFILE.id,
            hash: 'hash',
            originalBytes: 300,
            bytes: 120,
          },
        },
      },
      [
        {
          id: 'week1-day1',
          title: '小林冲刺 weekly day1',
          filePath: '/posts/算法/小林_冲刺weekly/week1/week1_day1.md',
          coverImage: '/posts-img/算法/leetcode.png',
        },
        {
          id: 'week1-day2',
          title: '小林冲刺 weekly day2',
          filePath: '/posts/算法/小林_冲刺weekly/week1/week1_day2.md',
          coverImage: '/posts-img/算法/leetcode.png',
        },
      ],
    );

    expect(report.items).toEqual([
      expect.objectContaining({
        path: 'posts-img/算法/leetcode.png',
        article: '小林冲刺 weekly day1 等2篇文章',
        articleId: '',
        savedBytes: 180,
      }),
    ]);
  });
});
