import { describe, expect, it } from 'vitest';
import { classify } from './classification.js';

describe('classify — exemplos do Business Case', () => {
  it.each([
    [850, 'SQL Injection', 'P1'],
    [650, 'SQL Injection', 'P1'],
    [650, 'Weak Encryption', 'P2'],
    [350, 'Command Injection', 'P2'],
    [350, 'Cross-Site Scripting', 'P3'],
    [250, 'Path Traversal', 'P3'],
    [180, 'Hardcoded Secret', 'P4'],
    [180, 'Information Disclosure', 'P5'],
  ] as const)('SAST score=%i categoria=%s -> %s', (score, category, expected) => {
    expect(classify({ type: 'SAST', score, category })).toBe(expected);
  });
});

describe('classify — faixas de score (baseline, igual para SCA e SAST sem categoria prioritária)', () => {
  it.each([
    [1000, 'P1'],
    [700, 'P1'],
    [699, 'P2'],
    [400, 'P2'],
    [399, 'P3'],
    [300, 'P3'],
    [299, 'P4'],
    [200, 'P4'],
    [199, 'P5'],
    [0, 'P5'],
  ] as const)('score=%i -> %s', (score, expected) => {
    expect(classify({ type: 'SCA', score, category: 'Weak Encryption' })).toBe(expected);
    expect(classify({ type: 'SAST', score, category: 'Weak Encryption' })).toBe(expected);
  });

  it('trata score fora do range documentado de forma defensiva (aberto nas pontas)', () => {
    expect(classify({ type: 'SCA', score: -50, category: 'Weak Encryption' })).toBe('P5');
    expect(classify({ type: 'SCA', score: 5000, category: 'Weak Encryption' })).toBe('P1');
  });
});

describe('classify — SCA nunca é promovido por categoria', () => {
  it('mesmo com categoria prioritária, SCA usa só o score', () => {
    expect(classify({ type: 'SCA', score: 650, category: 'SQL Injection' })).toBe('P2');
  });
});

describe('classify — teto em P1', () => {
  it('promoção em cima de P1 permanece P1', () => {
    expect(classify({ type: 'SAST', score: 900, category: 'Remote Code Execution' })).toBe('P1');
  });
});

describe('classify — matching de categoria é case-insensitive e ignora espaços nas pontas', () => {
  it('categoria em minúsculo ainda promove', () => {
    expect(classify({ type: 'SAST', score: 350, category: '  sql injection  ' })).toBe('P2');
  });
});
