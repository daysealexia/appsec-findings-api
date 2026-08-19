import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { resetDb } from '../helpers/resetDb.js';

const app = createApp();

describe('GET /metrics', () => {
  beforeAll(async () => {
    await resetDb();
    await request(app).post('/sync');
  }, 30_000);

  it('soma das classificações bate exatamente com o total', async () => {
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    const { total, classification } = response.body as {
      total: number;
      classification: Record<string, number>;
    };
    const sum = Object.values(classification).reduce((acc, value) => acc + value, 0);
    expect(sum).toBe(total);
    expect(Object.keys(classification).sort()).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
  });

  it('soma dos status bate exatamente com o total', async () => {
    const response = await request(app).get('/metrics');

    const { total, open, fixed, ignored } = response.body as {
      total: number;
      open: number;
      fixed: number;
      ignored: number;
    };
    expect(open + fixed + ignored).toBe(total);
  });
});
