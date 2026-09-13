import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://spotter:spotter@localhost:5432/spotter_test";

const {
  addWorkoutExercise,
  removeWorkoutExercise,
  updateWorkoutExercise,
} = await import(
  "../src/modules/workout-exercises/workoutExercise.service.js"
);

const userId = "11111111-1111-4111-8111-111111111111";
const workoutId = "22222222-2222-4222-8222-222222222222";
const workoutExerciseId = "33333333-3333-4333-8333-333333333333";
const exerciseId = "44444444-4444-4444-8444-444444444444";

function catalogExercise() {
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
    secondaryMuscles: ["triceps"],
    instructions: ["Keep your body straight."],
    trackingMetrics: ["SETS", "REPS", "WEIGHT"],
    gifPublicId: null,
  };
}

function workoutExerciseRecord(overrides = {}) {
  return {
    id: workoutExerciseId,
    workoutId,
    exerciseId,
    exerciseOrder: 1,
    setsCount: 3,
    repsPerSet: 10,
    weightKg: "40.00",
    durationSeconds: null,
    distanceMeters: null,
    completed: false,
    notes: null,
    exercise: catalogExercise(),
    ...overrides,
  };
}

function activeWorkoutDatabase(overrides = {}) {
  const db = {
    workout: {
      async findFirst() {
        return { id: workoutId, status: "IN_PROGRESS" };
      },
    },
    exercise: {
      async findFirst() {
        return {
          id: exerciseId,
          trackingMetrics: catalogExercise().trackingMetrics,
        };
      },
    },
    workoutExercise: {
      async findFirst(args) {
        if (args.orderBy) return null;
        if (args.where.exerciseId) return null;
        return workoutExerciseRecord();
      },
      async count() {
        return 0;
      },
      async create(args) {
        return workoutExerciseRecord(args.data);
      },
      async updateMany() {
        return { count: 1 };
      },
      async findUnique() {
        return workoutExerciseRecord({ completed: true });
      },
      async delete() {
        return workoutExerciseRecord();
      },
    },
    async $transaction(callback) {
      return callback(db);
    },
    ...overrides,
  };

  return db;
}

test("adding an exercise verifies ownership and appends server-controlled order", async () => {
  let createQuery;
  const db = activeWorkoutDatabase();
  db.workoutExercise.create = async (args) => {
    createQuery = args;
    return workoutExerciseRecord(args.data);
  };

  const result = await addWorkoutExercise(
    userId,
    workoutId,
    {
      exerciseId,
      setsCount: 3,
      repsPerSet: 10,
      weightKg: 40,
    },
    db
  );

  assert.equal(createQuery.data.workoutId, workoutId);
  assert.equal(createQuery.data.exerciseOrder, 1);
  assert.equal(createQuery.data.completed, undefined);
  assert.equal(result.weightKg, 40);
  assert.equal(result.exercise.name, "Push-Up");
});

test("an inactive catalog exercise cannot be added", async () => {
  let transactionCalled = false;
  const db = activeWorkoutDatabase();
  db.exercise.findFirst = async () => null;
  db.$transaction = async () => {
    transactionCalled = true;
  };

  await assert.rejects(
    addWorkoutExercise(
      userId,
      workoutId,
      { exerciseId, durationSeconds: 60 },
      db
    ),
    (error) => error.code === "EXERCISE_NOT_FOUND"
  );
  assert.equal(transactionCalled, false);
});

test("the same catalog exercise cannot be added twice", async () => {
  const db = activeWorkoutDatabase();
  db.workoutExercise.findFirst = async (args) => {
    if (args.where.exerciseId) return { id: workoutExerciseId };
    return null;
  };

  await assert.rejects(
    addWorkoutExercise(
      userId,
      workoutId,
      { exerciseId, setsCount: 3, repsPerSet: 10, weightKg: 40 },
      db
    ),
    (error) =>
      error.code === "DUPLICATE_WORKOUT_EXERCISE" &&
      error.statusCode === 409
  );
});

test("a workout cannot exceed the exercise limit", async () => {
  const db = activeWorkoutDatabase();
  db.workoutExercise.count = async () => 50;

  await assert.rejects(
    addWorkoutExercise(
      userId,
      workoutId,
      { exerciseId, setsCount: 3, repsPerSet: 10, weightKg: 40 },
      db
    ),
    (error) => error.code === "WORKOUT_EXERCISE_LIMIT_REACHED"
  );
});

test("a completed-only patch validates the merged stored measurements", async () => {
  let updateQuery;
  const db = activeWorkoutDatabase();
  db.workoutExercise.updateMany = async (args) => {
    updateQuery = args;
    return { count: 1 };
  };

  const result = await updateWorkoutExercise(
    userId,
    workoutId,
    workoutExerciseId,
    { completed: true },
    db
  );

  assert.deepEqual(updateQuery.where, {
    id: workoutExerciseId,
    workoutId,
  });
  assert.deepEqual(updateQuery.data, { completed: true });
  assert.equal(result.completed, true);
});

