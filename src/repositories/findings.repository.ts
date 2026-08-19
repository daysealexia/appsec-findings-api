import { Prisma, type Finding } from '../generated/prisma/client.js';
import { prisma } from '../db/client.js';
import type { Classification } from '../domain/classification.js';
import type { VendorFinding } from '../clients/vendorClient.js';
import type { FindingType, FindingStatus } from '../generated/prisma/enums.js';

export interface ClassifiedFinding extends VendorFinding {
  classification: Classification;
}

export interface UpsertSummary {
  created: number;
  updated: number;
}

/**
 * Upsert em lote via SQL bruto (não Prisma Client comum): o Prisma não tem
 * upsert em massa com ON CONFLICT nativo — usar `.upsert()` em loop
 * custaria 1 round-trip por registro, inviável pra 20k linhas.
 * `Prisma.sql`/`Prisma.join` parametrizam cada valor automaticamente,
 * então isso não reabre risco de SQL injection.
 *
 * O truque `RETURNING (xmax = 0) AS inserted` é um idioma conhecido do
 * Postgres: `xmax` é a coluna de sistema que guarda o id da transação que
 * "invalidou" a linha por um UPDATE. Numa linha recém-inserida ela é 0 —
 * então `xmax = 0` distingue, linha a linha, o que foi INSERT do que foi
 * UPDATE dentro do mesmo comando.
 */
export async function upsertMany(findings: ClassifiedFinding[]): Promise<UpsertSummary> {
  if (findings.length === 0) {
    return { created: 0, updated: 0 };
  }

  const values = findings.map(
    (f) => Prisma.sql`(
      ${f.id}, ${f.type}::"FindingType", ${f.repository}, ${f.branch}, ${f.commit},
      ${f.language}, ${f.category}, ${f.title}, ${f.description}, ${f.ruleId},
      ${f.file}, ${f.line}, ${f.score}, ${f.status}::"FindingStatus",
      ${f.classification}::"Classification", ${f.author},
      ${f.detectedAt}::timestamptz, ${f.updatedAt}::timestamptz, now(), now()
    )`,
  );

  const rows = await prisma.$queryRaw<Array<{ inserted: boolean }>>(Prisma.sql`
    INSERT INTO findings (
      external_id, type, repository, branch, commit, language, category, title,
      description, rule_id, file, line, score, status, classification, author,
      detected_at, vendor_updated_at, first_synced_at, last_synced_at
    )
    VALUES ${Prisma.join(values)}
    ON CONFLICT (external_id) DO UPDATE SET
      type = EXCLUDED.type,
      repository = EXCLUDED.repository,
      branch = EXCLUDED.branch,
      commit = EXCLUDED.commit,
      language = EXCLUDED.language,
      category = EXCLUDED.category,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      rule_id = EXCLUDED.rule_id,
      file = EXCLUDED.file,
      line = EXCLUDED.line,
      score = EXCLUDED.score,
      status = EXCLUDED.status,
      classification = EXCLUDED.classification,
      author = EXCLUDED.author,
      detected_at = EXCLUDED.detected_at,
      vendor_updated_at = EXCLUDED.vendor_updated_at,
      last_synced_at = now()
    RETURNING (xmax = 0) AS inserted
  `);

  const created = rows.filter((r) => r.inserted).length;
  return { created, updated: rows.length - created };
}

export interface ListFindingsFilters {
  repository?: string | undefined;
  type?: FindingType | undefined;
  status?: FindingStatus | undefined;
  classification?: Classification | undefined;
}

export interface ListFindingsResult {
  data: Finding[];
  total: number;
}

export async function findMany(
  filters: ListFindingsFilters,
  page: number,
  limit: number,
): Promise<ListFindingsResult> {
  const where = {
    ...(filters.repository && { repository: filters.repository }),
    ...(filters.type && { type: filters.type }),
    ...(filters.status && { status: filters.status }),
    ...(filters.classification && { classification: filters.classification }),
  };

  const [data, total] = await Promise.all([
    prisma.finding.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { id: 'asc' } }),
    prisma.finding.count({ where }),
  ]);

  return { data, total };
}

export async function findByExternalId(externalId: string): Promise<Finding | null> {
  return prisma.finding.findUnique({ where: { externalId } });
}

export async function getMetricsRaw() {
  const [total, byStatus, byClassification] = await Promise.all([
    prisma.finding.count(),
    prisma.finding.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.finding.groupBy({ by: ['classification'], _count: { _all: true } }),
  ]);

  return { total, byStatus, byClassification };
}
