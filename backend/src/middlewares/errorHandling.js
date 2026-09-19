export class AppError extends Error {
    constructor(message, statusCode , code, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true; // Mark this error as operational (expected)
        Error.captureStackTrace(
             this,             // object receiving the .stack property
             this.constructor  // remove frames through this constructor
        );
    }
}

// types or errors i have uptill now
// =============== Signup Endpoint ===============
// 1.1. the client sent invalid schema
// 1.2. 429
// 1.3. nodemailer failed to send email
// 1.4. the repo failed to create the user <database error>
export class invalidSchemaError extends AppError {
    constructor(details) {
        super("Validation failed.", 400, "INVALID_SCHEMA", details); // 400 Bad Request
    }
}
// class rateLimitError extends AppError {
//     constructor(message) {
//         super(message, 429, "TOO_MANY_REQUESTS"); // 429 Too Many Requests
//     }
// }
export class emailSendError extends AppError {
    constructor(message) {
        super(message, 500, "EMAIL_SEND_FAILED"); // 500 Internal Server Error
    }
}
export class databaseError extends AppError {
    constructor(message) {
        super(message, 500, "DATABASE_ERROR"); // 500 Internal Server Error
    }
}
export class DuplicateUserError extends AppError {
  constructor(field) {
    super(
      `A user with that ${field} already exists.`,
      409,
      "USER_ALREADY_EXISTS"
    );
  }
}

//=========== Verify Email Endpoint ===========
// 2.1. the client sent invalid schema
// 2.2. the repo failed to find the user with that token or the token is expired
export class invalidTokenError extends AppError {
    constructor(message) {
        super(message, 400, "INVALID_TOKEN"); // 400 Bad Request
    }
}
//=========== Login Endpoint ===========
// login endpoint
// 1. the client sent invalid schema
// 2. the repo failed to find the user with that email or the password is incorrect

// OWASP recommends not to reveal whether the email or password is incorrect, so we will just say "Invalid email or password" for both cases.
export class InvalidCredentialsError extends AppError {
  constructor(message = "Invalid email or password.") {
    super(
      message,
      401,
      "INVALID_CREDENTIALS"
    );
  }
}

export class InvalidRefreshTokenError extends AppError {
  constructor(message = "Invalid or expired session.") {
    super(message, 401, "INVALID_REFRESH_TOKEN");
  }
}

export class InvalidSessionError extends AppError {
  constructor(message = "Invalid or expired session.") {
    super(message, 401, "INVALID_SESSION");
  }
}
// =========== JWT Errors ===========
export class InvalidAccessTokenError extends AppError {
  constructor(message = "Authentication required.") {
    super(message, 401, "INVALID_ACCESS_TOKEN");
  }
}

export class theftTriggerError extends AppError {
  constructor(message = "Refresh token has already been used. Possible token theft detected. All sessions have been revoked.") {
    super(message, 401, "REFRESH_TOKEN_THEFT_DETECTED");
  }
}

export class RefreshTokenRaceError extends AppError {
  constructor(message = "The session was refreshed by another request. Please retry.") {
    super(message, 409, "REFRESH_TOKEN_ALREADY_ROTATED");
  }
}

// =========== Onboarding Errors ===========
// the data may be valid by itself but sent at the wrong time, like step 2 before
// step 1. that is a state conflict, not an INVALID_SCHEMA validation error.
export class InvalidOnboardingStateError extends AppError {
  constructor(message = "This onboarding action is not allowed right now.") {
    super(message, 409, "INVALID_ONBOARDING_STATE");
  }
}

// this error belongs to the final step when saved records are still missing.
// details only contain public field names and messages for the frontend.
export class OnboardingIncompleteError extends AppError {
  constructor(details = null) {
    super(
      "Complete the required onboarding steps before finishing.",
      409,
      "ONBOARDING_INCOMPLETE",
      details
    );
  }
}

// =========== Profile Errors ===========
export class BodyProfileNotFoundError extends AppError {
  constructor(message = "Create your body profile before using this action.") {
    super(message, 404, "BODY_PROFILE_NOT_FOUND");
  }
}

export class BodyProfileAlreadyExistsError extends AppError {
  constructor(message = "A body profile already exists for this account.") {
    super(message, 409, "BODY_PROFILE_ALREADY_EXISTS");
  }
}

export class ProfileIncompleteError extends AppError {
  constructor(details = null) {
    super(
      "Complete the required profile data before using this action.",
      409,
      "PROFILE_INCOMPLETE",
      details
    );
  }
}

export class ActiveGoalRequiredError extends AppError {
  constructor(message = "An active fitness goal is required for this action.") {
    super(message, 409, "ACTIVE_GOAL_REQUIRED");
  }
}

