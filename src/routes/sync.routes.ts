import { Router } from 'express';
import { syncController } from '../controllers/sync.controller.js';
import { syncRateLimit } from '../middleware/syncRateLimit.js';

export const syncRouter = Router();

syncRouter.post('/sync', syncRateLimit, syncController);
