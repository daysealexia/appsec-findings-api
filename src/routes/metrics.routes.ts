import { Router } from 'express';
import { getMetricsController } from '../controllers/metrics.controller.js';

export const metricsRouter = Router();

metricsRouter.get('/metrics', getMetricsController);
