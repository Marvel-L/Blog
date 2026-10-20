// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditDeployment } from './audit-deployment.mjs';

const directories = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
async function fixture(cloud = false) {
  const root = await mkdtemp(path.join(tmpdir(), 'dblog-deployment-'));
  directories.push(root);
  await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'assets', 'index-a.js'), 'console.log("blog")');
  if (cloud) await writeFile(path.join(root, 'assets', 'CloudAccount-a.js'), 'fetch("/api/v1/me")');
  return root;
}

describe('release isolation audit', () => {
  it('accepts a static release and rejects accidental account code leakage', async () => {
    expect(await auditDeployment('pages', await fixture())).toEqual({
      target: 'pages',
      hasCloudChunk: false,
      hasCloudApi: false,
    });
    await expect(auditDeployment('pages', await fixture(true))).rejects.toThrow('隔离检查失败');
  });
  it('fails a cloud release whose cloud functionality was not built', async () => {
    expect((await auditDeployment('cloud', await fixture(true))).hasCloudApi).toBe(true);
    await expect(auditDeployment('cloud', await fixture())).rejects.toThrow('隔离检查失败');
  });
  it('fails unknown targets and missing build output', async () => {
    await expect(auditDeployment('typo', await fixture())).rejects.toThrow('VITE_DEPLOY_TARGET');
    const root = await fixture();
    await rm(path.join(root, 'assets'), { recursive: true });
    await expect(auditDeployment('pages', root)).rejects.toThrow();
  });
});
