import type { Request, Response } from 'express';
import { runSync } from '../services/sync.service.js';

export async function syncController(req: Request, res: Response) {
  const summary = await runSync(req.log);
  res.status(200).json(summary);
}
