import pino from 'pino';
import { env } from './config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'VENDOR_API_TOKEN', 'DATABASE_URL'],
    censor: '[REDACTED]',
  },
  // `transport` não pode ser `undefined` explícito com exactOptionalPropertyTypes:
  // só inclui a chave quando ela realmente se aplica.
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});
