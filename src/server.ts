import { env } from './config/env.js';
import { createApp } from './app.js';
import { logger } from './logger.js';
import { prisma } from './db/client.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down gracefully');

  // Se o close/disconnect travar (ex: conexão pendurada), força saída em
  // vez de deixar o processo pendurado indefinidamente.
  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  server.close(() => {
    prisma
      .$disconnect()
      .catch((err: unknown) => logger.error({ err }, 'Error disconnecting Prisma'))
      .finally(() => {
        clearTimeout(forceExitTimer);
        process.exit(0);
      });
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Última linha de defesa: um erro que chega até aqui é, por definição, um
// erro que não previmos — o estado interno pode estar inconsistente, então
// é mais seguro derrubar o processo e deixá-lo reiniciar limpo do que
// continuar servindo requisições.
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection — shutting down');
  process.exit(1);
});
