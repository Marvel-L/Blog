// @vitest-environment node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { packageCloudRelease } from './package-cloud-release.mjs';

const run = promisify(execFile);
const directories = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(cloud = true) {
  const root = await mkdtemp(path.join(tmpdir(), 'dblog-package-test-'));
  directories.push(root);
  const files = {
    '.dockerignore': '.env\nnode_modules\n',
    'package.json': '{}',
    'package-lock.json': '{}',
    'packages/server/cmd/server/main.go': 'package main',
    'packages/server/go.mod': 'module github.com/Marvel-L/Blog/packages/server',
    'packages/server/go.sum': 'test checksum',
    'packages/server/migrations/001_initial.sql': 'CREATE TABLE users(id uuid PRIMARY KEY);',
    'packages/blog/package.json': '{"name":"@d-blog/blog"}',
    'packages/blog/src/App.tsx': 'frontend source must not be shipped to the API build',
    'packages/project-notes/package.json': '{}',
    'deploy/cloud/compose.yml': 'name: dblog-cloud',
    'deploy/cloud/.env.example': 'GITHUB_CLIENT_SECRET=',
    'posts/private-draft.md': 'must not be packaged',
    'temp/private-repository.zip': 'must not be packaged',
  };
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), content);
  }
  await run('git', ['init', '--quiet'], { cwd: root });
  await run('git', ['add', '.'], { cwd: root });
  await run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture'], {
    cwd: root,
  });
  const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: root });
  const commit = stdout.trim();
  const dist = path.join(root, 'dist');
  await mkdir(path.join(dist, 'assets'), { recursive: true });
  await writeFile(path.join(dist, 'index.html'), '<a href="/Blog/post/leetCode-hot-100">LeetCode Hot 100</a>');
  await writeFile(path.join(dist, 'assets/index-a.js'), 'console.log("blog")');
  if (cloud) await writeFile(path.join(dist, 'assets/CloudAccount-a.js'), 'fetch("/api/v1/me")');
  await writeFile(path.join(root, '.env'), 'SECRET=private');
  return { root, dist, commit, output: path.join(root, 'release.tar.gz') };
}

describe('cloud release packaging', () => {
  it('packages the latest article and exact committed API, with verifiable checksums and no local secrets', async () => {
    const options = await fixture();
    await writeFile(path.join(options.root, 'packages/server/cmd/server/main.go'), 'uncommitted change');
    await packageCloudRelease(options);
    const unpacked = path.join(options.root, 'unpacked');
    await mkdir(unpacked);
    await run('tar', ['-xzf', options.output, '-C', unpacked]);
    expect(await readFile(path.join(unpacked, 'dist/index.html'), 'utf8')).toContain('LeetCode Hot 100');
    expect(await readFile(path.join(unpacked, 'packages/server/go.mod'), 'utf8')).toContain(
      'module github.com/Marvel-L/Blog/packages/server',
    );
    await expect(readFile(path.join(unpacked, 'packages/blog/package.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(path.join(unpacked, 'package-lock.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(path.join(unpacked, 'packages/blog/src/App.tsx'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path.join(unpacked, 'packages/server/cmd/server/main.go'), 'utf8')).toBe('package main');
    expect(JSON.parse(await readFile(path.join(unpacked, 'dist/cloud-release.json'), 'utf8'))).toEqual({
      commit: options.commit,
      target: 'cloud',
    });
    for (const relative of ['.env', 'posts/private-draft.md', 'temp/private-repository.zip']) {
      await expect(readFile(path.join(unpacked, relative))).rejects.toMatchObject({ code: 'ENOENT' });
    }
    const lines = (await readFile(path.join(unpacked, 'SHA256SUMS'), 'utf8')).trim().split('\n');
    for (const line of lines) {
      const [hash, relative] = line.split('  ');
      expect(
        createHash('sha256')
          .update(await readFile(path.join(unpacked, relative)))
          .digest('hex'),
      ).toBe(hash);
    }
  });

  it('includes only checksummed files, without platform-generated archive metadata', async () => {
    const options = await fixture();
    await packageCloudRelease(options);
    const { stdout: contents } = await run('tar', ['-tzf', options.output]);
    const { stdout: sums } = await run('tar', ['-xOzf', options.output, './SHA256SUMS']);
    const actual = contents
      .trim()
      .split('\n')
      .filter((name) => !name.endsWith('/'))
      .map((name) => name.replace(/^\.\//, ''))
      .sort();
    const expected = [
      ...sums
        .trim()
        .split('\n')
        .map((line) => line.split('  ')[1]),
      'SHA256SUMS',
    ].sort();
    expect(actual).toEqual(expected);
  });

  it('rejects a Pages artifact so publishing cannot remove cloud account functionality', async () => {
    await expect(packageCloudRelease(await fixture(false))).rejects.toThrow('隔离检查失败');
  });

  it('rejects invalid commits and symlinks without generating an archive', async () => {
    const options = await fixture();
    await expect(packageCloudRelease({ ...options, commit: '--output=/tmp/other' })).rejects.toThrow('40 位');
    await symlink(path.join(options.root, '.env'), path.join(options.dist, 'secret'));
    await expect(packageCloudRelease(options)).rejects.toThrow('符号链接');
    await expect(readFile(options.output)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
