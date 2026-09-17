// Product acceptance limits, shared by the prompt and backend validator.
// These tolerances do not alter the targets calculated for the user.
export const PLAN_NUTRITION_TOLERANCE = Object.freeze({
  caloriesPercent: 15,
  proteinPercent: 15,
  carbohydratePercent: 20,
  fatPercent: 20,
});

// Maximum generated JSON text accepted before parsing.
// The provider owns its per-request timeout; there is no overall deadline yet.
export const PLAN_GENERATION_LIMITS = Object.freeze({
  contentBytes: 300_000,
});
// Shared by readiness checks, candidate requirements, and final validation.
export const CONCRETE_MEAL_PLAN_STYLES = Object.freeze(["EXACT_MEALS", "FLEXIBLE_MEALS"]);
