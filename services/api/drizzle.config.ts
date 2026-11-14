import { defineConfig } from 'drizzle-kit'

/**
 * `pnpm db:generate` writes SQL migrations for the accounts database (D1
 * `ACCOUNTS_DB`) from `src/accounts/schema.ts`. Wrangler applies them:
 * `wrangler d1 migrations apply ww-accounts[-dev]` (see AGENTS.md).
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/accounts/schema.ts',
  out: './migrations/accounts',
})
