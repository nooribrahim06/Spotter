
-- 1. BRIN Indexes (Block Range INdex)
-- Best for append-only, time-series data. Much smaller than B-Tree.
-- Used on timestamp columns that naturally increase over time.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meals_occurred_at_brin
  ON meals USING BRIN (occurred_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workouts_started_at_brin
  ON workouts USING BRIN (started_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_summaries_summary_date_brin
  ON daily_summaries USING BRIN (summary_date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_progress_entries_recorded_at_brin
  ON progress_entries USING BRIN (recorded_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_performed_at_brin
  ON audit_logs USING BRIN (performed_at);








-- 2. pg_trgm Trigram Indexes (for fuzzy/partial text search)
-- Requires: CREATE EXTENSION IF NOT EXISTS pg_trgm;


CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_foods_name_en_trgm
  ON foods USING GIN (name_en gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_foods_name_ar_trgm
  ON foods USING GIN (name_ar gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_name_en_trgm
  ON recipes USING GIN (name_en gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_name_ar_trgm
  ON recipes USING GIN (name_ar gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exercises_name_trgm
  ON exercises USING GIN (name gin_trgm_ops);



-- 3. GIN Index on JSONB columns

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_foods_aliases_gin
  ON foods USING GIN (aliases);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_aliases_gin
  ON recipes USING GIN (aliases);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exercises_instructions_gin
  ON exercises USING GIN (instructions);
