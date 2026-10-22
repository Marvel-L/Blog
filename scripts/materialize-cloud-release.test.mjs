// @vitest-environment node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const directories = [];
const commit = 'a'.repeat(40);
const digest = (content) => createHash('sha256').update(content).digest('hex');
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

// Execute the actual production materialization block with isolated release paths.
const publisher = await readFile(new URL('../deploy/cloud/publish-ip.sh', import.meta.url), 'utf8');
const materialize = publisher.slice(
  publisher.indexOf('if [[ -e $release ]]; then'),
  publisher.indexOf("\nstage 'materialize verified release'"),
);

async function writeTree(root, files) {
  await mkdir(root, { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), content);
  }
}

const checksums = (files) =>
  Object.entries(files)
    .map(([relative, content]) => `${digest(content)}  ${relative}\n`)
    .join('');

async function fixture({ empty = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'dblog-materialize-test-'));
  directories.push(root);
  const releases = path.join(root, 'releases');
  const previous = path.join(releases, 'previous');
  const delta = path.join(root, 'delta');
  const oldFiles = {
    'dist/index.html': 'old index',
    'dist/assets/shared.js': 'shared',
    'dist/removed.html': 'removed',
  };
  const nextFiles = {
    'dist/index.html': 'new index',
    'dist/assets/shared.js': 'shared',
    'dist/assets/new.js': 'new asset',
    'dist/cloud-release.json': `${JSON.stringify({ commit, target: 'cloud' })}\n`,
  };
  const oldChecksums = checksums(oldFiles);
  await writeTree(previous, { ...oldFiles, SHA256SUMS: oldChecksums, 'archive.sha256': digest(oldChecksums) });
  const changed = Object.keys(nextFiles).filter((relative) => empty || nextFiles[relative] !== oldFiles[relative]);
  const manifest = {
    version: 1,
    base: empty ? 'empty' : previous,
    changed,
    removed: empty ? [] : ['dist/removed.html'],
  };
  const nextChecksums = checksums(nextFiles);
  await writeTree(delta, {
    ...Object.fromEntries(changed.map((relative) => [relative, nextFiles[relative]])),
    SHA256SUMS: nextChecksums,
    'DELTA.json': JSON.stringify(manifest),
  });
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  if (process.platform === 'darwin') {
    // macOS cp lacks -al; preserve the production hard-link semantics in the fixture.
    await writeFile(
      path.join(bin, 'cp'),
      `#!/bin/sh
if [ "$1" = "-al" ]; then
  exec python3 - "$2" "$3" <<'PY'
import os, pathlib, sys
source, target = map(pathlib.Path, sys.argv[1:])
for directory, _, files in os.walk(source):
    destination = target / pathlib.Path(directory).relative_to(source)
    destination.mkdir(parents=True, exist_ok=True)
    for name in files:
        os.link(pathlib.Path(directory) / name, destination / name)
PY
fi
exec /bin/cp "$@"
`,
      { mode: 0o755 },
    );
    await writeFile(path.join(bin, 'sha256sum'), '#!/bin/sh\nexec shasum -a 256 "$@"\n', { mode: 0o755 });
  }
  return {
    root,
    releases,
    previous,
    delta,
    manifest,
    oldFiles,
    nextFiles,
    oldChecksums,
    nextChecksums,
    archive: path.join(root, 'delta.tar.gz'),
    release: path.join(releases, 'next'),
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  };
}

async function publish(options) {
  await run('tar', ['-czf', options.archive, '-C', options.delta, '.'], {
    env: { ...options.env, COPYFILE_DISABLE: '1' },
  });
  // Only relocate the mktemp templates, keeping all validation and copy commands unchanged.
  const script = materialize.replaceAll('/opt/dblog/releases', options.releases);
  await run(
    'bash',
    [
      '-c',
      `set -euo pipefail
umask 077
commit=$1
archive=$2
previous=$3
release=$4
release_digest=$5
${script}`,
      'materialize',
      commit,
      options.archive,
      options.previous,
      options.release,
      digest(options.nextChecksums),
    ],
    { env: options.env },
  );
}

describe('cloud release materialization', () => {
  it('applies additions, changes and removals without modifying the baseline files or its checksum manifest', async () => {
    const options = await fixture();
    await publish(options);
    for (const [relative, content] of Object.entries(options.oldFiles)) {
      expect(await readFile(path.join(options.previous, relative), 'utf8')).toBe(content);
    }
    expect(await readFile(path.join(options.previous, 'SHA256SUMS'), 'utf8')).toBe(options.oldChecksums);
    expect(await readFile(path.join(options.previous, 'archive.sha256'), 'utf8')).toBe(digest(options.oldChecksums));
    for (const [relative, content] of Object.entries(options.nextFiles)) {
      expect(await readFile(path.join(options.release, relative), 'utf8')).toBe(content);
    }
    await expect(readFile(path.join(options.release, 'dist/removed.html'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path.join(options.release, 'SHA256SUMS'), 'utf8')).toBe(options.nextChecksums);
    const shared = 'dist/assets/shared.js';
    expect((await stat(path.join(options.release, shared))).ino).toBe(
      (await stat(path.join(options.previous, shared))).ino,
    );
    expect((await stat(path.join(options.release, 'SHA256SUMS'))).ino).not.toBe(
      (await stat(path.join(options.previous, 'SHA256SUMS'))).ino,
    );
  });

  it('materializes a complete release without reusing the baseline', async () => {
    const options = await fixture({ empty: true });
    await publish(options);
    expect(await readFile(path.join(options.release, 'SHA256SUMS'), 'utf8')).toBe(options.nextChecksums);
    const shared = 'dist/assets/shared.js';
    expect((await stat(path.join(options.release, shared))).ino).not.toBe(
      (await stat(path.join(options.previous, shared))).ino,
    );
  });

  it.each(['corrupt', 'wrong baseline', 'unsafe path', 'symlink', 'extra file'])(
    'rejects %s before creating a release and keeps the baseline immutable',
    async (failure) => {
      const options = await fixture();
      if (failure === 'corrupt') await writeFile(path.join(options.delta, 'dist/index.html'), 'corrupt');
      if (failure === 'wrong baseline') options.manifest.base = '/different/release';
      if (failure === 'unsafe path') options.manifest.changed.push('../secret');
      if (failure === 'symlink') await symlink('/etc/passwd', path.join(options.delta, 'unsafe'));
      if (failure === 'extra file') {
        await writeFile(path.join(options.delta, 'extra'), 'extra');
        options.manifest.changed.push('extra');
      }
      await writeFile(path.join(options.delta, 'DELTA.json'), JSON.stringify(options.manifest));
      await expect(publish(options)).rejects.toThrow();
      await expect(stat(options.release)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(path.join(options.previous, 'SHA256SUMS'), 'utf8')).toBe(options.oldChecksums);
      expect(await readdir(options.releases)).toEqual(['previous']);
    },
  );
});
