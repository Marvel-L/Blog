import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { loadConfig } from './config.js';
import { Store } from './store.js';
import { createApp } from './app.js';

export async function start() {
  const config = loadConfig();
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 5,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  pool.on('error', () => console.error('数据库连接异常'));
  const store = new Store(async (sql, values) => (await pool.query(sql, values)).rows);
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await store.ready(); // Fail fast if database is unavailable or has not been migrated.
    app = await createApp(config, store);
    app.addHook('onClose', async () => {
      await pool.end();
    });
    await store.cleanup();
    const cleanup = setInterval(() => {
      void store.cleanup().catch(() => console.error('过期数据清理失败'));
    }, 3600000);
    cleanup.unref();
    app.addHook('onClose', async () => {
      clearInterval(cleanup);
    });
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`API 已启动，端口 ${config.port}`);
    const server = app;
    const shutdown = () => {
      void server.close().catch(() => {
        process.exitCode = 1;
      });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    return app;
  } catch (error) {
    if (app) await app.close();
    else await pool.end();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await start();
  } catch {
    console.error('API 启动失败，请检查配置、数据库和迁移；未输出连接凭据');
    process.exitCode = 1;
  }
}
