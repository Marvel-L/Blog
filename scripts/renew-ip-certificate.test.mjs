// @vitest-environment node
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('IP 证书强制重载', () => {
  it('证书变化时强制加载；失败不更新摘要；证书未变化不重复加载', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dblog-cert-test-'));
    try {
      const bin = join(dir, 'bin');
      mkdirSync(bin);
      const certificate = join(dir, 'fullchain.pem');
      const state = join(dir, 'loaded.sha256');
      const calls = join(dir, 'calls');
      writeFileSync(certificate, 'new certificate');
      writeFileSync(state, 'old');
      const docker = join(bin, 'docker');
      writeFileSync(docker, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\nexit "${DOCKER_EXIT:-0}"\n');
      chmodSync(docker, 0o755);
      // 仅将绝对生产资源替换为临时目录；执行真实脚本的摘要判断与重载路径。
      const source = readFileSync('deploy/cloud/renew-ip-certificate.sh', 'utf8')
        .replace(
          '/opt/dblog-tools/certbot/bin/certbot renew --cert-name 43.138.216.53 --no-random-sleep-on-renew --quiet',
          'true',
        )
        .replace('/etc/letsencrypt/live/43.138.216.53/fullchain.pem', certificate)
        .replace('/var/lib/dblog-acme/loaded-certificate.sha256', state)
        .replace('cd /opt/dblog/current', `cd '${dir}'`);
      const script = join(dir, 'renew.sh');
      writeFileSync(script, source);
      const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CALLS: calls };
      const failed = spawnSync('sh', [script], { env: { ...env, DOCKER_EXIT: '1' } });
      expect(failed.status).toBe(1);
      expect(readFileSync(state, 'utf8')).toBe('old');
      expect(readFileSync(calls, 'utf8')).toContain('caddy reload --config /etc/caddy/Caddyfile --force');
      expect(spawnSync('sh', [script], { env }).status).toBe(0);
      expect(readFileSync(state, 'utf8')).not.toBe('old');
      const before = readFileSync(calls, 'utf8');
      expect(spawnSync('sh', [script], { env }).status).toBe(0);
      expect(readFileSync(calls, 'utf8')).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
