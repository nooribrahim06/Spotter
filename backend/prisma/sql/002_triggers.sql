
-- 1. AUDIT LOG TRIGGER
-- Auto logs INSERT/UPDATE/DELETE on important tables.

CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_old_values JSONB;
  v_new_values JSONB;
BEGIN

  IF TG_OP = 'DELETE' THEN
    v_user_id := CASE WHEN OLD ? 'user_id' THEN (OLD->>'user_id')::UUID ELSE NULL END;
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_user_id := CASE WHEN NEW ? 'user_id' THEN (NEW->>'user_id')::UUID ELSE NULL END;
    v_old_values := NULL;
    v_new_values := to_jsonb(NEW);
  ELSE -- UPDATE
    v_user_id := CASE WHEN NEW ? 'user_id' THEN (NEW->>'user_id')::UUID ELSE NULL END;
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
  END IF;


  INSERT INTO audit_logs (id, user_id, table_name, record_id, action, old_values, new_values, performed_at)
  VALUES (
    gen_random_uuid(),
    v_user_id,
    TG_TABLE_NAME,
    COALESCE((NEW->>'id')::UUID, (OLD->>'id')::UUID),
    TG_OP::"AuditAction",
    v_old_values,
    v_new_values,
    NOW()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;






CREATE OR REPLACE TRIGGER trg_goals_audit
  AFTER INSERT OR UPDATE OR DELETE ON goals
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE OR REPLACE TRIGGER trg_nutrition_targets_audit
  AFTER INSERT OR UPDATE OR DELETE ON nutrition_targets
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE OR REPLACE TRIGGER trg_body_profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON body_profiles
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();



-- meal or its items change

CREATE OR REPLACE FUNCTION fn_refresh_daily_summary()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id  UUID;
  v_date     DATE;
BEGIN

  SELECT m.user_id, DATE(m.occurred_at)
  INTO v_user_id, v_date
  FROM meals m
  WHERE m.id = COALESCE(NEW.meal_id, OLD.meal_id);

  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;



  INSERT INTO daily_summaries (
    id, user_id, summary_date, target_calories,
    consumed_calories, consumed_protein, consumed_carbs, consumed_fat,
    meal_count, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    v_user_id,
    v_date,
    COALESCE((SELECT nt.target_calories FROM nutrition_targets nt
              JOIN goals g ON g.id = nt.goal_id
              WHERE g.user_id = v_user_id AND g.status = 'ACTIVE'
              ORDER BY nt.created_at DESC LIMIT 1), 2000),
    COALESCE(SUM(mi.calories), 0),
    COALESCE(SUM(mi.protein_grams), 0),
    COALESCE(SUM(mi.carbohydrate_grams), 0),
    COALESCE(SUM(mi.fat_grams), 0),
    COUNT(DISTINCT m.id),
    NOW(),
    NOW()
  FROM meals m
  JOIN meal_items mi ON mi.meal_id = m.id
  WHERE m.user_id = v_user_id
    AND DATE(m.occurred_at) = v_date
  ON CONFLICT (user_id, summary_date)
  DO UPDATE SET
    consumed_calories = EXCLUDED.consumed_calories,
    consumed_protein  = EXCLUDED.consumed_protein,
    consumed_carbs    = EXCLUDED.consumed_carbs,
    consumed_fat      = EXCLUDED.consumed_fat,
    remaining_calories = EXCLUDED.target_calories - EXCLUDED.consumed_calories,
    meal_count        = EXCLUDED.meal_count,
    updated_at        = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_meal_items_summary
  AFTER INSERT OR UPDATE OR DELETE ON meal_items
  FOR EACH ROW EXECUTE FUNCTION fn_refresh_daily_summary();
