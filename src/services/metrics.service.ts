import * as findingsRepository from '../repositories/findings.repository.js';
import type { FindingStatus, Classification } from '../generated/prisma/enums.js';

const STATUS_KEYS = ['OPEN', 'FIXED', 'IGNORED'] as const satisfies readonly FindingStatus[];
const CLASSIFICATION_KEYS = ['P1', 'P2', 'P3', 'P4', 'P5'] as const satisfies readonly Classification[];

export async function getMetrics() {
  const { total, byStatus, byClassification } = await findingsRepository.getMetricsRaw();

  // groupBy só retorna grupos que existem — sem isso, uma classificação sem
  // nenhum finding (ex: P1 zerado) sumiria da resposta em vez de aparecer como 0.
  const statusCounts = Object.fromEntries(STATUS_KEYS.map((key) => [key, 0])) as Record<
    (typeof STATUS_KEYS)[number],
    number
  >;
  for (const row of byStatus) {
    statusCounts[row.status] = row._count._all;
  }

  const classificationCounts = Object.fromEntries(CLASSIFICATION_KEYS.map((key) => [key, 0])) as Record<
    (typeof CLASSIFICATION_KEYS)[number],
    number
  >;
  for (const row of byClassification) {
    classificationCounts[row.classification] = row._count._all;
  }

  return {
    total,
    open: statusCounts.OPEN,
    fixed: statusCounts.FIXED,
    ignored: statusCounts.IGNORED,
    classification: classificationCounts,
  };
}
