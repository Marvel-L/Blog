// @vitest-environment node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { createCloudDelta, parseChecksums } from './create-cloud-delta.mjs';

const run = promisify(execFile);
const directories = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const digest = (content) => createHash('sha256').update(content).digest('hex');

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'dblog-delta-test-'));
  directories.push(root);
  const full = path.join(root, 'full');
  await mkdir(path.join(full, 'dist/assets'), { recursive: true });
  await mkdir(path.join(full, 'packages/server'), { recursive: true });
  const files = {
    'dist/index.html': 'new index',
    'dist/assets/shared.js': 'unchanged',
    'packages/server/main.go': 'package main',
  };
  for (const [relative, content] of Object.entries(files)) await writeFile(path.join(full, relative), content);
  const sums = Object.entries(files)
    .map(([relative, content]) => `${digest(content)}  ${relative}`)
    .join('\n');
  await writeFile(path.join(full, 'SHA256SUMS'), `${sums}\n`);
  const archive = path.join(root, 'full.tar.gz');
  await run('tar', ['-czf', archive, '-C', full, '.']);
  return { root, archive, output: path.join(root, 'delta.tar.gz'), files };
}

describe('cloud delta packaging', () => {
  it('packages only changed files and records removals while preserving the complete checksum manifest', async () => {
    const options = await fixture();
    const current = [
      `${digest('old index')}  dist/index.html`,
      `${digest('unchanged')}  dist/assets/shared.js`,
      `${digest('removed')}  dist/old.html`,
      `${digest('package main')}  packages/server/main.go`,
      '',
    ].join('\n');
    const result = await createCloudDelta({
      currentChecksums: current,
      baseRelease: '/opt/dblog/releases/base-release',
      fullArchive: options.archive,
      output: options.output,
    });
    expect(result).toEqual({ base: '/opt/dblog/releases/base-release', changed: 1, removed: 1, total: 3 });
    const unpacked = path.join(options.root, 'unpacked');
    await mkdir(unpacked);
    await run('tar', ['-xzf', options.output, '-C', unpacked]);
    expect(await readFile(path.join(unpacked, 'dist/index.html'), 'utf8')).toBe('new index');
    await expect(readFile(path.join(unpacked, 'dist/assets/shared.js'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.parse(await readFile(path.join(unpacked, 'DELTA.json'), 'utf8'))).toEqual({
      version: 1,
      base: '/opt/dblog/releases/base-release',
      changed: ['dist/index.html'],
      removed: ['dist/old.html'],
    });
    expect(parseChecksums(await readFile(path.join(unpacked, 'SHA256SUMS'), 'utf8')).size).toBe(3);
  });

  it('falls back to a complete delta when no trusted baseline exists', async () => {
    const options = await fixture();
    const result = await createCloudDelta({ fullArchive: options.archive, output: options.output });
    expect(result).toEqual({ base: 'empty', changed: 3, removed: 0, total: 3 });
  });

  it('rejects unsafe and duplicate checksum paths', () => {
    expect(() => parseChecksums(`${'a'.repeat(64)}  ../secret\n`)).toThrow('不安全路径');
    expect(() => parseChecksums(`${'a'.repeat(64)}  file\n${'b'.repeat(64)}  file\n`)).toThrow('重复路径');
  });
});
