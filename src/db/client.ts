import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';

// Prisma 7 exige um driver adapter explícito (driver JS nativo, aqui o `pg`)
// em vez do antigo engine binário conectando direto pela connection string.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
