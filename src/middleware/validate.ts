import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { ValidationError } from '../errors/ValidationError.js';

type Source = 'query' | 'params';

/**
 * No Express 5, `req.query` é um getter que reparseia a query string bruta
 * a cada acesso (sem cache, sem setter) — mutar/reatribuir `req.query` não
 * "gruda". Por isso o dado validado (com coerções e defaults do Zod já
 * aplicados) vai pra `res.locals`, que é o canal padrão do Express pra
 * middleware repassar dado computado pro próximo handler.
 */
export function validate(schema: ZodType, source: Source) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      next(new ValidationError('Invalid request.', result.error.issues));
      return;
    }

    res.locals[source] = result.data;
    next();
  };
}
