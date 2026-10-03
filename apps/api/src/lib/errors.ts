import { ERROR_CODES, type ErrorCode } from "@opsflow/shared";

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status: number,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AppError";
  }

  static unauthorized(message = "Authentication required") {
    return new AppError(ERROR_CODES.UNAUTHORIZED, message, 401);
  }

  static forbidden(message = "You are not allowed to perform this action") {
    return new AppError(ERROR_CODES.FORBIDDEN, message, 403);
  }

  static notFound(message = "Resource not found") {
    return new AppError(ERROR_CODES.NOT_FOUND, message, 404);
  }

  static validation(message: string, details: Record<string, unknown> = {}) {
    return new AppError(ERROR_CODES.VALIDATION_ERROR, message, 400, details);
  }

  static versionConflict() {
    return new AppError(
      ERROR_CODES.VERSION_CONFLICT,
      "This work item was modified by another user. Refresh to see the latest version.",
      409,
    );
  }

  static assignmentConflict(message: string) {
    return new AppError(ERROR_CODES.ASSIGNMENT_CONFLICT, message, 409);
  }

  static workflow(message: string, details: Record<string, unknown> = {}) {
    return new AppError(ERROR_CODES.INVALID_WORKFLOW, message, 400, details);
  }
}
