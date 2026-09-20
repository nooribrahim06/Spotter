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

const seedFilename =
  "spotter_exercises_cloudinary_clean_with_metrics.csv";


// --------------------------------------------------
// Allowed enum values
// --------------------------------------------------

const allowedValues = {
  exerciseType: new Set([
    "STRENGTH",
    "CARDIO",
    "MOBILITY",
  ]),

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

  difficulty: new Set([
    "BEGINNER",
    "INTERMEDIATE",
    "EXPERT",
  ]),

  force: new Set([
    "PUSH",
    "PULL",
    "STATIC",
  ]),

  mechanic: new Set([
    "COMPOUND",
    "ISOLATION",
  ]),

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

  trackingMetric: new Set([
    "SETS",
    "REPS",
    "WEIGHT",
    "DURATION",
    "DISTANCE",
  ]),
};


// --------------------------------------------------
// Parsing helpers
// --------------------------------------------------

function nullable(value) {
  if (value == null) return null;

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}


function requiredText(value, fieldName, rowNumber) {
  const parsedValue = nullable(value);

  if (parsedValue === null) {
    throw new Error(
      `Row ${rowNumber}: ${fieldName} is required.`
    );
  }

  return parsedValue;
}


function requiredEnum(value, fieldName, rowNumber) {
  const parsedValue = requiredText(
    value,
    fieldName,
    rowNumber
  );

  if (!allowedValues[fieldName].has(parsedValue)) {
    throw new Error(
      `Row ${rowNumber}: ${fieldName} has unsupported value "${parsedValue}".`
    );
  }

  return parsedValue;
}


function optionalEnum(value, fieldName, rowNumber) {
  const parsedValue = nullable(value);

  if (parsedValue === null) {
    return null;
  }

  if (!allowedValues[fieldName].has(parsedValue)) {
    throw new Error(
      `Row ${rowNumber}: ${fieldName} has unsupported value "${parsedValue}".`
    );
  }

  return parsedValue;
}


// --------------------------------------------------
// JSON array parser
// --------------------------------------------------

function stringArray(value, fieldName, rowNumber) {
  const parsedValue = requiredText(
    value,
    fieldName,
    rowNumber
  );

  let items;

  try {
    items = JSON.parse(parsedValue);
  } catch {
    throw new Error(
      `Row ${rowNumber}: ${fieldName} must be valid JSON.`
    );
  }

  if (!Array.isArray(items)) {
    throw new Error(
      `Row ${rowNumber}: ${fieldName} must be an array.`
    );
  }

  if (
    items.some(
      (item) =>
        typeof item !== "string" ||
        item.trim() === ""
    )
  ) {
    throw new Error(
      `Row ${rowNumber}: ${fieldName} must be an array of non-empty strings.`
    );
  }

  return items.map((item) => item.trim());
}


// --------------------------------------------------
// Enum array parser
// Used for trackingMetrics
// --------------------------------------------------

function enumArray(
  value,
  fieldName,
  allowedSet,
  rowNumber
) {
  const items = stringArray(
    value,
    fieldName,
    rowNumber
  );

  for (const item of items) {
    if (!allowedSet.has(item)) {
      throw new Error(
        `Row ${rowNumber}: ${fieldName} has unsupported value "${item}".`
      );
    }
  }

  // Prevent something like:
  // ["REPS", "REPS", "SETS"]

  const uniqueItems = [...new Set(items)];

  return uniqueItems;
}


// --------------------------------------------------
// Cloudinary Public ID
// --------------------------------------------------

function optionalGifPublicId(value, rowNumber) {
  const publicId = nullable(value);

  if (publicId === null) {
    return null;
  }

  // We want:
  //
  // walking-on-stepmill
  //
  // NOT:
  //
  // https://res.cloudinary.com/.../walking-on-stepmill.gif
  //
  // and NOT:
  //
  // walking-on-stepmill.gif

  if (
    /^https?:\/\//i.test(publicId) ||
    /\.gif$/i.test(publicId)
  ) {
    throw new Error(
      `Row ${rowNumber}: gifPublicId must be a Cloudinary public ID without a URL or .gif extension.`
    );
  }

  return publicId;
}


// --------------------------------------------------
// Read CSV
// --------------------------------------------------

