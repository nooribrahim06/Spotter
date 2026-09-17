-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "daily_summaries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "summary_date" DATE NOT NULL,
    "target_calories" INTEGER NOT NULL,
    "consumed_calories" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "consumed_protein" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "consumed_carbs" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "consumed_fat" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "burned_calories" INTEGER NOT NULL DEFAULT 0,
    "remaining_calories" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "meal_count" INTEGER NOT NULL DEFAULT 0,
    "workout_count" INTEGER NOT NULL DEFAULT 0,
    "workout_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "context" JSONB,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_summaries_user_id_summary_date_key" ON "daily_summaries"("user_id", "summary_date");

-- AddForeignKey
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Additional indexes and compatible summary triggers.

-- 1. BRIN Indexes (Block Range INdex)
-- Best for append-only, time-series data. Much smaller than B-Tree.
-- Used on timestamp columns that naturally increase over time.

CREATE INDEX IF NOT EXISTS idx_meals_occurred_at_brin
  ON meals USING BRIN (occurred_at);

CREATE INDEX IF NOT EXISTS idx_workouts_started_at_brin
  ON workouts USING BRIN (started_at);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_summary_date_brin
  ON daily_summaries USING BRIN (summary_date);

CREATE INDEX IF NOT EXISTS idx_progress_entries_recorded_at_brin
  ON progress_entries USING BRIN (recorded_at);

-- Audit-log index omitted: AuditLog is outside the retained schema.








-- 2. pg_trgm Trigram Indexes (for fuzzy/partial text search)
-- Requires: CREATE EXTENSION IF NOT EXISTS pg_trgm;


CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_foods_name_en_trgm
  ON foods USING GIN (name_en gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_foods_name_ar_trgm
  ON foods USING GIN (name_ar gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_recipes_name_en_trgm
  ON recipes USING GIN (name_en gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_recipes_name_ar_trgm
  ON recipes USING GIN (name_ar gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_exercises_name_trgm
  ON exercises USING GIN (name gin_trgm_ops);



-- 3. GIN Index on JSONB columns

CREATE INDEX IF NOT EXISTS idx_foods_aliases_gin
  ON foods USING GIN (aliases);

CREATE INDEX IF NOT EXISTS idx_recipes_aliases_gin
  ON recipes USING GIN (aliases);

CREATE INDEX IF NOT EXISTS idx_exercises_instructions_gin
  ON exercises USING GIN (instructions);

-- Audit triggers are intentionally omitted: the retained schema has no AuditLog.
-- DailySummary is a cache. The application owns target_calories and creates rows;
-- triggers refresh activity only for existing rows, without inventing a target.
-- The existing daily-summary API continues calculating its response from source data.
CREATE OR REPLACE FUNCTION fn_refresh_daily_summary_for_user(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_timezone TEXT;
BEGIN
  SELECT timezone INTO v_timezone FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_timezone IS NULL THEN RETURN; END IF;

  UPDATE daily_summaries ds SET
    consumed_calories = totals.calories,
    consumed_protein = totals.protein,
    consumed_carbs = totals.carbs,
    consumed_fat = totals.fat,
    meal_count = totals.meals,
    burned_calories = totals.burned,
    workout_count = totals.workouts,
    workout_completed = totals.completed,
    remaining_calories = ds.target_calories - totals.calories + totals.burned,
    updated_at = NOW()
  FROM (
    SELECT s.id,
      COALESCE(n.calories, 0) AS calories,
      COALESCE(n.protein, 0) AS protein,
      COALESCE(n.carbs, 0) AS carbs,
      COALESCE(n.fat, 0) AS fat,
      n.meals, w.burned, w.workouts, w.completed
    FROM daily_summaries s
    CROSS JOIN LATERAL (
      SELECT SUM(mi.calories) AS calories, SUM(mi.protein_grams) AS protein,
        SUM(mi.carbohydrate_grams) AS carbs, SUM(mi.fat_grams) AS fat,
        COUNT(DISTINCT m.id)::INTEGER AS meals
      FROM meals m LEFT JOIN meal_items mi ON mi.meal_id = m.id
      WHERE m.user_id = p_user_id
        AND (m.occurred_at AT TIME ZONE v_timezone)::DATE = s.summary_date
    ) n
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(estimated_calories_burned) FILTER (WHERE status = 'COMPLETED'), 0)::INTEGER AS burned,
        COUNT(*)::INTEGER AS workouts,
        COALESCE(BOOL_OR(status = 'COMPLETED'), FALSE) AS completed
      FROM workouts
      WHERE user_id = p_user_id
        AND (started_at AT TIME ZONE v_timezone)::DATE = s.summary_date
    ) w
    WHERE s.user_id = p_user_id
  ) totals
  WHERE ds.id = totals.id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_refresh_daily_summary()
RETURNS TRIGGER AS $$
DECLARE
  v_old_user UUID;
  v_new_user UUID;
  v_user UUID;
BEGIN
  IF TG_TABLE_NAME = 'meal_items' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT user_id INTO v_old_user FROM meals WHERE id = OLD.meal_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT user_id INTO v_new_user FROM meals WHERE id = NEW.meal_id;
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN v_old_user := OLD.user_id; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_user := NEW.user_id; END IF;
  END IF;
  -- Stable lock order for rows moved between owners.
  FOR v_user IN SELECT DISTINCT id FROM unnest(ARRAY[v_old_user, v_new_user]) AS u(id)
    WHERE id IS NOT NULL ORDER BY id
  LOOP
    PERFORM fn_refresh_daily_summary_for_user(v_user);
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_meal_items_summary
  AFTER INSERT OR UPDATE OR DELETE ON meal_items
  FOR EACH ROW EXECUTE FUNCTION fn_refresh_daily_summary();

CREATE OR REPLACE TRIGGER trg_meals_summary
  AFTER INSERT OR UPDATE OR DELETE ON meals
  FOR EACH ROW EXECUTE FUNCTION fn_refresh_daily_summary();

CREATE OR REPLACE TRIGGER trg_workouts_summary
  AFTER INSERT OR UPDATE OR DELETE ON workouts
  FOR EACH ROW EXECUTE FUNCTION fn_refresh_daily_summary();

CREATE OR REPLACE TRIGGER trg_daily_summaries_initialize
  AFTER INSERT OR UPDATE OF target_calories, summary_date, user_id ON daily_summaries
  FOR EACH ROW EXECUTE FUNCTION fn_refresh_daily_summary();
