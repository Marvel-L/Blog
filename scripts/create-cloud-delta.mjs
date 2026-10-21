import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const checksumPattern = /^([a-f0-9]{64}) {2}([^\r\n]+)$/;

export function parseChecksums(text) {
  const sums = new Map();
  for (const line of text.trim().split('\n')) {
    const match = checksumPattern.exec(line);
    if (!match) throw new Error('SHA256SUMS 格式无效');
    if (path.posix.isAbsolute(match[2]) || match[2].split('/').includes('..') || match[2] === 'SHA256SUMS') {
      throw new Error('SHA256SUMS 包含不安全路径');
    }
    if (sums.has(match[2])) throw new Error('SHA256SUMS 包含重复路径');
    sums.set(match[2], match[1]);
  }
  return sums;
}

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function validateTree(directory, expected) {
  for (const [relative, digest] of expected) {
    const file = path.join(directory, relative);
    const stat = await lstat(file);
    if (!stat.isFile()) throw new Error(`发布文件不是普通文件：${relative}`);
    if ((await hashFile(file)) !== digest) throw new Error(`发布文件校验失败：${relative}`);
  }
}

export async function createCloudDelta({ currentChecksums = '', baseRelease = '', fullArchive, output }) {
  const scratch = await mkdtemp(path.join(tmpdir(), 'dblog-delta-'));
  try {
    const full = path.join(scratch, 'full');
    const delta = path.join(scratch, 'delta');
    await mkdir(full);
    await mkdir(delta);
    await run('tar', ['-xzf', fullArchive, '-C', full]);
    const nextText = await readFile(path.join(full, 'SHA256SUMS'), 'utf8');
    const next = parseChecksums(nextText);
    const current = currentChecksums.trim() ? parseChecksums(currentChecksums) : new Map();
    await validateTree(full, next);

    const changed = [];
    for (const [relative, digest] of next) {
      if (current.get(relative) !== digest) {
        changed.push(relative);
        await mkdir(path.dirname(path.join(delta, relative)), { recursive: true });
        await cp(path.join(full, relative), path.join(delta, relative));
      }
    }
    const removed = [...current.keys()].filter((relative) => !next.has(relative)).sort();
    const base = current.size && baseRelease ? baseRelease : 'empty';
    await writeFile(path.join(delta, 'SHA256SUMS'), nextText);
    await writeFile(path.join(delta, 'DELTA.json'), `${JSON.stringify({ version: 1, base, changed, removed })}\n`);
    await mkdir(path.dirname(path.resolve(output)), { recursive: true });
    await run('tar', ['-czf', path.resolve(output), '-C', delta, '.'], {
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    });
    return { changed: changed.length, removed: removed.length, total: next.size, base };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const currentFile = process.argv[2];
    const baseRelease = process.argv[3] || '';
    const currentChecksums = currentFile ? await readFile(currentFile, 'utf8') : '';
    const result = await createCloudDelta({
      currentChecksums,
      baseRelease,
      fullArchive: process.argv[4],
      output: process.argv[5],
    });
    console.log(
      `云端差异包已生成：基线 ${result.base}，变更 ${result.changed}，删除 ${result.removed}，总文件 ${result.total}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : '云端差异包生成失败');
    process.exitCode = 1;
  }
}
