import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Explicit opt-in integration check. All fixtures are rolled back.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query('BEGIN');
try {
  const user = randomUUID(), meal = randomUUID(), item = randomUUID(), workout = randomUUID();
  const conversation = randomUUID(), message = randomUUID();
  await client.query(`INSERT INTO users (id, email, username, password_hash, timezone, updated_at)
    VALUES ($1, $2, $3, 'test', 'Africa/Cairo', NOW())`, [user, `${user}@example.test`, user.slice(0, 24)]);
  await client.query(`INSERT INTO ai_conversations (id, user_id, title, updated_at) VALUES ($1, $2, 'test', NOW())`, [conversation, user]);
  await client.query(`INSERT INTO ai_messages (id, conversation_id, role, content) VALUES ($1, $2, 'USER', 'hello')`, [message, conversation]);
  await client.query(`INSERT INTO daily_summaries (id, user_id, summary_date, target_calories, updated_at)
    VALUES ($1, $2, '2026-09-18', 2200, NOW()), ($3, $2, '2026-09-19', 2200, NOW())`, [randomUUID(), user, randomUUID()]);
  const read = async (date = '2026-09-18') => (await client.query('SELECT * FROM daily_summaries WHERE user_id=$1 AND summary_date=$2', [user, date])).rows[0];
  assert.equal(Number((await read()).remaining_calories), 2200);
  // UTC is still the 17th; Cairo's local calendar date is the 18th.
  await client.query(`INSERT INTO meals (id, user_id, meal_type, occurred_at, updated_at)
    VALUES ($1, $2, 'DINNER', '2026-09-17T22:30:00Z', NOW())`, [meal, user]);
  await client.query(`INSERT INTO meal_items (id, meal_id, item_type, item_name, order_index, calories, protein_grams, carbohydrate_grams, fat_grams)
    VALUES ($1, $2, 'QUICK', 'test', 0, 500, 30, 50, 20)`, [item, meal]);
  assert.equal(Number((await read()).consumed_calories), 500);
  assert.equal((await read()).meal_count, 1);
  await client.query(`UPDATE meal_items SET calories=600 WHERE id=$1`, [item]);
  assert.equal(Number((await read()).consumed_calories), 600);
  await client.query(`INSERT INTO workouts (id, user_id, status, started_at, estimated_calories_burned, updated_at)
    VALUES ($1, $2, 'COMPLETED', '2026-09-17T22:30:00Z', 200, NOW())`, [workout, user]);
  assert.equal(Number((await read()).remaining_calories), 1800);
  assert.equal((await read()).workout_completed, true);
  await client.query(`UPDATE meals SET occurred_at='2026-09-19T12:00:00Z' WHERE id=$1`, [meal]);
  assert.equal(Number((await read()).consumed_calories), 0);
  assert.equal(Number((await read('2026-09-19')).consumed_calories), 600);
  await client.query('DELETE FROM meal_items WHERE id=$1', [item]);
  assert.equal(Number((await read('2026-09-19')).consumed_calories), 0);
  assert.equal((await read('2026-09-19')).meal_count, 1);
  await client.query('DELETE FROM meals WHERE id=$1', [meal]);
  assert.equal((await read('2026-09-19')).meal_count, 0);
  await client.query('DELETE FROM workouts WHERE id=$1', [workout]);
  assert.equal((await read()).burned_calories, 0);
  assert.equal((await read()).workout_count, 0);
  await client.query('DELETE FROM users WHERE id=$1', [user]);
  assert.equal((await client.query('SELECT id FROM ai_messages WHERE id=$1', [message])).rowCount, 0);
  assert.equal((await client.query('SELECT id FROM daily_summaries WHERE user_id=$1', [user])).rowCount, 0);
  console.log('Database checks passed: chat cascades, local dates, summary initialization, meal/item edits and deletes, workouts, and user deletion.');
} finally {
  await client.query('ROLLBACK');
  await client.end();
}