// =========== Goal Errors ===========
export class ActiveGoalExistsError extends AppError {
  constructor(
    message = "Complete or cancel the active goal before activating another goal."
  ) {
    super(message, 409, "ACTIVE_GOAL_EXISTS");
  }
}

export class GoalNotFoundError extends AppError {
  constructor(message = "Goal not found.") {
    super(message, 404, "GOAL_NOT_FOUND");
  }
}

export class InvalidGoalStateError extends AppError {
  constructor(message = "Only a draft goal can be activated.") {
    super(message, 409, "INVALID_GOAL_STATE");
  }
}

export class GoalTypeChangeRequiredError extends AppError {
  constructor(
    message = "Change the draft goal type to match the target weight, then try again."
  ) {
    super(message, 409, "GOAL_TYPE_CHANGE_REQUIRED");
  }
}

export class InvalidGoalTargetError extends AppError {
  constructor(
    message = "Target weight does not match the selected goal type."
  ) {
    super(message, 409, "INVALID_GOAL_TARGET", [
      { field: "targetWeightKg", message },
    ]);
  }
}

export class InvalidActionConfirmationError extends AppError {
  constructor(message = "Password confirmation failed.") {
    super(message, 403, "INVALID_PASSWORD_CONFIRMATION");
  }
}

// =========== Recipe Errors ===========
export class RecipeNotFoundError extends AppError {
  constructor(message = "Recipe not found.") {
    super(message, 404, "RECIPE_NOT_FOUND");
  }
}

export class InvalidRecipeIngredientsError extends AppError {
  constructor(
    message = "One or more selected foods are unavailable."
  ) {
    super(message, 409, "INVALID_RECIPE_INGREDIENTS", [
      {
        field: "ingredients",
        message:
          "Every ingredient must reference an active global food or one of your custom foods.",
      },
    ]);
  }
}

// =========== Meal Errors ===========
export class MealNotFoundError extends AppError {
  constructor(message = "Meal not found.") {
    super(message, 404, "MEAL_NOT_FOUND");
  }
}

export class InvalidMealItemsError extends AppError {
  constructor(message = "One or more selected meal items are unavailable.") {
    super(message, 409, "INVALID_MEAL_ITEMS", [
      {
        field: "items",
        message:
          "Foods and recipes must be active, global, or owned by your account.",
      },
    ]);
  }
}

export class MealTimezoneRequiredError extends AppError {
  constructor(message = "Set your timezone before filtering meals by date.") {
    super(message, 409, "MEAL_TIMEZONE_REQUIRED", [
      { field: "timezone", message },
    ]);
  }
}

export class InvalidMealTimeError extends AppError {
  constructor(message = "A meal cannot be logged in the future.") {
    super(message, 409, "INVALID_MEAL_TIME", [
      { field: "occurredAt", message },
    ]);
  }
}

// =========== Workout Errors ===========
export class ActiveWorkoutExistsError extends AppError {
  constructor(message = "Complete or cancel your active workout first.") {
    super(message, 409, "ACTIVE_WORKOUT_EXISTS");
  }
}

export class InvalidWorkoutStartTimeError extends AppError {
  constructor(message = "A workout cannot start in the future.") {
    super(message, 409, "INVALID_WORKOUT_START_TIME", [
      { field: "startedAt", message },
    ]);
  }
}

export class WorkoutNotFoundError extends AppError {
  constructor(message = "Workout not found.") {
    super(message, 404, "WORKOUT_NOT_FOUND");
  }
}

export class InvalidWorkoutStateError extends AppError {
  constructor(message = "Only an active workout can be changed.") {
    super(message, 409, "INVALID_WORKOUT_STATE");
  }
}

export class WorkoutCompletionRequiredError extends AppError {
  constructor(
    message = "Complete at least one exercise before completing the workout."
  ) {
    super(message, 409, "WORKOUT_COMPLETION_REQUIRED", [
      { field: "exercises", message },
    ]);
  }
}

export class WorkoutExerciseNotFoundError extends AppError {
  constructor(message = "Workout exercise not found.") {
    super(message, 404, "WORKOUT_EXERCISE_NOT_FOUND");
  }
}

export class DuplicateWorkoutExerciseError extends AppError {
  constructor(message = "This exercise is already in the workout.") {
    super(message, 409, "DUPLICATE_WORKOUT_EXERCISE");
  }
}

export class WorkoutExerciseLimitError extends AppError {
  constructor(message = "A workout cannot contain more than 50 exercises.") {
    super(message, 409, "WORKOUT_EXERCISE_LIMIT_REACHED");
  }
}

