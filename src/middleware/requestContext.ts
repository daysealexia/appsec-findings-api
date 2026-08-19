import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../logger.js';

// Cada requisição ganha um id de correlação: se o cliente já mandou
// `x-request-id`, reaproveita (útil quando essa API é chamada por outro
// serviço que já rastreia a própria cadeia de chamadas); senão, gera um novo.
// `req.log`/`res.log` viram loggers-filhos com esse id embutido em cada linha.
export const requestContext = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id']?.toString() ?? randomUUID(),
});
