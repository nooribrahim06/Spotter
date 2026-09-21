import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});
const FOOD_FILE = "foods_final.csv";

function nullable(value) {
  if (value == null) return null;

  const trimmed = String(value).trim();

  return trimmed === "" ? null : trimmed;
}

function parseBoolean(value) {
  const normalized = String(value).trim().toLowerCase();

  if (normalized === "true") return true;
  if (normalized === "false") return false;

  throw new Error(`Invalid boolean value: "${value}"`);
}

function parseAliases(value) {
  const parsed = nullable(value);

  if (parsed == null) return null;

  try {
    return JSON.parse(parsed);
  } catch {
    throw new Error(`Invalid aliases JSON: ${parsed}`);
  }
}

function parseArchivedAt(value) {
  const parsed = nullable(value);

  if (parsed == null) return null;

  const date = new Date(parsed);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid archived_at value: "${value}"`);
  }

  return date;
}

function readFoodsCsv() {
  const filePath = path.join(
    process.cwd(),
    "prisma",
    "seed-data",
    FOOD_FILE
  );

  if (!fs.existsSync(filePath)) {
    throw new Error(`Food seed file not found: ${filePath}`);
  }

  const csv = fs.readFileSync(filePath, "utf8");

  return parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

function normalizeFoodRow(row) {
  const source = nullable(row.source);
  const externalSourceId = nullable(row.external_source_id);

  if (!row.name_en) {
    throw new Error("Food row is missing name_en.");
  }

  if (!source) {
    throw new Error(`Food "${row.name_en}" is missing source.`);
  }

  if (!externalSourceId) {
    throw new Error(
      `Food "${row.name_en}" is missing external_source_id.`
    );
  }

  return {
    nameEn: row.name_en,

    // English only for now.
    nameAr: nullable(row.name_ar),

    aliases: parseAliases(row.aliases),

    category: nullable(row.category),

    // Keep decimal values as strings instead of converting them through
    // JavaScript floating-point numbers.
    caloriesPer100g: row.calories_per_100g,
    proteinGramsPer100g: row.protein_grams_per_100g,
    carbohydrateGramsPer100g:
      row.carbohydrate_grams_per_100g,
    fatGramsPer100g: row.fat_grams_per_100g,

    // Imported catalog foods are global.
    createdByUserId: null,

    source,
    externalSourceId,

    sourceVersion: nullable(row.source_version),

    isActive: parseBoolean(row.is_active),

    archivedAt: parseArchivedAt(row.archived_at),
  };
}

async function seedFoods() {
  const rows = readFoodsCsv();

  console.log(`Found ${rows.length} foods in ${FOOD_FILE}.`);

  let created = 0;
  let updated = 0;

  for (const [index, row] of rows.entries()) {
    const food = normalizeFoodRow(row);

    const existing = await prisma.food.findUnique({
      where: {
        source_externalSourceId: {
          source: food.source,
          externalSourceId: food.externalSourceId,
        },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      await prisma.food.update({
        where: {
          id: existing.id,
        },
        data: {
          nameEn: food.nameEn,
          nameAr: food.nameAr,
          aliases: food.aliases,
          category: food.category,

          caloriesPer100g: food.caloriesPer100g,
          proteinGramsPer100g: food.proteinGramsPer100g,
          carbohydrateGramsPer100g:
            food.carbohydrateGramsPer100g,
          fatGramsPer100g: food.fatGramsPer100g,

          sourceVersion: food.sourceVersion,
          isActive: food.isActive,
          archivedAt: food.archivedAt,
        },
      });

      updated++;
    } else {
      await prisma.food.create({
        data: food,
      });

      created++;
    }

    if ((index + 1) % 500 === 0) {
      console.log(
        `Processed ${index + 1}/${rows.length} foods...`
      );
    }
  }

  console.log();
  console.log("Food seed complete.");
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Total:   ${rows.length}`);
}

seedFoods()
  .catch((error) => {
    console.error("Food seed failed:");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
