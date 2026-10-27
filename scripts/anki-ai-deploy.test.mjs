// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it('Anki AI 主密钥只初始化一次，保护已有密文并注入 API 容器', async () => {
  const { stderr } = await promisify(execFile)(
    'python3',
    ['-B', '-m', 'unittest', 'discover', '-s', 'deploy/cloud/tests', '-p', 'test_anki_ai_key.py', '-v'],
    { cwd: new URL('..', import.meta.url), timeout: 10000 },
  );
  expect(stderr).toContain('Ran 4 tests');
  expect(stderr).toContain('OK');
});