test("a patch cannot leave sets without repetitions", async () => {
  let transactionCalled = false;
  const db = activeWorkoutDatabase();
  db.$transaction = async () => {
    transactionCalled = true;
  };

  await assert.rejects(
    updateWorkoutExercise(
      userId,
      workoutId,
      workoutExerciseId,
      { repsPerSet: null },
      db
    ),
    (error) => error.code === "INVALID_WORKOUT_EXERCISE"
  );
  assert.equal(transactionCalled, false);
});

test("tracking metrics allow sets with duration without repetitions", async () => {
  const db = activeWorkoutDatabase();
  db.exercise.findFirst = async () => ({
    id: exerciseId,
    trackingMetrics: ["SETS", "DURATION"],
  });

  const result = await addWorkoutExercise(
    userId,
    workoutId,
    { exerciseId, setsCount: 3, durationSeconds: 30 },
    db
  );

  assert.equal(result.setsCount, 3);
  assert.equal(result.durationSeconds, 30);
  assert.equal(result.repsPerSet, null);
});

test("tracking metrics allow repetitions with duration without sets", async () => {
  const db = activeWorkoutDatabase();
  db.exercise.findFirst = async () => ({
    id: exerciseId,
    trackingMetrics: ["REPS", "DURATION"],
  });

  const result = await addWorkoutExercise(
    userId,
    workoutId,
    { exerciseId, repsPerSet: 20, durationSeconds: 60 },
    db
  );

  assert.equal(result.setsCount, null);
  assert.equal(result.repsPerSet, 20);
  assert.equal(result.durationSeconds, 60);
});

test("every configured tracking metric is required", async () => {
  const db = activeWorkoutDatabase();

  await assert.rejects(
    addWorkoutExercise(
      userId,
      workoutId,
      { exerciseId, setsCount: 3, repsPerSet: 10 },
      db
    ),
    (error) =>
      error.code === "INVALID_WORKOUT_EXERCISE" &&
      error.details.some(
        (detail) =>
          detail.field === "weightKg" &&
          detail.message === "Weight is required for this exercise."
      )
  );
});

test("tracking metrics reject unsupported measurements", async () => {
  let transactionCalled = false;
  const db = activeWorkoutDatabase();
  db.$transaction = async () => {
    transactionCalled = true;
  };

  await assert.rejects(
    addWorkoutExercise(
      userId,
      workoutId,
      {
        exerciseId,
        setsCount: 3,
        repsPerSet: 10,
        weightKg: 40,
        distanceMeters: 100,
      },
      db
    ),
    (error) =>
      error.code === "INVALID_WORKOUT_EXERCISE" &&
      error.details.some(
        (detail) =>
          detail.field === "distanceMeters" &&
          detail.message === "Distance is not tracked for this exercise."
      )
  );
  assert.equal(transactionCalled, false);
});

test("a missing nested workout exercise is returned as not found", async () => {
  const db = activeWorkoutDatabase();
  db.workoutExercise.findFirst = async () => null;

  await assert.rejects(
    updateWorkoutExercise(
      userId,
      workoutId,
      workoutExerciseId,
      { completed: true },
      db
    ),
    (error) => error.code === "WORKOUT_EXERCISE_NOT_FOUND"
  );
});

test("removing an exercise closes its order gap inside the transaction", async () => {
  const reorderQueries = [];
  let deleteQuery;
  const db = activeWorkoutDatabase();
  db.workoutExercise.findFirst = async () => ({ exerciseOrder: 2 });
  db.workoutExercise.delete = async (args) => {
    deleteQuery = args;
  };
  db.workoutExercise.updateMany = async (args) => {
    reorderQueries.push(args);
    return { count: 1 };
  };

  await removeWorkoutExercise(
    userId,
    workoutId,
    workoutExerciseId,
    db
  );

  assert.deepEqual(deleteQuery.where, { id: workoutExerciseId });
  assert.equal(reorderQueries.length, 2);
  assert.deepEqual(reorderQueries[0].data, {
    exerciseOrder: { increment: 51 },
  });
  assert.deepEqual(reorderQueries[1].data, {
    exerciseOrder: { decrement: 52 },
  });
});

test("unowned workouts are indistinguishable from missing workouts", async () => {
  const db = activeWorkoutDatabase();
  db.workout.findFirst = async () => null;

  await assert.rejects(
    removeWorkoutExercise(
      userId,
      workoutId,
      workoutExerciseId,
      db
    ),
    (error) =>
      error.code === "WORKOUT_NOT_FOUND" && error.statusCode === 404
  );
});

test("completed workouts cannot change their exercises", async () => {
  const db = activeWorkoutDatabase();
  db.workout.findFirst = async () => ({
    id: workoutId,
    status: "COMPLETED",
  });

  await assert.rejects(
    removeWorkoutExercise(
      userId,
      workoutId,
      workoutExerciseId,
      db
    ),
    (error) =>
      error.code === "INVALID_WORKOUT_STATE" && error.statusCode === 409
  );
});
