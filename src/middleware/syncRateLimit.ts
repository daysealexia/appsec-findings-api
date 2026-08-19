import rateLimit from 'express-rate-limit';

// /sync é, de longe, o endpoint mais caro (paginação completa + upsert em
// massa) — limita chamadas repetidas por engano/abuso sem restringir as
// rotas de leitura, que são baratas. Em memória: não há múltiplas
// instâncias do processo neste escopo.
export const syncRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many sync requests. Please wait before trying again.',
    },
  },
});
