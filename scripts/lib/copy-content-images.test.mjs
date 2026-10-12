// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyContentImages } from './copy-content-images.mjs';

const tempRoots = [];

const makeTempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dblog-copy-content-images-'));
  tempRoots.push(root);
  return root;
};

afterEach(() => {
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
});

describe('copyContentImages', () => {
  it('递归复制图片并保留相对路径，跳过非图片文件', () => {
    const root = makeTempRoot();
    const sourceDir = path.join(root, 'posts-img');
    const destDir = path.join(root, 'public', 'posts-img');

    fs.mkdirSync(path.join(sourceDir, '算法', 'demo'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, '算法', 'demo', 'leetcode.png'), 'png');
    fs.writeFileSync(path.join(sourceDir, '算法', 'demo', 'note.txt'), 'skip');

    const copied = copyContentImages(sourceDir, destDir);

    expect(copied).toBe(1);
    expect(fs.readFileSync(path.join(destDir, '算法', 'demo', 'leetcode.png'), 'utf8')).toBe('png');
    expect(fs.existsSync(path.join(destDir, '算法', 'demo', 'note.txt'))).toBe(false);
  });

  it('源目录不存在时返回 0', () => {
    const root = makeTempRoot();
    expect(copyContentImages(path.join(root, 'missing'), path.join(root, 'public', 'posts-img'))).toBe(0);
  });
});
