import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  VENDOR_API_BASE_URL: z.string().url().default('http://localhost:3000'),
  VENDOR_API_TOKEN: z.string().uuid(),
  PORT: z.coerce.number().int().min(1).default(3333),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'silent']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
