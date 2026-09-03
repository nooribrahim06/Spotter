import * as recipeService from "./recipe.service.js";

function privateResponse(res, statusCode, data) {
  res.set("Cache-Control", "no-store");
  return res.status(statusCode).json({ data });
}

export async function getRecipeOverviewController(req, res) {
  const result = await recipeService.getRecipeOverview(req.user.id);
  return privateResponse(res, 200, result);
}

export async function searchRecipesController(req, res) {
  const result = await recipeService.searchRecipes(
    req.user.id,
    req.validatedQuery
  );
  return privateResponse(res, 200, result);
}

export async function getRecipeByIdController(req, res) {
  const result = await recipeService.getRecipeById(
    req.user.id,
    req.validatedParams.recipeId
  );
  return privateResponse(res, 200, result);
}

export async function createRecipeController(req, res) {
  const result = await recipeService.createRecipe(
    req.user.id,
    req.validatedBody
  );
  return privateResponse(res, 201, result);
}

export async function replaceRecipeController(req, res) {
  const result = await recipeService.replaceRecipe(
    req.user.id,
    req.validatedParams.recipeId,
    req.validatedBody
  );
  return privateResponse(res, 200, result);
}

export async function deleteRecipeController(req, res) {
  await recipeService.deleteRecipe(
    req.user.id,
    req.validatedParams.recipeId
  );
  return res.status(204).send();
}
