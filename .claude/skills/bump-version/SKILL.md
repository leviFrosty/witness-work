---
name: bump-version
description: Bump app version, generate release notes from git log, add i18n keys, auto-translate, and commit everything as a single chore commit. Use when the user asks to bump/release a version (major, minor, or patch).
---

# Bump Version

End-to-end release version bump for witness-work. Runs `scripts/bump-version.js`, writes release notes + English i18n entries, triggers auto-translation, then squashes all changes into ONE `chore:` commit with the tag.

## Inputs

Ask the user for bump type if not provided: `major`, `minor`, or `patch`.

## Steps

### 1. Pre-flight

- Working tree must be clean (`git status --porcelain`). The bump script enforces this — abort early if dirty.
- Read current version from `package.json` to know the previous tag.

### 2. Gather release content from git log

Run `git log <previous-tag>..HEAD --no-merges --pretty=format:'%h %s'` to collect user-facing changes since the last release. Filter out noise: `chore:`, `ci:`, `build(deps):`, `test:`, refactors with no behavior change. Keep: `feat:`, `fix:`, UX/perf improvements.

Draft concise, user-facing bullets (not conventional-commit wording). Match the tone in `src/constants/releaseNotes.ts` / `src/locales/en-US.json` `"1360"` — plain, benefit-framed sentences.

### 3. Write release notes BEFORE running bump script

The bump script refuses to run on a dirty tree, BUT we want one single commit at the end. Strategy: do all edits first, then run the bump script with `--no-commit` style behavior... except the script always commits. Workaround:

**Use this ordering:**

1. Let `scripts/bump-version.js` run first (it commits + tags `package.json` + `app.config.ts`).
2. Add release notes + i18n edits on top.
3. Run `pnpm translate --force` to populate other locales.
4. `git add -A`, then `git commit --amend --no-edit` to fold everything into the existing bump commit.
5. Move the tag forward: `git tag -f v<newVersion>` (the tag was created pointing at the pre-amend SHA).

This yields one commit + one tag containing: `package.json`, `app.config.ts`, `src/constants/releaseNotes.ts`, and all `src/locales/*.json`.

### 4. Run the bump

```bash
pnpm version:bump <major|minor|patch>
```

Script uses `bun` via the package.json script. It updates `package.json` + `app.config.ts`, commits `chore: bump version to X.Y.Z`, and creates annotated tag `vX.Y.Z`.

### 5. Add release notes entry

Edit `src/constants/releaseNotes.ts`. Prepend a new object to the `releaseNotes` array:

```ts
{
  version: '<newVersion>',
  date: moment('<YYYY-MM-DD>').toDate(),
  content: ['c1', 'c2', ...],
},
```

Use today's date. `content` keys should match the keys you'll add to the locale file.

### 6. Add English i18n keys

Edit `src/locales/en-US.json`. Find the `releaseNotes` object (the one that already contains `"1360"`, `"1350"`, etc.). Add a new key using the version with dots stripped (e.g., `1.37.0` → `"1370"`):

```json
"1370": {
  "c1": "<user-facing bullet 1>",
  "c2": "<user-facing bullet 2>"
}
```

Only edit `en-US.json` — other locales are generated.

### 7. Auto-translate

```bash
pnpm translate --force
```

The `--force` flag bypasses the staged-file check in `scripts/translate.ts`. This populates every supported locale in `src/locales/` with translated copies of the new keys via DeepL. Requires `DEEPL_FREE_API_KEY` in `.env` — if missing, stop and tell the user.

### 8. Fold into the single commit

```bash
git add package.json app.config.ts src/constants/releaseNotes.ts src/locales/
git commit --amend --no-edit
git tag -f v<newVersion> -m "Release <newVersion>"
```

The force-retag is required because the original tag points at the pre-amend commit SHA.

### 9. Verify

- `git log -1 --stat` — one commit, all expected files.
- `git tag -l 'v<newVersion>' --format='%(objectname) %(refname)'` compared to `git rev-parse HEAD` — tag points at HEAD.
- Do NOT push. Tell the user the next step is `git push origin <branch> --follow-tags`.

## Notes

- Never skip git hooks. If a pre-commit hook fails on the amend, fix the underlying issue and re-amend.
- If translate fails for some locales, surface the failure list but don't abort — user can re-run `pnpm translate --force`.
- The bump script's own reminder about release notes is handled by this skill; ignore its stdout warning.
- Keep release-note bullets short and benefit-focused. Avoid internal jargon, commit hashes, or PR numbers.
