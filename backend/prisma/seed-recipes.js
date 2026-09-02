import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

import { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});
const files = [
  "spotter_recipes_seed_v1.csv",
  "spotter_recipes_seed_v2.csv",
];

function nullable(value) {
  if (value == null) return null;

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function readCsv(filename) {
  const filepath = path.join(
    process.cwd(), // cwd is the method that return ths curr working directory of the node.js process
    // we cannot put the hardcoded path here because it will not work on other machines, 
    // so we use the process.cwd() to get the current working directory and then we join it with the rest of the path to get the full path to the file
    "prisma",
    "seed-data",
    filename
  );

  const content = fs.readFileSync(filepath, "utf8"); // why utf8 ? 
  // it i sthe encoding that is used to read the file, it is a standard encoding that can be used to read text files

  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true, // this candles the first row if contains id and other markers
    // without it we may face smth like id = id , serving = serving and more 
    trim: true,
  });
}

function mapRecipe(row) {
  return {
    id: row.id,

    nameEn: row.name_en,
    nameAr: nullable(row.name_ar), // we use the nullable function to convert empty strings to null

    aliases: row.aliases
      ? JSON.parse(row.aliases) // we use JSON.parse to convert the string to an array
      : null,

    createdByUserId: nullable(row.created_by_user_id),

    servings: new Prisma.Decimal(row.servings),

    totalYieldGrams: new Prisma.Decimal(
      row.total_yield_grams
    ),

    caloriesPerServing: new Prisma.Decimal(
      row.calories_per_serving
    ),

    proteinGramsPerServing: new Prisma.Decimal(
      row.protein_grams_per_serving
    ),

    carbohydrateGramsPerServing: new Prisma.Decimal(
      row.carbohydrate_grams_per_serving
    ),

    fatGramsPerServing: new Prisma.Decimal(
      row.fat_grams_per_serving
    ),

    countryCode: nullable(row.country_code),
    cuisine: nullable(row.cuisine),

    instructions: nullable(row.instructions),

    source: nullable(row.source),

    externalSourceId: nullable(
      row.external_source_id
    ),

    sourceVersion: nullable(row.source_version),

    isActive:
      row.is_active.toLowerCase() === "true",

    archivedAt: row.archived_at
      ? new Date(row.archived_at)
      : null,

    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

async function main() {
  const rows = files.flatMap(readCsv);

  console.log(`Found ${rows.length} recipes.`);

  const recipes = rows.map(mapRecipe);
  const recipesBeforeSeed = await prisma.recipe.count();

  const result = await prisma.recipe.createMany({
    data: recipes,
    skipDuplicates: true,
  });

  const recipesAfterSeed = await prisma.recipe.count();

  console.log(`Inserted ${result.count} new recipes.`);
  console.log(`Skipped ${recipes.length - result.count} existing recipes.`);
  console.log(
    `Database recipe count: ${recipesBeforeSeed} -> ${recipesAfterSeed}.`
  );
}

main()
  .catch((error) => {
    console.error("Recipe seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
