import type { Request, Response } from 'express';
import * as issuesService from '../services/issues.service.js';
import type { ListFindingsQuery } from '../validators/issues.validators.js';

export async function listIssuesController(_req: Request, res: Response) {
  // Dado validado vem de res.locals, não de req.query — ver validate.ts.
  const query = res.locals.query as ListFindingsQuery;
  const result = await issuesService.listFindings(query);
  res.status(200).json(result);
}

export async function getIssueController(_req: Request, res: Response) {
  const { id } = res.locals.params as { id: string };
  const finding = await issuesService.getFindingById(id);
  res.status(200).json(finding);
}
