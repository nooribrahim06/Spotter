

--  User current weight latest progress entry

CREATE OR REPLACE VIEW v_user_current_weight AS
SELECT DISTINCT ON (bp.user_id)
  bp.user_id,
  pe.weight_kg,
  pe.body_fat_percentage,
  pe.recorded_at
FROM progress_entries pe
JOIN body_profiles bp ON bp.user_id = pe.body_profile_id
ORDER BY bp.user_id, pe.recorded_at DESC;

--daily nutrition snapshot


CREATE OR REPLACE VIEW v_daily_nutrition AS
SELECT
  m.user_id,
  DATE(m.occurred_at) AS log_date,
  m.meal_type,
  COUNT(mi.id)        AS item_count,
  SUM(mi.calories)    AS total_calories,
  SUM(mi.protein_grams)       AS total_protein,
  SUM(mi.carbohydrate_grams)  AS total_carbs,
  SUM(mi.fat_grams)           AS total_fat
FROM meals m
JOIN meal_items mi ON mi.meal_id = m.id
GROUP BY m.user_id, DATE(m.occurred_at), m.meal_type;

-- Exercise usage statistics
CREATE OR REPLACE VIEW v_exercise_usage AS
SELECT
  e.id AS exercise_id,
  e.name,
  e.body_part,
  e.target_muscle,
  COUNT(we.id) AS times_performed,
  MAX(wl.logged_at) AS last_performed_at
FROM exercises e
LEFT JOIN workout_exercises we ON we.exercise_id = e.id
LEFT JOIN workout_logs wl ON wl.id = we.workout_log_id
GROUP BY e.id, e.name, e.body_part, e.target_muscle;
