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

export class InvalidActionConfirmationError extends AppError {
  constructor(message = "Password confirmation failed.") {
    super(message, 403, "INVALID_PASSWORD_CONFIRMATION");
  }
}
