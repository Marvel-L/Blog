import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const commands = {
  dev: ['run', './cmd/server'],
  migrate: ['run', './cmd/server', 'migrate'],
  build: ['build', '-trimpath', '-o', 'dist/dblog-server', './cmd/server'],
  typecheck: ['vet', './...'],
  test: ['test', '-race', '-count=1', '-v', './...'],
};
const args = commands[process.argv[2]];
if (!args) throw new Error('Unknown Go task');
if (process.argv[2] === 'build') mkdirSync('dist', { recursive: true });
const result = spawnSync('go', [...args, ...process.argv.slice(3)], { stdio: 'inherit', env: process.env });
if (result.error) console.error('Go 工具链不可用，请按照 packages/server/README.md 安装 Go。');
process.exitCode = result.status ?? 1;
