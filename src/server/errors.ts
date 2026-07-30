/** An error with an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError(400, "BAD_REQUEST", message, details);

export const unauthorized = (message = "Authentication required."): AppError =>
  new AppError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "You do not have access to this resource."): AppError =>
  new AppError(403, "FORBIDDEN", message);

export const notFound = (message = "Not found."): AppError =>
  new AppError(404, "NOT_FOUND", message);

export const conflict = (message: string, details?: unknown): AppError =>
  new AppError(409, "CONFLICT", message, details);

export const tooManyRequests = (message = "Too many requests."): AppError =>
  new AppError(429, "TOO_MANY_REQUESTS", message);
