import express from 'express';
import helmet from 'helmet';
import { syncRouter } from './routes/sync.routes.js';
import { issuesRouter } from './routes/issues.routes.js';
import { metricsRouter } from './routes/metrics.routes.js';
import { docsRouter } from './routes/docs.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(requestContext);

  app.get('/health', (_req, res) => {
    res.json({ status: 'UP' });
  });

  app.use(syncRouter);
  app.use(issuesRouter);
  app.use(metricsRouter);
  app.use(docsRouter);

  app.use(errorHandler);

  return app;
}
