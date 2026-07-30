import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Vitest harness for the pure `core/` modules only. This project has no test
// runner otherwise — `core/**` is deliberately plain TypeScript (no
// react-native / expo / MMKV imports, see `core/scheduler/types.ts`), so it
// runs unmodified under plain Node. The `@/*` path alias is normally defined
// only in tsconfig.json (consumed by Metro/TS, not by Vitest), so it is
// re-declared here pointing at the repo root.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['core/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['core/**/*.ts'],
      exclude: ['core/**/__tests__/**', 'core/ai-actions.ts', 'core/learning/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
