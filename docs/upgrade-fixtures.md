# Upgrade fixtures

`src/__tests__/releaseUpgrade.test.ts` proves that data saved by released builds still loads on `main`. Each folder in `src/__tests__/__data__/releases/` holds what one release wrote for the same made-up records (`scenario.ts`):

- `stores.json`: every persisted store's `{ state, version }` blob, as its persist middleware saved it to MMKV.
- `backup.json`: the file its Settings → Export wrote.

For each release, the suite launches the current build on those blobs (persist `migrate`/`merge`, then the boot migrations in `useAppMigrations` order) and restores the backup file on a fresh install. It checks that no store fails to load, every store ends at its current `version`, every record, tombstone, and setting comes through, and a second launch changes nothing.

## When you cut a release

Add the release's fixture in the version bump commit, from the release commit's code:

```bash
RELEASE_FIXTURE=X.Y.Z pnpm vitest run src/__tests__/releaseFixturesGenerate.test.ts
pnpm vitest run src/__tests__/releaseUpgrade.test.ts
```

The first command writes `src/__tests__/__data__/releases/vX.Y.Z/`. Commit it as written; `.prettierignore` keeps the JSON byte-for-byte.

## When you change a store

- **Bumping a store's `version` or adding a boot migration:** the suite runs your migration on every release fixture. If it changes a value on purpose, tell the suite in the same change (for example `MIGRATED_PREFERENCES`, or a release gate like the additive Plans check). Don't edit the old fixtures: they're what users have on their devices.
- **A new persisted store or record type:** add its records to `scenario.ts`, write them in `releaseFixturesGenerate.test.ts`, add the store to `launch()` in `releaseUpgrade.test.ts`, and check them there from the first release that has them (`coverage()`).
- **Older releases:** the existing fixtures came from running each tag's own stores in a throwaway worktree (`git worktree add --detach … vX.Y.Z`) with in-memory MMKV. To add one for a release before 1.45, generate it the same way rather than writing JSON by hand.
