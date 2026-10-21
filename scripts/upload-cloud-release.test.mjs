// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const directories = [];
const script = new URL('../deploy/cloud/upload-ip.sh', import.meta.url).pathname;
const commit = 'a'.repeat(40);
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(size = 5 * 1024 * 1024) {
  const root = await mkdtemp(path.join(tmpdir(), 'dblog-upload-test-'));
  directories.push(root);
  const bin = path.join(root, 'bin');
  const remote = path.join(root, 'remote');
  await mkdir(bin);
  await mkdir(remote);
  const archive = path.join(root, 'release.tar.gz');
  const data = Buffer.alloc(size);
  for (let index = 0; index < size; index++) data[index] = Math.floor(index / 1009) % 251;
  await writeFile(archive, data);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    TEST_REMOTE: remote,
    TEST_LOG: path.join(root, 'publish.json'),
    CLOUD_SSH_KEY_FILE: path.join(root, 'key'),
    CLOUD_SSH_KNOWN_HOSTS_FILE: path.join(root, 'known_hosts'),
  };
  const ssh = `#!${process.execPath}
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
if (!args.includes('StrictHostKeyChecking=yes') || !args.includes('BatchMode=yes')) process.exit(90);
const command = args.at(-1);
if (command.startsWith('sudo -n bash')) {
  fs.writeFileSync(process.env.TEST_LOG, JSON.stringify({
    command,
    archiveExists: fs.existsSync(process.env.TEST_REMOTE + '/${commit}.tar.gz')
  }));
  process.exit(0);
}
const result = spawnSync('bash', ['-c', command.replaceAll('/home/ubuntu/dblog-deploy', process.env.TEST_REMOTE)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
`;
  const scp = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const source = args.at(-2);
const part = path.basename(source);
if (part === process.env.TEST_FAIL_PART) process.exit(1);
const destination = args.at(-1).split(':').slice(1).join(':').replace('/home/ubuntu/dblog-deploy', process.env.TEST_REMOTE);
// Finish out of order to exercise ordered assembly.
setTimeout(() => {
  fs.copyFileSync(source, destination);
  if (part === process.env.TEST_CORRUPT_PART) fs.appendFileSync(destination, 'corrupt');
}, part.endsWith('a') ? 40 : 5);
`;
  await writeFile(path.join(bin, 'ssh'), ssh, { mode: 0o755 });
  await writeFile(path.join(bin, 'scp'), scp, { mode: 0o755 });
  if (process.platform === 'darwin') {
    await writeFile(path.join(bin, 'sha256sum'), '#!/bin/sh\nexec shasum -a 256 "$@"\n', { mode: 0o755 });
  }
  return { root, remote, archive, data, env };
}

describe('cloud release upload', () => {
  it('reassembles more than one batch in order and publishes only the verified archive', async () => {
    const options = await fixture(18 * 1024 * 1024 + 17);
    await run('bash', [script, commit, options.archive], { env: options.env });
    expect((await readFile(path.join(options.remote, `${commit}.tar.gz`))).equals(options.data)).toBe(true);
    expect(JSON.parse(await readFile(options.env.TEST_LOG, 'utf8'))).toMatchObject({ archiveExists: true });
    expect((await readdir(options.remote)).filter((name) => name.startsWith('.'))).toEqual([]);
  });

  it('does not publish or replace an existing archive when any upload fails', async () => {
    const options = await fixture();
    const published = path.join(options.remote, `${commit}.tar.gz`);
    await writeFile(published, 'previous');
    await expect(
      run('bash', [script, commit, options.archive], {
        env: { ...options.env, TEST_FAIL_PART: 'part-ab' },
      }),
    ).rejects.toThrow();
    expect(await readFile(published, 'utf8')).toBe('previous');
    await expect(readFile(options.env.TEST_LOG)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await readdir(options.remote)).filter((name) => name.startsWith('.'))).toEqual([]);
  });

  it('rejects corrupt assembly before publication and cleans temporary parts', async () => {
    const options = await fixture();
    await expect(
      run('bash', [script, commit, options.archive], {
        env: { ...options.env, TEST_CORRUPT_PART: 'part-aa' },
      }),
    ).rejects.toThrow();
    await expect(readFile(path.join(options.remote, `${commit}.tar.gz`))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(options.env.TEST_LOG)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(options.remote)).toEqual([]);
  });

  it('rejects invalid release arguments without connecting', async () => {
    const options = await fixture(17);
    await expect(run('bash', [script, '--invalid', options.archive], { env: options.env })).rejects.toThrow();
    expect(await readdir(options.remote)).toEqual([]);
  });
});