export class InvalidWorkoutExerciseError extends AppError {
  constructor(details = null) {
    super(
      "The workout exercise measurements are invalid.",
      409,
      "INVALID_WORKOUT_EXERCISE",
      details
    );
  }
}

// =========== Exercise Errors ===========
export class ExerciseNotFoundError extends AppError {
  constructor(message = "Exercise not found.") {
    super(message, 404, "EXERCISE_NOT_FOUND");
  }
}

// =========== Progress Errors ===========
export class ProgressEntryNotFoundError extends AppError {
  constructor(message = "Progress entry not found.") {
    super(message, 404, "PROGRESS_ENTRY_NOT_FOUND");
  }
}

export class InvalidProgressDateError extends AppError {
  constructor(
    message = "New progress entry cannot be older than the latest entry."
  ) {
    super(message, 400, "INVALID_PROGRESS_DATE", [
      { field: "recordedAt", message },
    ]);
  }
}

export class ProgressTimezoneRequiredError extends AppError {
  constructor(
    message = "Set your timezone before filtering progress by date."
  ) {
    super(message, 409, "PROGRESS_TIMEZONE_REQUIRED", [
      { field: "timezone", message },
    ]);
  }
}

// =========== Plan Errors ===========
export class PlanContextIncompleteError extends AppError {
  constructor(details = null) {
    super(
      "Complete the required profile data and resolve readiness issues before generating a plan.",
      422,
      "PLAN_CONTEXT_INCOMPLETE",
      details
    );
  }
}

export class PlanNotEligibleError extends AppError {
  constructor(details = null) {
    super(
      "Plan generation is blocked by the current eligibility requirements.",
      422,
      "PLAN_NOT_ELIGIBLE",
      details
    );
  }
}

export class DailySummaryTimezoneRequiredError extends AppError {
  constructor(
    message = "Set your timezone before viewing a daily summary."
  ) {
    super(message, 409, "DAILY_SUMMARY_TIMEZONE_REQUIRED", [
      { field: "timezone", message },
    ]);
  }
}
// =========== AI Provider Errors ===========

export class AIProviderError extends AppError {
  constructor(
    message = "The AI provider request failed.",
    statusCode = 502,
    code = "AI_PROVIDER_ERROR"
  ) {
    super(message, statusCode, code);
  }
}

export class AIProviderRateLimitError extends AIProviderError {
  constructor(message = "The AI service is temporarily rate limited.") {
    super(
      message,
      429,
      "AI_PROVIDER_RATE_LIMITED"
    );
  }
}

export class AIProviderTimeoutError extends AIProviderError {
  constructor(message = "The AI service did not respond in time.") {
    super(
      message,
      504,
      "AI_PROVIDER_TIMEOUT"
    );
  }
}

export class AIProviderUnavailableError extends AIProviderError {
  constructor(message = "The AI service is temporarily unavailable.") {
    super(
      message,
      502,
      "AI_PROVIDER_UNAVAILABLE"
    );
  }
}

export class AIProviderInvalidResponseError extends AIProviderError {
  constructor(message = "The AI service returned an unusable response.") {
    super(
      message,
      502,
      "AI_PROVIDER_INVALID_RESPONSE"
    );
  }
}

export class AIProviderRefusalError extends AIProviderError {
  constructor(message = "The AI service refused to generate the requested content.") {
    super(
      message,
      502,
      "AI_PROVIDER_REFUSAL"
    );
  }
}

export class AIProviderTruncatedResponseError extends AIProviderError {
  constructor(message = "The AI service response was incomplete.") {
    super(
      message,
      502,
      "AI_PROVIDER_TRUNCATED_RESPONSE"
    );
  }
}

// Generation-stage failures use application codes instead of plain Error.
export class PlanGenerationError extends AppError {
  constructor(message, code = "PLAN_GENERATION_FAILED", details = null, statusCode = 502) {
    super(message, statusCode, code, details);
  }
}

export class PlanContentInvalidError extends AppError {
  constructor(details) {
    super("The generated plan failed the user-specific rules.", 422, "PLAN_CONTENT_INVALID", details);
  }
}

export class PlanDraftConflictError extends AppError {
  constructor() {
    super("Your planning context changed during generation. Please generate your plan again.",
      409, "PLAN_CONTEXT_CHANGED");
  }
}

export class PlanNotFoundError extends AppError {
  constructor() {
    super("Plan not found.", 404, "PLAN_NOT_FOUND");
  }
}

export class PlanActivationConflictError extends AppError {
  constructor(message, code = "PLAN_ACTIVATION_CONFLICT") {
    super(message, 409, code);
  }
}

export class PlanStatusConflictError extends AppError {
  constructor(message, code = "PLAN_STATUS_CONFLICT") {
    super(message, 409, code);
  }
}

