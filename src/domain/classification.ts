export type FindingType = 'SAST' | 'SCA';
export type Classification = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export interface ClassifiableFinding {
  type: FindingType;
  score: number;
  category: string;
}

const PRIORITY_CATEGORIES = new Set(
  [
    'SQL Injection',
    'Command Injection',
    'Remote Code Execution',
    'SSRF',
    'Authentication Bypass',
    'Deserialization',
    'Hardcoded Secret',
    'Hardcoded Password',
    'Path Traversal',
  ].map(normalizeCategory),
);

const PROMOTION: Record<Classification, Classification> = {
  P5: 'P4',
  P4: 'P3',
  P3: 'P2',
  P2: 'P1',
  P1: 'P1',
};

function normalizeCategory(category: string): string {
  return category.trim().toLowerCase();
}

/**
 * Faixas abertas nas pontas (>=700 / <=199) em vez de fechadas (700-1000):
 * um score fora do range documentado ainda cai numa faixa válida.
 */
function scoreToTier(score: number): Classification {
  if (score >= 700) return 'P1';
  if (score >= 400) return 'P2';
  if (score >= 300) return 'P3';
  if (score >= 200) return 'P4';
  return 'P5';
}

export function classify(finding: ClassifiableFinding): Classification {
  const initialTier = scoreToTier(finding.score);

  if (finding.type === 'SCA') {
    return initialTier;
  }

  const isPriorityCategory = PRIORITY_CATEGORIES.has(normalizeCategory(finding.category));
  return isPriorityCategory ? PROMOTION[initialTier] : initialTier;
}
