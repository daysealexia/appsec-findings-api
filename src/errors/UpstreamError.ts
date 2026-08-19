import { AppError } from './AppError.js';

export class UpstreamError extends AppError {
  readonly statusCode = 502;
  readonly code = 'UPSTREAM_UNAVAILABLE';
}
