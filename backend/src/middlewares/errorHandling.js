export class AppError extends Error {
    constructor(message, statusCode , code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true; // Mark this error as operational (expected)
        Error.captureStackTrace(
             this,             // object receiving the .stack property
             this.constructor  // remove frames through this constructor
        );
    }
}

// types or errors i have uptill now 
// 1. SignUp EndPoint 
// 1.1. the client sent invalid schema 
// 1.2. 429 
// 1.3. nodemailer failed to send email
// 1.4. the repo failed to create the user <database error>
export class invalidSchemaError extends AppError {
    constructor(message) {
        super(message, 400, "INVALID_SCHEMA"); // 400 Bad Request
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
// 2. Verify Email Endpoint
// 2.1. the client sent invalid schema 
// 2.2. the repo failed to find the user with that token or the token is expired
export class invalidTokenError extends AppError {
    constructor(message) {
        super(message, 400, "INVALID_TOKEN"); // 400 Bad Request
    }
}
