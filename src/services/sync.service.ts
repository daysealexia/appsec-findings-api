import type { Logger } from 'pino';
import { classify } from '../domain/classification.js';
import { fetchFindingsPage } from '../clients/vendorClient.js';
import { upsertMany, type ClassifiedFinding } from '../repositories/findings.repository.js';
import { UpstreamError } from '../errors/UpstreamError.js';

export interface SyncSummary {
  status: 'completed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  pagesFetched: number;
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
}

interface Totals {
  pagesFetched: number;
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
}

// Requisições de página simultâneas. Sem rate limit documentado pelo
// fornecedor — 5 é um valor conservador, não medido cientificamente,
// documentado aqui como ponto de ajuste caso o volume real mude.
const CONCURRENCY = 5;

async function processPage(page: number, totals: Totals, log: Logger): Promise<number> {
  const result = await fetchFindingsPage(page);

  for (const record of result.skipped) {
    log.warn({ page, reason: record.reason, raw: record.raw }, 'Registro descartado (schema inválido)');
  }

  const classified: ClassifiedFinding[] = result.validFindings.map((finding) => ({
    ...finding,
    classification: classify(finding),
  }));

  const { created, updated } = await upsertMany(classified);

  totals.pagesFetched += 1;
  totals.recordsFetched += result.validFindings.length + result.skipped.length;
  totals.recordsCreated += created;
  totals.recordsUpdated += updated;
  totals.recordsSkipped += result.skipped.length;

  return result.totalPages;
}

export async function runSync(log: Logger): Promise<SyncSummary> {
  const startedAt = new Date();

  const totals: Totals = {
    pagesFetched: 0,
    recordsFetched: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsSkipped: 0,
  };

  try {
    // Página 1 sozinha primeiro: é ela que informa quantas páginas existem
    // no total. O dataset do fornecedor é estático (carregado uma vez em
    // memória no startup dele — README do mock), então esse número é
    // confiável pro resto da sincronização, mesmo buscando em paralelo.
    const totalPages = await processPage(1, totals, log);

    if (totalPages > 1) {
      let nextPage = 2;
      let stopped = false;

      // Pool de workers: cada um pega o próximo número de página disponível
      // até acabar. `nextPage++` é seguro sem lock porque o Node é
      // single-threaded — não há race condition entre o incremento e a
      // leitura dentro do mesmo tick síncrono. `stopped` limita o estrago
      // quando um worker falha: os outros terminam a página em andamento e
      // não começam mais nenhuma, em vez de continuar em background depois
      // que a resposta de erro já foi enviada ao cliente.
      const worker = async () => {
        while (!stopped && nextPage <= totalPages) {
          const page = nextPage++;
          try {
            await processPage(page, totals, log);
          } catch (err) {
            stopped = true;
            throw err;
          }
        }
      };

      const workerCount = Math.min(CONCURRENCY, totalPages - 1);
      await Promise.all(Array.from({ length: workerCount }, worker));
    }
  } catch (err) {
    // Os dois try/catch deste arquivo seguem o mesmo padrão deliberado:
    // nenhum "trata" o erro, ambos só enriquecem contexto antes de deixá-lo
    // continuar subindo — o do worker sinaliza `stopped` pros outros workers
    // pararem cedo, este aqui anexa o progresso já persistido pro middleware
    // central. Como o upsert é idempotente, o cliente sabe que pode chamar
    // /sync de novo pra completar o restante.
    if (err instanceof UpstreamError) {
      err.details = { progress: totals };
    }
    throw err;
  }

  const finishedAt = new Date();
  const summary: SyncSummary = {
    status: 'completed',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    ...totals,
  };

  // Só os contadores agregados, nunca o payload dos findings — findings
  // são dado sensível de segurança, não pertencem ao log.
  log.info(summary, 'Sync concluído');

  return summary;
}
