# Upgrade fixtures

`src/__tests__/releaseUpgrade.test.ts` proves that data saved by released builds still loads on `main`. Each folder in `src/__tests__/__data__/releases/` holds what one release wrote for the same made-up records (`scenario.ts`):

- `stores.json`: every persisted store's `{ state, version }` blob, as its persist middleware saved it to MMKV. That includes the device-local stores neither sync nor the backup file holds: App Lock, the sidebar and split sheet layouts, Buddies, calendar sync, the bell, the streak celebration, the plan cache, the geocode retry queue, the Map's Find skips, saved routes and places, and Scribe AI's conversations, undo records and usage.
- `mmkv.json`: the MMKV instances of their own that hold the User's work (Notes Import's history, in releases before Scribe AI), key by key.
- `backup.json`: the file its Settings → Export wrote.
- `icloud.json` and `google-drive.json`: the per-device file sync wrote when the User turned it on, on iOS and on Android. 1.40.0, the first release with sync, has the older iCloud format; Android sync (Google Drive) started in 1.44.

For each release, the suite launches the current build on those blobs (persist `migrate`/`merge`, then the boot migrations in `useAppMigrations` order) and restores the backup file on a fresh install. It checks that no store fails to load, every store ends at its current `version`, every record, tombstone, and setting comes through, and a second launch changes nothing. It launches once more the morning after the release wrote them to check the device-local stores, since Buddies, the bell and Scribe AI (conversations after 90 days, Undo after 30) drop what has lapsed by launch.

With the sync files in the cloud, it runs the sync engine on that platform's transport twice: turning sync on with a fresh install, which restores the file, and turning sync on after upgrading from that release, which merges it ("Merge both") and pushes. Both must keep every record and synced setting.

## When you cut a release

Add the release's fixture in the version bump commit, from the release commit's code:

```bash
RELEASE_FIXTURE=X.Y.Z pnpm vitest run src/__tests__/releaseFixturesGenerate.test.ts
pnpm vitest run src/__tests__/releaseUpgrade.test.ts
```

The first command writes `src/__tests__/__data__/releases/vX.Y.Z/`. Commit it as written; `.prettierignore` keeps the JSON byte-for-byte.

## When you change a store

- **Bumping a store's `version` or adding a boot migration:** the suite runs your migration on every release fixture. If it changes a value on purpose, tell the suite in the same change (for example `MIGRATED_PREFERENCES`, or a release gate like the additive Plans check). Don't edit the old fixtures: they're what users have on their devices.
- **A new persisted store or record type:** add its records to `scenario.ts`, write them in `releaseFixturesGenerate.test.ts` (and its key to `PERSISTED_STORES`, or its MMKV id to `MMKV_INSTANCES`), add the store to `launch()` in `releaseUpgrade.test.ts`, and check them there from the first release that has them (`coverage()`, `expectDeviceSettings()`).
- **Changing the sync payload:** the restore and merge checks read every release's sync files. A field sync leaves out on purpose is skipped for `'sync'` (like a Contact's dismissal reminder id).
- **Older releases:** the existing fixtures came from running each tag's own stores in a throwaway worktree (`git worktree add --detach … vX.Y.Z`) with in-memory MMKV and this generator adapted to that tag's actions. Regenerating a tag's `stores.json` that way reproduces the committed one byte for byte (uuids are `gen-uuid-N` there), which shows the adaptation is faithful. An older sync file can also come from loading the committed `stores.json` into the tag's stores and running that tag's `applySeedEnable`. To add one for a release before 1.45, generate it the same way rather than writing JSON by hand.
