import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';
import { resetDb } from '../helpers/resetDb.js';

const app = createApp();

describe('POST /sync', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('sincroniza todos os findings do fornecedor', async () => {
    const response = await request(app).post('/sync');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('completed');
    expect(response.body.recordsFetched).toBe(20_000);
    expect(response.body.recordsSkipped).toBe(0);

    const count = await prisma.finding.count();
    expect(count).toBe(20_000);
  }, 30_000);

  it('é idempotente: rodar de novo não duplica registros', async () => {
    const before = await prisma.finding.count();

    const response = await request(app).post('/sync');

    expect(response.status).toBe(200);
    expect(response.body.recordsCreated).toBe(0);
    expect(response.body.recordsUpdated).toBe(20_000);

    const after = await prisma.finding.count();
    expect(after).toBe(before);
  }, 30_000);
});
