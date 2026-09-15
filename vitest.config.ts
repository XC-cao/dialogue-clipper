import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts', 'entrypoints/**/*.{ts,tsx}'],
      exclude: ['entrypoints/popup/main.tsx', 'entrypoints/sidepanel/main.tsx']
    }
  }
});
