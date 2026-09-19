import * as mealService from "./meal.service.js";

function privateResponse(res, statusCode, data) {
  res.set("Cache-Control", "no-store");
  return res.status(statusCode).json({ data });
}

export async function listMealsController(req, res) {
  const result = await mealService.listMeals(
    req.user.id,
    req.validatedQuery,
    req.user.timezone
  );
  return privateResponse(res, 200, result);
}

export async function getMealByIdController(req, res) {
  const result = await mealService.getMealById(
    req.user.id,
    req.validatedParams.mealId
  );
  return privateResponse(res, 200, result);
}

export async function createMealController(req, res) {
  const result = await mealService.createMeal(
    req.user.id,
    req.validatedBody
  );
  return privateResponse(res, 201, result);
}

export async function logMealFromPlanController(req, res) {
  const result = await mealService.logMealFromPlan(
    req.user.id,
    req.validatedBody
  );
  return privateResponse(res, 201, result);
}

export async function replaceMealController(req, res) {
  const result = await mealService.replaceMeal(
    req.user.id,
    req.validatedParams.mealId,
    req.validatedBody
  );
  return privateResponse(res, 200, result);
}

export async function deleteMealController(req, res) {
  await mealService.deleteMeal(
    req.user.id,
    req.validatedParams.mealId
  );
  return res.status(204).send();
}
