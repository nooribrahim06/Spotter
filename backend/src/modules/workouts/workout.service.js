import {
  ActiveWorkoutExistsError,
  InvalidWorkoutStartTimeError,
  InvalidWorkoutStateError,
  WorkoutCompletionRequiredError,
  WorkoutNotFoundError,
  PlanNotFoundError,
  PlanStatusConflictError,
  PlanScheduleMismatchError,
  PlanOccurrenceCompletedError,
} from "../../middlewares/errorHandling.js";
import { formatInTimeZone } from "date-fns-tz";
import { getWeekdayForDate } from "../plans/plan.rules.js";
import {
  cancelActiveWorkout,
  completeActiveWorkout,
  findActiveWorkoutByUserId,
  findActiveWorkoutDetailsByUserId,
  insertWorkout,
  findWorkoutByIdForUser,
  findWorkoutHistory,
  updateActiveWorkoutDetails,
  findPlanWorkoutForUser,
  findScheduledWorkoutOccurrence,
  createWorkoutFromPlan,
} from "./workout.repository.js";
import { serializeWorkout } from "./workout.serializer.js";

export async function createWorkout(userId, data, db) {
  if (data.startedAt && data.startedAt > new Date()) {
    throw new InvalidWorkoutStartTimeError();
  }

  const activeWorkout = await findActiveWorkoutByUserId(userId, db);

  if (activeWorkout) {
    throw new ActiveWorkoutExistsError();
  }

  const workout = await insertWorkout(userId, data, db);

  // A new workout cannot contain exercises yet. Adding the empty relation here
  // lets creation use the same safe public serializer as every workout read,
  // without making a redundant database query for an always-empty collection.
  return serializeWorkout({ ...workout, exercises: [] });
}

export async function startWorkoutFromPlan(userId, { planWorkoutId, scheduledDate }, db) {
  const planWorkout = await findPlanWorkoutForUser(planWorkoutId, db);
  if (!planWorkout || planWorkout.planDay?.plan?.userId !== userId) {
    throw new PlanNotFoundError("Prescribed workout not found.");
  }

  const plan = planWorkout.planDay.plan;
  if (plan.status !== "ACTIVE") {
    throw new PlanStatusConflictError("Workouts can only be started from an active plan.", "PLAN_NOT_ACTIVE");
  }

  const today = formatInTimeZone(new Date(), plan.timezone, "yyyy-MM-dd");
  const startDateStr = plan.startDate?.toISOString().slice(0, 10);
  const endDateStr = plan.endDate?.toISOString().slice(0, 10);

  if (scheduledDate < startDateStr || scheduledDate > endDateStr) {
    throw new PlanScheduleMismatchError("Scheduled date falls outside the active plan's coverage dates.");
  }
  if (scheduledDate !== today) {
    throw new PlanScheduleMismatchError("Workouts can only be started live for today's scheduled date.");
  }

  const expectedWeekday = getWeekdayForDate(scheduledDate);
  if (planWorkout.planDay?.dayOfWeek && planWorkout.planDay.dayOfWeek !== expectedWeekday) {
    throw new PlanScheduleMismatchError(
      `Prescribed workout is scheduled for ${planWorkout.planDay.dayOfWeek}, not ${expectedWeekday}.`
    );
  }

  if (plan.activatedAt) {
    const activatedDateStr = formatInTimeZone(plan.activatedAt, plan.timezone, "yyyy-MM-dd");
    if (scheduledDate < activatedDateStr) {
      throw new PlanScheduleMismatchError("Scheduled date falls before the plan's activation date.");
    }
  }
  if (plan.endedAt) {
    const endedDateStr = formatInTimeZone(plan.endedAt, plan.timezone, "yyyy-MM-dd");
    if (scheduledDate > endedDateStr) {
      throw new PlanScheduleMismatchError("Scheduled date falls after the plan's termination date.");
    }
  }

  const targetDate = new Date(`${scheduledDate}T00:00:00.000Z`);
  const existingOccurrence = await findScheduledWorkoutOccurrence(planWorkoutId, targetDate, db);
  if (existingOccurrence) {
    if (existingOccurrence.status === "COMPLETED") {
      throw new PlanOccurrenceCompletedError();
    }
    return { workout: serializeWorkout(existingOccurrence), isExisting: true };
  }

  const activeWorkout = await findActiveWorkoutByUserId(userId, db);
  if (activeWorkout) {
    throw new ActiveWorkoutExistsError();
  }

  const createdWorkout = await createWorkoutFromPlan(userId, planWorkout, targetDate, db);
  return { workout: serializeWorkout(createdWorkout), isExisting: false };
}

export async function getActiveWorkout(userId, db) {
  const workout = await findActiveWorkoutDetailsByUserId(userId, db);
  return workout ? serializeWorkout(workout) : null;
}

export async function getWorkoutHistory(userId, query, db) {
  const { workouts, totalItems } = await findWorkoutHistory(
    userId,
    query,
    db
  );
  const totalPages = Math.ceil(totalItems / query.limit);

  return {
    items: workouts.map(serializeWorkout),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasPreviousPage: query.page > 1,
      hasNextPage: query.page < totalPages,
    },
  };
}

export async function getWorkoutById(userId, workoutId, db) {
  const workout = await findWorkoutByIdForUser(workoutId, userId, db);

  if (!workout) throw new WorkoutNotFoundError();

  return serializeWorkout(workout);
}

async function requireActiveWorkout(userId, workoutId, db) {
  const workout = await findWorkoutByIdForUser(workoutId, userId, db);

  if (!workout) throw new WorkoutNotFoundError();
  if (workout.status !== "IN_PROGRESS") {
    throw new InvalidWorkoutStateError();
  }

  return workout;
}

function requireSuccessfulStateChange(workout) {
  if (!workout) {
    throw new InvalidWorkoutStateError(
      "The workout changed before this action completed. Refresh and try again."
    );
  }
}

export async function updateWorkout(userId, workoutId, data, db) {
  // the flow is 
  // 1. check if the workout exists and is active
  // 2. update it if exists
  // 3. check for race contidions and throw error if the workout is no longer active
  await requireActiveWorkout(userId, workoutId, db);

  const workout = await updateActiveWorkoutDetails(
    workoutId,
    userId,
    data,
    db
  );
  requireSuccessfulStateChange(workout);

  return serializeWorkout(workout);
}

export async function completeWorkout(userId, workoutId, db) {
  const current = await requireActiveWorkout(userId, workoutId, db);

  if (!current.exercises.some((exercise) => exercise.completed)) {
    throw new WorkoutCompletionRequiredError();
  }

  // The server owns completion time and derives duration from the trusted start.
  const completedAt = new Date();
  const elapsedMilliseconds = completedAt.getTime() - current.startedAt.getTime();
  const durationMinutes = Math.max(
    1,
    Math.ceil(elapsedMilliseconds / 60_000)
  );
  const workout = await completeActiveWorkout(
    workoutId,
    userId,
    { completedAt, durationMinutes },
    db
  );
  requireSuccessfulStateChange(workout);

  return serializeWorkout(workout);
}

export async function cancelWorkout(userId, workoutId, db) {
  await requireActiveWorkout(userId, workoutId, db);

  const workout = await cancelActiveWorkout(workoutId, userId, db);
  requireSuccessfulStateChange(workout);

  return serializeWorkout(workout);
}
