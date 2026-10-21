import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { auditDeployment } from './audit-deployment.mjs';

const run = promisify(execFile);
const sourcePaths = ['.dockerignore', 'packages/server', 'deploy/cloud'];

async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of (await readdir(directory)).sort()) {
    const relative = prefix ? `${prefix}/${entry}` : entry;
    if (/[\r\n\\]/.test(relative)) throw new Error('发布文件名不能包含换行或反斜杠');
    const absolute = path.join(directory, entry);
    const stat = await lstat(absolute);
    if (stat.isDirectory()) files.push(...(await listFiles(absolute, relative)));
    else if (stat.isFile()) files.push(relative);
    else throw new Error('发布包不能包含符号链接或特殊文件');
  }
  return files;
}

/** Bundle only deployment sources and the audited cloud artifact from one commit. */
export async function packageCloudRelease({
  commit,
  output,
  root = fileURLToPath(new URL('../', import.meta.url)),
  dist = path.join(root, 'dist'),
}) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('发布提交必须为完整的 40 位 Git SHA');
  await auditDeployment('cloud', dist);
  const scratch = await mkdtemp(path.join(tmpdir(), 'dblog-release-'));
  try {
    const release = path.join(scratch, 'release');
    await mkdir(release);
    const sourceArchive = path.join(scratch, 'source.tar');
    await run('git', ['archive', '--format=tar', `--output=${sourceArchive}`, commit, '--', ...sourcePaths], {
      cwd: root,
    });
    await run('tar', ['-xf', sourceArchive, '-C', release]);
    // Source archives must not bring local credentials, caches or compiled API files.
    for (const relative of await listFiles(release)) {
      if (
        /(^|\/)(node_modules|dist|\.git)(\/|$)/.test(relative) ||
        (/(^|\/)\.env($|\.)/.test(relative) && !relative.endsWith('/.env.example'))
      ) {
        throw new Error('发布源码包含环境凭据或构建缓存');
      }
    }
    // Check the original tree before cp, which would otherwise dereference a symlink.
    await listFiles(dist);
    await cp(dist, path.join(release, 'dist'), { recursive: true });
    await writeFile(path.join(release, 'dist/cloud-release.json'), `${JSON.stringify({ commit, target: 'cloud' })}\n`);
    const sums = [];
    for (const relative of await listFiles(release)) {
      const hash = createHash('sha256')
        .update(await readFile(path.join(release, relative)))
        .digest('hex');
      sums.push(`${hash}  ${relative}`);
    }
    await writeFile(path.join(release, 'SHA256SUMS'), `${sums.join('\n')}\n`);
    const absoluteOutput = path.resolve(output);
    await mkdir(path.dirname(absoluteOutput), { recursive: true });
    // macOS tar otherwise synthesizes AppleDouble files absent from SHA256SUMS.
    await run('tar', ['-czf', absoluteOutput, '-C', release, '.'], {
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    });
    return { commit, output: absoluteOutput, files: sums.length };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await packageCloudRelease({ commit: process.argv[2], output: process.argv[3] });
    console.log(`云端发布包已生成：${result.commit}，${result.files} 个文件`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : '云端发布包生成失败');
    process.exitCode = 1;
  }
}
