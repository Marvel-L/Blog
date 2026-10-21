// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it('verifies encrypted backup publication, failure handling and isolated restore behavior', async () => {
  const { stderr } = await promisify(execFile)(
    'python3',
    ['-B', '-m', 'unittest', 'discover', '-s', 'deploy/cloud/tests', '-p', 'test_backup.py', '-v'],
    { cwd: new URL('..', import.meta.url), timeout: 30000 },
  );
  expect(stderr).toContain('Ran 12 tests');
  expect(stderr).toMatch(/\bOK\b/);
});
