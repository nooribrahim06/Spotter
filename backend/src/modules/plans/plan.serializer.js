/**
 * Pure, synchronous plan serializer.
 * 
 * Snapshots for meal items (name, scaled calories/macros) and workout
 * exercises (exerciseName, category, equipment) are stored directly inside
 * the PlanDay and PlanWorkout JsonB fields at plan generation time.
 * 
 * Zero database queries, zero async overhead, sub-millisecond execution.
 */

export function serializePlan(plan) {
  if (!plan) return null;

  return {
    id: plan.id,
    userId: plan.userId,
    goalId: plan.goalId,
    sourceTemplateId: plan.sourceTemplateId ?? null,
    status: plan.status,
    nutritionPlanStyle: plan.nutritionPlanStyle,
    timezone: plan.timezone,
    title: plan.title,
    explanation: plan.explanation,
    calorieTarget: plan.calorieTarget,
    proteinTargetGrams: plan.proteinTargetGrams,
    carbohydrateTargetGrams: plan.carbohydrateTargetGrams,
    fatTargetGrams: plan.fatTargetGrams,
    startDate: plan.startDate,
    endDate: plan.endDate,
    activatedAt: plan.activatedAt ?? null,
    endedAt: plan.endedAt ?? null,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    days: plan.days?.map((day) => ({
      id: day.id,
      dayOfWeek: day.dayOfWeek,
      breakfastOptions: day.breakfastOptions ?? null,
      lunchOptions: day.lunchOptions ?? null,
      dinnerOptions: day.dinnerOptions ?? null,
      snackOptions: day.snackOptions ?? null,
      nutritionGuidance: day.nutritionGuidance ?? null,
      notes: day.notes ?? null,
      workouts: day.workouts?.map((workout) => ({
        id: workout.id,
        slot: workout.slot,
        orderIndex: workout.orderIndex,
        name: workout.name,
        estimatedDurationMinutes: workout.estimatedDurationMinutes,
        exercises: workout.exercises ?? [],
        notes: workout.notes ?? null,
      })) ?? [],
    })) ?? [],
  };
}
