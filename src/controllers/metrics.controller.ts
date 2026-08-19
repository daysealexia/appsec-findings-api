import type { Request, Response } from 'express';
import * as metricsService from '../services/metrics.service.js';

export async function getMetricsController(_req: Request, res: Response) {
  const metrics = await metricsService.getMetrics();
  res.status(200).json(metrics);
}
