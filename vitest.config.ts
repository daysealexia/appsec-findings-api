import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
    // Explícito por segurança: dist/ pode conter *.test.js compilado por
    // engano (já aconteceu — ver tsconfig.build.json) e não deve ser
    // executado como suíte de testes duplicada.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
