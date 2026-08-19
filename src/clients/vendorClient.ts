import { z } from 'zod';
import { env } from '../config/env.js';
import { UpstreamError } from '../errors/UpstreamError.js';

export const vendorFindingSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['SAST', 'SCA']),
  repository: z.string(),
  branch: z.string(),
  commit: z.string(),
  language: z.string(),
  category: z.string(),
  title: z.string(),
  description: z.string(),
  ruleId: z.string(),
  file: z.string(),
  line: z.number().int(),
  score: z.number().int().min(0).max(1000),
  status: z.enum(['OPEN', 'FIXED', 'IGNORED']),
  author: z.string(),
  detectedAt: z.string(),
  updatedAt: z.string(),
});

export type VendorFinding = z.infer<typeof vendorFindingSchema>;

const vendorPageSchema = z.object({
  page: z.number(),
  hasNext: z.boolean(),
  total: z.number(),
  totalPages: z.number(),
  data: z.array(z.unknown()),
});

export interface SkippedRecord {
  raw: unknown;
  reason: string;
}

export interface VendorPageResult {
  page: number;
  hasNext: boolean;
  total: number;
  totalPages: number;
  validFindings: VendorFinding[];
  skipped: SkippedRecord[];
}

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: URL, page: number): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${env.VENDOR_API_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) return response;

      // 429 é transiente por natureza (rate limit) — vale re-tentar como um 5xx.
      // Outros 4xx (ex: token rejeitado) não são transientes: tentar de novo
      // não muda o resultado.
      if (response.status < 500 && response.status !== 429) {
        throw new UpstreamError(`Vendor API returned ${response.status} for page ${page}`);
      }

      lastError = new Error(`Vendor API returned ${response.status} for page ${page}`);
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      lastError = err;
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new UpstreamError(`Failed to reach vendor API on page ${page} after ${MAX_ATTEMPTS} attempts: ${reason}`);
}

export async function fetchFindingsPage(page: number, limit = 100): Promise<VendorPageResult> {
  const url = new URL('/api/v1/findings', env.VENDOR_API_BASE_URL);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));

  const response = await fetchWithRetry(url, page);

  let rawBody: unknown;
  try {
    rawBody = await response.json();
  } catch {
    throw new UpstreamError(`Vendor API returned invalid JSON for page ${page}`);
  }

  // Envelope de página malformado é problema do fornecedor, não nosso —
  // vira 502 (erro de infraestrutura), consistente com o resto deste
  // arquivo, em vez de vazar como um 500 genérico não mapeado.
  const parsedPage = vendorPageSchema.safeParse(rawBody);
  if (!parsedPage.success) {
    throw new UpstreamError(
      `Vendor API returned an unexpected response shape for page ${page}: ${parsedPage.error.message}`,
    );
  }
  const body = parsedPage.data;

  const validFindings: VendorFinding[] = [];
  const skipped: SkippedRecord[] = [];

  for (const raw of body.data) {
    const result = vendorFindingSchema.safeParse(raw);
    if (result.success) {
      validFindings.push(result.data);
    } else {
      skipped.push({ raw, reason: result.error.message });
    }
  }

  return {
    page: body.page,
    hasNext: body.hasNext,
    total: body.total,
    totalPages: body.totalPages,
    validFindings,
    skipped,
  };
}
