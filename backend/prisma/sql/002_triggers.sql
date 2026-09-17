-- AuditLog is reserved for future use; automatic audit triggers are not enabled.
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
