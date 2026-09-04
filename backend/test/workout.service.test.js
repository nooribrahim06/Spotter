import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://spotter:spotter@localhost:5432/spotter_test";

const {
  createWorkout,
  getActiveWorkout,
  getWorkoutById,
  getWorkoutHistory,
} = await import(
  "../src/modules/workouts/workout.service.js"
);

const userId = "11111111-1111-4111-8111-111111111111";
const workoutId = "22222222-2222-4222-8222-222222222222";
const timestamp = new Date("2026-09-03T10:00:00.000Z");

function workoutRecord(overrides = {}) {
  return {
    id: workoutId,
    userId,
    name: "Push Day",
    status: "IN_PROGRESS",
    startedAt: timestamp,
    completedAt: null,
    durationMinutes: null,
    estimatedCaloriesBurned: null,
    notes: null,
    exercises: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        exerciseOrder: 1,
        setsCount: 3,
        repsPerSet: 10,
        weightKg: "40.00",
        durationSeconds: null,
        distanceMeters: null,
        completed: false,
        notes: null,
        exercise: {
          id: "44444444-4444-4444-8444-444444444444",
          slug: "push-up",
          name: "Push-Up",
          exerciseType: "STRENGTH",
          bodyPart: "CHEST",
          difficulty: "BEGINNER",
          force: "PUSH",
          mechanic: "COMPOUND",
          equipment: "BODY_WEIGHT",
          primaryMuscles: ["chest"],
          secondaryMuscles: ["triceps"],
          instructions: ["Keep your body straight."],
          imageKey: "exercises/push-up/preview.jpg",
          gifKey: "exercises/push-up/demo.gif",
        },
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

test("workout creation uses the authenticated user and database defaults", async () => {
  let createQuery;
  const db = {
    workout: {
      async findFirst() {
        return null;
      },
      async create(args) {
        createQuery = args;
        return {
          id: "22222222-2222-4222-8222-222222222222",
          ...args.data,
        };
      },
    },
  };

  const result = await createWorkout(userId, {}, db);

  assert.deepEqual(createQuery.data, {
    userId,
    name: null,
    notes: null,
  });
  assert.equal(result.userId, userId);
});

test("workout creation passes optional request fields", async () => {
  const startedAt = new Date("2020-09-03T15:00:00.000Z");
  let createQuery;
  const db = {
    workout: {
      async findFirst() {
        return null;
      },
      async create(args) {
        createQuery = args;
        return args.data;
      },
    },
  };

  await createWorkout(
    userId,
    { name: "Push Day", notes: "Chest", startedAt },
    db
  );

  assert.deepEqual(createQuery.data, {
    userId,
    name: "Push Day",
    notes: "Chest",
    startedAt,
  });
});

test("workout creation rejects a future start time", async () => {
  let findCalled = false;
  const db = {
    workout: {
      async findFirst() {
        findCalled = true;
      },
    },
  };

  await assert.rejects(
    createWorkout(
      userId,
      { startedAt: new Date(Date.now() + 60_000) },
      db
    ),
    (error) =>
      error.code === "INVALID_WORKOUT_START_TIME" &&
      error.statusCode === 409
  );
  assert.equal(findCalled, false);
});

test("workout creation rejects a second active workout", async () => {
  let createCalled = false;
  const db = {
    workout: {
      async findFirst() {
        return { id: "22222222-2222-4222-8222-222222222222" };
      },
      async create() {
        createCalled = true;
      },
    },
  };

  await assert.rejects(
    createWorkout(userId, {}, db),
    (error) =>
      error.code === "ACTIVE_WORKOUT_EXISTS" && error.statusCode === 409
  );
  assert.equal(createCalled, false);
});

test("active workout is owner-scoped and includes exercise details", async () => {
  let findQuery;
  const db = {
    workout: {
      async findFirst(args) {
        findQuery = args;
        return workoutRecord();
      },
    },
  };

  const result = await getActiveWorkout(userId, db);

  assert.deepEqual(findQuery.where, {
    userId,
    status: "IN_PROGRESS",
  });
  assert.equal(result.id, workoutId);
  assert.equal(result.exercises[0].weightKg, 40);
  assert.equal(result.exercises[0].exercise.slug, "push-up");
  assert.equal("userId" in result, false);
});

test("no active workout returns null", async () => {
  const db = {
    workout: {
      async findFirst() {
        return null;
      },
    },
  };

  assert.equal(await getActiveWorkout(userId, db), null);
});

test("workout history is filtered, stable, and paginated", async () => {
  const from = new Date("2026-09-01T00:00:00.000Z");
  const to = new Date("2026-09-30T23:59:59.000Z");
  let findQuery;
  let countQuery;
  const db = {
    workout: {
      async findMany(args) {
        findQuery = args;
        return [workoutRecord({ status: "COMPLETED" })];
      },
      async count(args) {
        countQuery = args;
        return 21;
      },
    },
  };

  const result = await getWorkoutHistory(
    userId,
    { from, to, page: 2, limit: 10 },
    db
  );

  assert.deepEqual(findQuery.where, {
    userId,
    status: { in: ["COMPLETED", "CANCELLED"] },
    startedAt: { gte: from, lte: to },
  });
  assert.deepEqual(countQuery.where, findQuery.where);
  assert.deepEqual(findQuery.orderBy, [
    { startedAt: "desc" },
    { id: "desc" },
  ]);
  assert.equal(findQuery.skip, 10);
  assert.equal(findQuery.take, 10);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.pagination, {
    page: 2,
    limit: 10,
    totalItems: 21,
    totalPages: 3,
    hasPreviousPage: true,
    hasNextPage: true,
  });
});

test("workout details require matching ownership", async () => {
  let findQuery;
  const db = {
    workout: {
      async findFirst(args) {
        findQuery = args;
        return workoutRecord();
      },
    },
  };

  const result = await getWorkoutById(userId, workoutId, db);

  assert.deepEqual(findQuery.where, { id: workoutId, userId });
  assert.equal(result.id, workoutId);
});

test("an inaccessible workout is returned as not found", async () => {
  const db = {
    workout: {
      async findFirst() {
        return null;
      },
    },
  };

  await assert.rejects(
    getWorkoutById(userId, workoutId, db),
    (error) =>
      error.code === "WORKOUT_NOT_FOUND" && error.statusCode === 404
  );
});
