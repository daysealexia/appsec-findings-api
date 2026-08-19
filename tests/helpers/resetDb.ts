import { prisma } from '../../src/db/client.js';

export async function resetDb(): Promise<void> {
  await prisma.finding.deleteMany();
}
