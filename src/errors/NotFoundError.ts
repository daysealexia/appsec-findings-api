import { AppError } from './AppError.js';

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'FINDING_NOT_FOUND';
}
