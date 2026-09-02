import * as foodService from "./food.service.js";

function privateResponse(res, statusCode, data) {
  res.set("Cache-Control", "no-store");
  return res.status(statusCode).json({ data });
}

export async function getFoodOverviewController(req, res) {
  const result = await foodService.getFoodOverview(req.user.id);
  return privateResponse(res, 200, result);
}


export async function searchFoodController(req, res) {
  const result = await foodService.searchFood(
    req.user.id,
    req.validatedQuery
  );
  return privateResponse(res, 200, result);
}


export async function createCustomFoodController(req, res) {
  const result = await foodService.createCustomFood(
    req.user.id,
    req.validatedBody
  );
  return privateResponse(res, 201, result);
}
