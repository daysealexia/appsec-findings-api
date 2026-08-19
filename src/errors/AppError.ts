export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly isOperational = true;

  constructor(
    message: string,
    public details?: unknown,
  ) {
    super(message);
    Error.captureStackTrace(this, new.target);
  }
}
