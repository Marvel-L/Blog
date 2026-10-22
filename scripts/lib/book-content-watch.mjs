import path from 'node:path';
import { BOOKS_ROOT, loadBookPackages, writeBookData } from './book-content.mjs';

/**
 * Refresh only Book data when authors add, edit or remove local content.
 * @param {{ root?: string, dataFile?: string }} options
 * @returns {import('vite').Plugin}
 */
export const watchBookContent = ({ root = BOOKS_ROOT, dataFile } = {}) => {
  root = path.resolve(root);
  let cleanup;
  return {
    name: 'watch-book-content',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(root);
      const refresh = (event, filename) => {
        const absolute = path.resolve(filename);
        if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) return;
        if (
          !['addDir', 'unlinkDir'].includes(event) &&
          !absolute.endsWith('.md') &&
          !['config.json', 'config.yaml', 'config.yml'].includes(path.basename(absolute))
        ) {
          return;
        }
        try {
          writeBookData(loadBookPackages(root), dataFile);
        } catch (error) {
          server.config.logger.error(error.message);
          server.ws.send({ type: 'error', err: { message: error.message, stack: error.stack ?? '' } });
        }
      };
      server.watcher.on('all', refresh);
      cleanup = () => server.watcher.off('all', refresh);
      server.httpServer?.once('close', cleanup);
    },
    closeBundle() {
      cleanup?.();
    },
  };
};
