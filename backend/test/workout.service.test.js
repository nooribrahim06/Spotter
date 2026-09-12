import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://spotter:spotter@localhost:5432/spotter_test";

process.env.CLOUD_NAME = "test-cloud";

const {
  cancelWorkout,
  completeWorkout,
  createWorkout,
  getActiveWorkout,
  getWorkoutById,
  getWorkoutHistory,
  updateWorkout,
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
          trackingMetrics: ["SETS", "REPS"],
          gifPublicId: "exercises/push-up/demo",
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
        return workoutRecord({
          name: args.data.name,
          notes: args.data.notes,
          startedAt: args.data.startedAt ?? timestamp,
          exercises: [],
        });
      },
    },
  };

  const result = await createWorkout(userId, {}, db);

  assert.deepEqual(createQuery.data, {
    userId,
    name: null,
    notes: null,
  });
  assert.equal("userId" in result, false);
  assert.deepEqual(result.exercises, []);
  assert.equal(result.status, "IN_PROGRESS");
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
        return workoutRecord({ ...args.data, exercises: [] });
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

test("an active workout can update only its user-authored details", async () => {
  let updateQuery;
  const db = {
    workout: {
      async findFirst() {
        return workoutRecord();
      },
      async updateManyAndReturn(args) {
        updateQuery = args;
        return [workoutRecord(args.data)];
      },
    },
  };

  const result = await updateWorkout(
    userId,
    workoutId,
    { name: null, notes: "Felt strong" },
    db
  );

  assert.deepEqual(updateQuery.where, {
    id: workoutId,
    userId,
    status: "IN_PROGRESS",
  });
  assert.deepEqual(updateQuery.data, { name: null, notes: "Felt strong" });
  assert.equal(updateQuery.limit, 1);
  assert.equal(result.name, null);
  assert.equal(result.notes, "Felt strong");
});

test("completed workouts reject edit, complete, and cancel actions", async () => {
  let updateCalled = false;
  const db = {
    workout: {
      async findFirst() {
        return workoutRecord({ status: "COMPLETED" });
      },
      async updateManyAndReturn() {
        updateCalled = true;
      },
    },
  };
  const operations = [
    () => updateWorkout(userId, workoutId, { notes: "Changed" }, db),
    () => completeWorkout(userId, workoutId, db),
    () => cancelWorkout(userId, workoutId, db),
  ];

  for (const operation of operations) {
    await assert.rejects(
      operation(),
      (error) =>
        error.code === "INVALID_WORKOUT_STATE" && error.statusCode === 409
    );
  }
  assert.equal(updateCalled, false);
});

test("a workout needs a completed exercise before completion", async () => {
  let updateCalled = false;
  const db = {
    workout: {
      async findFirst() {
        return workoutRecord();
      },
      async updateManyAndReturn() {
        updateCalled = true;
      },
    },
  };

  await assert.rejects(
    completeWorkout(userId, workoutId, db),
    (error) =>
      error.code === "WORKOUT_COMPLETION_REQUIRED" &&
      error.statusCode === 409 &&
      error.details[0].field === "exercises"
  );
  assert.equal(updateCalled, false);
});

test("completion atomically stores server time and derived duration", async () => {
  const startedAt = new Date(Date.now() - 90 * 60_000);
  const exercises = workoutRecord().exercises.map((exercise) => ({
    ...exercise,
    completed: true,
  }));
  let updateQuery;
  const db = {
    workout: {
      async findFirst() {
        return workoutRecord({ startedAt, exercises });
      },
      async updateManyAndReturn(args) {
        updateQuery = args;
        return [workoutRecord({ startedAt, exercises, ...args.data })];
      },
    },
  };

  const result = await completeWorkout(userId, workoutId, db);

  assert.deepEqual(updateQuery.where, {
    id: workoutId,
    userId,
    status: "IN_PROGRESS",
    exercises: { some: { completed: true } },
  });
  assert.equal(updateQuery.data.status, "COMPLETED");
  assert.ok(updateQuery.data.completedAt instanceof Date);
  assert.equal(
    updateQuery.data.durationMinutes,
    Math.max(
      1,
      Math.ceil(
        (updateQuery.data.completedAt.getTime() - startedAt.getTime()) / 60_000
      )
    )
  );
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.durationMinutes, updateQuery.data.durationMinutes);
});

test("cancelling preserves the workout and clears completion fields", async () => {
  let updateQuery;
  const db = {
    workout: {
      async findFirst() {
        return workoutRecord();
      },
      async updateManyAndReturn(args) {
        updateQuery = args;
        return [workoutRecord(args.data)];
      },
    },
  };

  const result = await cancelWorkout(userId, workoutId, db);

  assert.deepEqual(updateQuery.data, {
    status: "CANCELLED",
    completedAt: null,
    durationMinutes: null,
    estimatedCaloriesBurned: null,
  });
  assert.equal(result.status, "CANCELLED");
  assert.equal(result.completedAt, null);
  assert.equal(result.durationMinutes, null);
});

test("a lost concurrent state change returns a conflict", async () => {
  const db = {
    workout: {
      async findFirst() {
        return workoutRecord();
      },
      async updateManyAndReturn() {
        return [];
      },
    },
  };

  await assert.rejects(
    updateWorkout(userId, workoutId, { notes: "Changed" }, db),
    (error) =>
      error.code === "INVALID_WORKOUT_STATE" && error.statusCode === 409
  );
});
