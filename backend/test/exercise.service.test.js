import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://spotter:spotter@localhost:5432/spotter_test";

process.env.CLOUD_NAME = "test-cloud";

const {
  getExerciseById,
  getExerciseConfig,
  listExercises,
} = await import("../src/modules/exercises/exercise.service.js");

const exerciseId = "44444444-4444-4444-8444-444444444444";

function exerciseRecord(overrides = {}) {
  return {
    id: exerciseId,
    slug: "push-up",
    name: "Push-Up",
    exerciseType: "STRENGTH",
    bodyPart: "CHEST",
    difficulty: "BEGINNER",
    force: "PUSH",
    mechanic: "COMPOUND",
    equipment: "BODY_WEIGHT",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "shoulders"],
    instructions: ["Keep your body straight."],
    trackingMetrics: ["SETS", "REPS"],
    gifPublicId: "exercises/push-up/demo",
    ...overrides,
  };
}

test("exercise list is active-only, filtered, stable, and paginated", async () => {
  let findQuery;
  let countQuery;
  const db = {
    exercise: {
      async findMany(args) {
        findQuery = args;
        return [exerciseRecord()];
      },
      async count(args) {
        countQuery = args;
        return 21;
      },
    },
  };
  const query = {
    search: "push",
    exerciseType: "STRENGTH",
    bodyPart: "CHEST",
    difficulty: "BEGINNER",
    force: "PUSH",
    mechanic: "COMPOUND",
    equipment: "BODY_WEIGHT",
    page: 2,
    limit: 10,
  };

  const result = await listExercises(query, db);

  assert.equal(findQuery.where.isActive, true);
  assert.deepEqual(findQuery.where.OR, [
    { name: { contains: "push", mode: "insensitive" } },
    { slug: { contains: "push", mode: "insensitive" } },
  ]);
  assert.equal(findQuery.where.exerciseType, "STRENGTH");
  assert.equal(findQuery.where.bodyPart, "CHEST");
  assert.equal(findQuery.where.difficulty, "BEGINNER");
  assert.equal(findQuery.where.force, "PUSH");
  assert.equal(findQuery.where.mechanic, "COMPOUND");
  assert.equal(findQuery.where.equipment, "BODY_WEIGHT");
  assert.deepEqual(countQuery.where, findQuery.where);
  assert.deepEqual(findQuery.orderBy, [
    { name: "asc" },
    { id: "asc" },
  ]);
  assert.equal(findQuery.skip, 10);
  assert.equal(findQuery.take, 10);
  assert.equal(result.items[0].name, "Push-Up");
  assert.deepEqual(result.items[0].trackingMetrics, ["SETS", "REPS"]);
  assert.equal("instructions" in result.items[0], false);
  assert.equal("gifPublicId" in result.items[0], false);
  assert.deepEqual(result.items[0].media, {
    previewUrl:
      "https://res.cloudinary.com/test-cloud/image/upload/pg_1/v1/exercises/push-up/demo.jpg",
    animationUrl:
      "https://res.cloudinary.com/test-cloud/image/upload/v1/exercises/push-up/demo.gif",
  });
  assert.deepEqual(result.pagination, {
    page: 2,
    limit: 10,
    totalItems: 21,
    totalPages: 3,
    hasPreviousPage: true,
    hasNextPage: true,
  });
});

test("exercise detail is active-only and includes instructions", async () => {
  let findQuery;
  const db = {
    exercise: {
      async findFirst(args) {
        findQuery = args;
        return exerciseRecord();
      },
    },
  };

  const result = await getExerciseById(exerciseId, db);

  assert.deepEqual(findQuery.where, { id: exerciseId, isActive: true });
  assert.deepEqual(result.instructions, ["Keep your body straight."]);
  assert.equal("isActive" in result, false);
});

test("an exercise without a GIF has nullable media URLs", async () => {
  const db = {
    exercise: {
      async findFirst() {
        return exerciseRecord({ gifPublicId: null });
      },
    },
  };

  const result = await getExerciseById(exerciseId, db);

  assert.deepEqual(result.media, {
    previewUrl: null,
    animationUrl: null,
  });
});

test("an inactive or missing exercise is returned as not found", async () => {
  const db = {
    exercise: {
      async findFirst() {
        return null;
      },
    },
  };

  await assert.rejects(
    getExerciseById(exerciseId, db),
    (error) =>
      error.code === "EXERCISE_NOT_FOUND" && error.statusCode === 404
  );
});

test("exercise config exposes the same values accepted by validation", () => {
  const config = getExerciseConfig();

  assert.ok(config.exerciseTypes.includes("STRENGTH"));
  assert.ok(config.bodyParts.includes("FULL_BODY"));
  assert.ok(config.difficulties.includes("BEGINNER"));
  assert.ok(config.equipment.includes("BODY_WEIGHT"));
  assert.ok(config.trackingMetrics.includes("DURATION"));
});
