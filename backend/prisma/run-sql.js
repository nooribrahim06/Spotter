import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const indexes = await readFile(new URL('./sql/001_indexes.sql', import.meta.url), 'utf8');
  // Concurrent indexes must run individually, outside a transaction block.
  for (const statement of indexes.replace(/--[^\n]*/g, '').split(';')) {
    if (statement.trim()) await client.query(statement);
  }
  const triggers = await readFile(new URL('./sql/002_triggers.sql', import.meta.url), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(triggers);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  console.log('Indexes and triggers applied successfully.');
} catch (error) {
  console.error('SQL setup failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
