// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchBookContent } from './book-content-watch.mjs';

let directory;
afterEach(() => {
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('Book authoring in the dev server', () => {
  it('updates the snapshot on file events, reports config errors and cleans up the listener', () => {
    directory = fs.mkdtempSync(path.join(tmpdir(), 'dblog-book-watch-'));
    const root = path.join(directory, 'books');
    const dataFile = path.join(directory, 'generated/books.json');
    fs.mkdirSync(path.join(root, 'local'), { recursive: true });
    const source = path.join(root, 'local/intro.md');
    const config = path.join(root, 'local/config.yaml');
    const watcher = new EventEmitter();
    watcher.add = vi.fn();
    const server = {
      watcher,
      httpServer: new EventEmitter(),
      ws: { send: vi.fn() },
      config: { logger: { error: vi.fn() } },
    };
    const plugin = watchBookContent({ root, dataFile });
    plugin.configureServer(server);
    expect(watcher.add).toHaveBeenCalledWith(root);
    fs.writeFileSync(source, '# First');
    watcher.emit('all', 'add', source);
    expect(JSON.parse(fs.readFileSync(dataFile, 'utf8'))[0].chapters[0].content).toBe('# First');
    fs.writeFileSync(source, '# Edited');
    watcher.emit('all', 'change', source);
    expect(JSON.parse(fs.readFileSync(dataFile, 'utf8'))[0].chapters[0].content).toBe('# Edited');
    fs.writeFileSync(config, 'name: [');
    watcher.emit('all', 'add', config);
    expect(server.ws.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        err: expect.objectContaining({ message: expect.stringContaining(config) }),
      }),
    );
    fs.writeFileSync(config, 'name: 本地手册');
    watcher.emit('all', 'change', config);
    expect(JSON.parse(fs.readFileSync(dataFile, 'utf8'))[0].name).toBe('本地手册');
    fs.unlinkSync(source);
    watcher.emit('all', 'unlink', source);
    expect(JSON.parse(fs.readFileSync(dataFile, 'utf8'))[0].chapters).toEqual([]);
    server.httpServer.emit('close');
    expect(watcher.listenerCount('all')).toBe(0);
    plugin.closeBundle();
  });
});
