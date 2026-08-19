import type { Finding } from '../generated/prisma/client.js';
import * as findingsRepository from '../repositories/findings.repository.js';
import type { ListFindingsFilters } from '../repositories/findings.repository.js';
import { NotFoundError } from '../errors/NotFoundError.js';

// Campo público `id` = externalId do fornecedor — é a identidade natural e
// estável do finding; o id interno (serial do Postgres) nunca é exposto pela API.
function toSummary(finding: Finding) {
  return {
    id: finding.externalId,
    type: finding.type,
    repository: finding.repository,
    branch: finding.branch,
    commit: finding.commit,
    language: finding.language,
    category: finding.category,
    title: finding.title,
    score: finding.score,
    status: finding.status,
    classification: finding.classification,
    detectedAt: finding.detectedAt.toISOString(),
    updatedAt: finding.vendorUpdatedAt.toISOString(),
  };
}

function toDetail(finding: Finding) {
  return {
    ...toSummary(finding),
    description: finding.description,
    ruleId: finding.ruleId,
    file: finding.file,
    line: finding.line,
    author: finding.author,
  };
}

export interface ListFindingsParams extends ListFindingsFilters {
  page: number;
  limit: number;
}

export async function listFindings(params: ListFindingsParams) {
  const { page, limit, ...filters } = params;
  const { data, total } = await findingsRepository.findMany(filters, page, limit);

  const totalPages = Math.ceil(total / limit) || 0;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
    data: data.map(toSummary),
  };
}

export async function getFindingById(id: string) {
  const finding = await findingsRepository.findByExternalId(id);

  if (!finding) {
    throw new NotFoundError(`Finding '${id}' not found.`);
  }

  return toDetail(finding);
}
