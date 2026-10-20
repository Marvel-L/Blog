import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

/** Dedicated connection and transaction lock serialize concurrent migration runners. */
export async function migrate(databaseUrl: string) {
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(7102026)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const directory = new URL('../migrations/', import.meta.url);
    const files = (await readdir(directory)).filter((name) => /^\d+_[a-z_]+\.sql$/.test(name)).sort();
    for (const name of files) {
      const existing = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (existing.rows.length) continue;
      await client.query(await readFile(new URL(name, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
    await migrate(process.env.DATABASE_URL);
    console.log('数据库迁移完成');
  } catch {
    console.error('数据库迁移失败，请检查数据库连接及迁移文件（未输出连接凭据）');
    process.exitCode = 1;
  }
}
