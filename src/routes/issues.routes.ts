import { Router } from 'express';
import { getIssueController, listIssuesController } from '../controllers/issues.controller.js';
import { validate } from '../middleware/validate.js';
import { findingIdParamSchema, listFindingsQuerySchema } from '../validators/issues.validators.js';

export const issuesRouter = Router();

issuesRouter.get('/issues', validate(listFindingsQuerySchema, 'query'), listIssuesController);
issuesRouter.get('/issues/:id', validate(findingIdParamSchema, 'params'), getIssueController);
