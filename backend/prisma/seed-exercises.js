import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to seed exercises.");
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const seedFilename = "spotter_exercises_seed_v1.csv";

// Keeping the accepted values beside the importer produces a clear row-level
// error before Prisma sends an invalid enum value to PostgreSQL.
const allowedValues = {
  exerciseType: new Set(["STRENGTH", "CARDIO", "MOBILITY"]),
  bodyPart: new Set([
    "ARMS",
    "BACK",
    "CALVES",
    "CHEST",
    "CORE",
    "FULL_BODY",
    "GLUTES",
    "LEGS",
    "SHOULDERS",
  ]),
  difficulty: new Set(["BEGINNER", "INTERMEDIATE", "EXPERT"]),
  force: new Set(["PUSH", "PULL", "STATIC"]),
  mechanic: new Set(["COMPOUND", "ISOLATION"]),
  equipment: new Set([
    "BARBELL",
    "BODY_WEIGHT",
    "CABLE",
    "DUMBBELL",
    "JUMP_ROPE",
    "KETTLEBELL",
    "MACHINE",
    "RESISTANCE_BAND",
  ]),
};

function nullable(value) {
  if (value == null) return null;

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function requiredText(value, fieldName, rowNumber) {
  const parsedValue = nullable(value);

  if (parsedValue === null) {
    throw new Error(`Row ${rowNumber}: ${fieldName} is required.`);
  }

  return parsedValue;
}

function requiredEnum(value, fieldName, rowNumber) {
  const parsedValue = requiredText(value, fieldName, rowNumber);

  if (!allowedValues[fieldName].has(parsedValue)) {
    throw new Error(
      `Row ${rowNumber}: ${fieldName} has unsupported value "${parsedValue}".`
    );
  }

  return parsedValue;
}

function optionalEnum(value, fieldName, rowNumber) {
  const parsedValue = nullable(value);

  if (parsedValue === null) return null;

  if (!allowedValues[fieldName].has(parsedValue)) {
    throw new Error(
      `Row ${rowNumber}: ${fieldName} has unsupported value "${parsedValue}".`
    );
  }

  return parsedValue;
}

function stringArray(value, fieldName, rowNumber) {
  const parsedValue = requiredText(value, fieldName, rowNumber);

  let items;

  try {
    items = JSON.parse(parsedValue);
  } catch {
    throw new Error(`Row ${rowNumber}: ${fieldName} must be valid JSON.`);
  }

  if (
    !Array.isArray(items) ||
    items.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new Error(
      `Row ${rowNumber}: ${fieldName} must be an array of non-empty strings.`
    );
  }

  return items.map((item) => item.trim());
}

function readCsv() {
  // npm runs this script from the backend directory, so process.cwd() keeps
  // the seed path portable across machines instead of hardcoding a full path.
  const filepath = path.join(
    process.cwd(),
    "prisma",
    "seed-data",
    seedFilename
  );

  if (!fs.existsSync(filepath)) {
    throw new Error(`Exercise seed file was not found: ${filepath}`);
  }

  const content = fs.readFileSync(filepath, "utf8");

  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });
}

function mapExercise(row, index) {
  // Add 2 because arrays start at 0 and CSV row 1 contains the headers.
  const rowNumber = index + 2;

  return {
    // The CSV intentionally has no id; Prisma generates the UUID on creation.
    slug: requiredText(row.slug, "slug", rowNumber),
    name: requiredText(row.name, "name", rowNumber),

    exerciseType: requiredEnum(
      row.exerciseType,
      "exerciseType",
      rowNumber
    ),
    bodyPart: requiredEnum(row.bodyPart, "bodyPart", rowNumber),
    difficulty: requiredEnum(row.difficulty, "difficulty", rowNumber),
    force: optionalEnum(row.force, "force", rowNumber),
    mechanic: optionalEnum(row.mechanic, "mechanic", rowNumber),
    equipment: requiredEnum(row.equipment, "equipment", rowNumber),

    primaryMuscles: stringArray(
      row.primaryMuscles,
      "primaryMuscles",
      rowNumber
    ),
    secondaryMuscles: stringArray(
      row.secondaryMuscles,
      "secondaryMuscles",
      rowNumber
    ),
    instructions: stringArray(row.instructions, "instructions", rowNumber),

    imageKey: nullable(row.imageKey),
    gifKey: nullable(row.gifKey),
  };
}

function rejectDuplicateSlugs(exercises) {
  const seenSlugs = new Set();

  for (const exercise of exercises) {
    if (seenSlugs.has(exercise.slug)) {
      throw new Error(`The CSV contains duplicate slug "${exercise.slug}".`);
    }

    seenSlugs.add(exercise.slug);
  }
}

async function main() {
  const rows = readCsv();
  const exercises = rows.map(mapExercise);

  rejectDuplicateSlugs(exercises);

  console.log(`Found ${exercises.length} exercises in ${seedFilename}.`);

  const slugs = exercises.map((exercise) => exercise.slug);
  const existingExercises = await prisma.exercise.findMany({
    where: {
      slug: { in: slugs },
    },
    select: {
      slug: true,
    },
  });
  const existingSlugs = new Set(
    existingExercises.map((exercise) => exercise.slug)
  );

  // Upsert makes the seed repeatable: new slugs are created and existing
  // catalog rows receive updated names, metadata, instructions, and media keys.
  await prisma.$transaction(
    exercises.map(({ slug, ...data }) =>
      prisma.exercise.upsert({
        where: { slug },
        create: { slug, ...data },
        update: data,
      })
    )
  );

  const createdCount = exercises.filter(
    (exercise) => !existingSlugs.has(exercise.slug)
  ).length;
  const updatedCount = exercises.length - createdCount;
  const databaseCount = await prisma.exercise.count();

  console.log(`Created ${createdCount} exercises.`);
  console.log(`Updated ${updatedCount} exercises.`);
  console.log(`Database exercise count: ${databaseCount}.`);
}

main()
  .catch((error) => {
    console.error("Exercise seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