function readCsv() {
  const filepath = path.join(
    process.cwd(),
    "prisma",
    "seed-data",
    seedFilename
  );

  if (!fs.existsSync(filepath)) {
    throw new Error(
      `Exercise seed file was not found: ${filepath}`
    );
  }

  const content = fs.readFileSync(
    filepath,
    "utf8"
  );

  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });
}


// --------------------------------------------------
// CSV row -> Prisma Exercise data
// --------------------------------------------------

function mapExercise(row, index) {
  // CSV:
  // row 1 = headers
  // array index 0 = CSV row 2
  const rowNumber = index + 2;

  return {
    // Prisma generates UUID automatically.
    slug: requiredText(
      row.slug,
      "slug",
      rowNumber
    ),

    name: requiredText(
      row.name,
      "name",
      rowNumber
    ),

    exerciseType: requiredEnum(
      row.exerciseType,
      "exerciseType",
      rowNumber
    ),

    bodyPart: requiredEnum(
      row.bodyPart,
      "bodyPart",
      rowNumber
    ),

    difficulty: requiredEnum(
      row.difficulty,
      "difficulty",
      rowNumber
    ),

    force: optionalEnum(
      row.force,
      "force",
      rowNumber
    ),

    mechanic: optionalEnum(
      row.mechanic,
      "mechanic",
      rowNumber
    ),

    equipment: requiredEnum(
      row.equipment,
      "equipment",
      rowNumber
    ),

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

    instructions: stringArray(
      row.instructions,
      "instructions",
      rowNumber
    ),

    trackingMetrics: enumArray(
      row.trackingMetrics,
      "trackingMetrics",
      allowedValues.trackingMetric,
      rowNumber
    ),

    gifPublicId: optionalGifPublicId(
      row.gifPublicId,
      rowNumber
    ),
  };
}


// --------------------------------------------------
// Duplicate validation
// --------------------------------------------------

function rejectDuplicateSlugs(exercises) {
  const seenSlugs = new Set();

  for (const exercise of exercises) {
    if (seenSlugs.has(exercise.slug)) {
      throw new Error(
        `The CSV contains duplicate slug "${exercise.slug}".`
      );
    }

    seenSlugs.add(exercise.slug);
  }
}


// --------------------------------------------------
// Seed
// --------------------------------------------------

async function main() {
  const rows = readCsv();

  const exercises = rows.map(mapExercise);

  rejectDuplicateSlugs(exercises);

  console.log(
    `Found ${exercises.length} exercises in ${seedFilename}.`
  );

  const slugs = exercises.map(
    (exercise) => exercise.slug
  );

  // Check which ones already exist so we can report
  // created vs updated accurately.

  const existingExercises =
    await prisma.exercise.findMany({
      where: {
        slug: {
          in: slugs,
        },
      },

      select: {
        slug: true,
      },
    });

  const existingSlugs = new Set(
    existingExercises.map(
      (exercise) => exercise.slug
    )
  );

  // Upsert makes the seed repeatable.
  //
  // Existing exercise:
  //   -> metadata + trackingMetrics + gifPublicId update
  //
  // New exercise:
  //   -> created

  // Upsert makes the seed repeatable.
//
// Existing exercise:
//   -> metadata + trackingMetrics + gifPublicId update
//
// New exercise:
//   -> created

for (const [index, { slug, ...data }] of exercises.entries()) {
  await prisma.exercise.upsert({
    where: {
      slug,
    },
    create: {
      slug,
      ...data,
    },
    update: data,
  });

  console.log(
    `Processed ${index + 1}/${exercises.length} exercises...`
  );
}

const createdCount =
  exercises.filter(
    (exercise) =>
      !existingSlugs.has(exercise.slug)
  ).length;

const updatedCount =
  exercises.length - createdCount;

const databaseCount =
  await prisma.exercise.count();

  console.log(
    `Created ${createdCount} exercises.`
  );

  console.log(
    `Updated ${updatedCount} exercises.`
  );

  console.log(
    `Database exercise count: ${databaseCount}.`
  );
}


// --------------------------------------------------
// Run
// --------------------------------------------------

main()
  .catch((error) => {
    console.error(
      "Exercise seed failed:",
      error
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });