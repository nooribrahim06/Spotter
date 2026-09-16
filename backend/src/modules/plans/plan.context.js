export function buildPlanGenerationContext({
  source,
  targets,
  template,
  input,
}) {
  return {
    user: {
      // Map the actual repository fields into the AI-facing context.
      experienceLevel: source.trainingProfile.overallExperienceLevel,
      resistanceTrainingLevel: source.trainingProfile.resistanceTrainingLevel,
      cardioTrainingLevel: source.trainingProfile.cardioTrainingLevel,
      equipment: source.trainingProfile.availableEquipment,
      availability: source.trainingProfile.availableDays,
      trainingDaysPerWeek: source.trainingProfile.trainingDaysPerWeek,
      preferredSessionMinutes: source.trainingProfile.preferredSessionMinutes,
      trainingEnvironment: source.trainingProfile.trainingEnvironment,
      preferredTrainingStyles: source.trainingProfile.preferredTrainingStyles,
      preferredCardioType: source.trainingProfile.preferredCardioType,
      restrictions: {
        healthConditions: source.healthProfile.healthConditions,
        movementLimitations: source.healthProfile.movementLimitations,
        specialPlanningStates: source.healthProfile.specialPlanningStates,
        requiresProfessionalClearance: source.healthProfile.requiresProfessionalClearance,
        safetyNotes: source.healthProfile.safetyNotes,
        foodAllergies: source.nutritionProfile.foodAllergies,
        foodIntolerances: source.nutritionProfile.foodIntolerances,
      },
      nutritionPlanStyle: source.nutritionProfile.planStyle,
      nutritionPreferences: {
        dietaryPreferenceCodes: source.nutritionProfile.dietaryPreferenceCodes,
        foodPreferences: source.nutritionProfile.foodPreferences,
        mealsPerDay: source.nutritionProfile.mealsPerDay,
        snacksPerDay: source.nutritionProfile.snacksPerDay,
        cookingSkill: source.nutritionProfile.cookingSkill,
        maxMealPrepMinutes: source.nutritionProfile.maxMealPrepMinutes,
        kitchenAccess: source.nutritionProfile.kitchenAccess,
        foodBudgetLevel: source.nutritionProfile.foodBudgetLevel,
      },
      timezone: source.user.timezone,
    },

    goal: {
      type: source.goal.goalType,
    },

    targets,

    template: template
      ? {
          name: template.name,
          days: template.days,
        }
      : null,

    request: {
      startDate: input.startDate,
      endDate: input.endDate,
      preferences: input.preferences ?? null,
    },
  };
}
