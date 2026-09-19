function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function aggregateMeals(meals) {
  const items = meals.flatMap((meal) => meal.items);
  const macrosComplete = items.every(
    (item) =>
      item.proteinGrams != null &&
      item.carbohydrateGrams != null &&
      item.fatGrams != null
  );

  const sum = (field) =>
    round(items.reduce((total, item) => total + Number(item[field]), 0));

  return {
    calories: sum("calories"),
    proteinGrams: macrosComplete ? sum("proteinGrams") : null,
    carbohydrateGrams: macrosComplete
      ? sum("carbohydrateGrams")
      : null,
    fatGrams: macrosComplete ? sum("fatGrams") : null,
    macrosComplete,
  };
}

function aggregateWorkoutBurn(workouts) {
  const completed = workouts.filter(
    (workout) => workout.status === "COMPLETED"
  );
  const burnedCaloriesComplete = completed.every(
    (workout) => workout.estimatedCaloriesBurned != null
  );
  const burnedCalories = burnedCaloriesComplete
    ? completed.reduce(
        (total, workout) => total + workout.estimatedCaloriesBurned,
        0
      )
    : null;

  return { completed, burnedCalories, burnedCaloriesComplete };
}

export function buildDailySummary({ date, meals, workouts, targets }) {
  const consumed = aggregateMeals(meals);
  const burn = aggregateWorkoutBurn(workouts);
  const targetCalories = targets?.dailyCalories ?? null;
  const remainingCalories =
    targetCalories == null || burn.burnedCalories == null
      ? null
      : round(targetCalories - consumed.calories + burn.burnedCalories);

  return {
    date,
    nutrition: {
      targetCalories,
      consumedCalories: consumed.calories,
      burnedCalories: burn.burnedCalories,
      remainingCalories,
      burnedCaloriesComplete: burn.burnedCaloriesComplete,
      macrosComplete: consumed.macrosComplete,
      protein: {
        consumed: consumed.proteinGrams,
        target: targets?.proteinGrams ?? null,
      },
      carbohydrates: {
        consumed: consumed.carbohydrateGrams,
        target: targets?.carbohydrateGrams ?? null,
      },
      fat: {
        consumed: consumed.fatGrams,
        target: targets?.fatGrams ?? null,
      },
    },
    activity: {
      mealsLogged: meals.length,
      workoutsLogged: workouts.length,
      workoutCompleted: burn.completed.length > 0,
    },
    targetContext: targets
      ? {
          source: targets.source || "PROFILE",
          planId: targets.planId ?? null,
          planTitle: targets.planTitle ?? null,
          profileTargets: targets.profileTargets ?? null,
          calculatorVersion: targets.calculatorVersion ?? null,
          basedOn: targets.basedOn ?? null,
          disclaimer: targets.disclaimer ?? null,
        }
      : null,
  };
}
