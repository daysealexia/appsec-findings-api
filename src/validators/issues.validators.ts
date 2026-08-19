import { z } from 'zod';

export const listFindingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  repository: z.string().trim().min(1).max(200).optional(),
  type: z.enum(['SAST', 'SCA']).optional(),
  status: z.enum(['OPEN', 'FIXED', 'IGNORED']).optional(),
  classification: z.enum(['P1', 'P2', 'P3', 'P4', 'P5']).optional(),
});

export type ListFindingsQuery = z.infer<typeof listFindingsQuerySchema>;

export const findingIdParamSchema = z.object({
  id: z.string().trim().min(1),
});
