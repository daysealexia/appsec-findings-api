import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { resetDb } from '../helpers/resetDb.js';

const app = createApp();

describe('GET /issues', () => {
  beforeAll(async () => {
    await resetDb();
    await request(app).post('/sync');
  }, 30_000);

  it('retorna listagem paginada com o envelope esperado', async () => {
    const response = await request(app).get('/issues?limit=5');

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(20_000);
    expect(response.body.limit).toBe(5);
    expect(response.body.data).toHaveLength(5);
  });

  it('filtra por classification', async () => {
    const response = await request(app).get('/issues?classification=P1&limit=100');

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    for (const finding of response.body.data) {
      expect(finding.classification).toBe('P1');
    }
  });

  it('combina múltiplos filtros', async () => {
    const response = await request(app).get('/issues?type=SAST&status=OPEN&limit=50');

    expect(response.status).toBe(200);
    for (const finding of response.body.data) {
      expect(finding.type).toBe('SAST');
      expect(finding.status).toBe('OPEN');
    }
  });

  it('rejeita filtro inválido com 400', async () => {
    const response = await request(app).get('/issues?type=INVALID');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /issues/:id', () => {
  it('retorna o finding completo pra um id existente', async () => {
    const response = await request(app).get('/issues/ISS-000001');

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('ISS-000001');
    expect(response.body).toHaveProperty('description');
    expect(response.body).toHaveProperty('classification');
  });

  it('retorna 404 pra um id inexistente', async () => {
    const response = await request(app).get('/issues/ISS-999999');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('FINDING_NOT_FOUND');
  });
});
