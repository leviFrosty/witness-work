# Branching and Versioning Strategy

## Branch Structure

### `development` - Integration Branch

- All feature work merges here first
- Used for testing features together before production
- Runs automated lint and tests on every commit/PR

### `main` - Production Branch

- Production-ready code only
- Only accepts PRs from `development`
- Tagged commits trigger production releases
- Protected branch - requires passing status checks

## Workflow

### 1. Feature Development

```bash
# Create feature branch from development
git checkout development
git pull
git switch -C feature/my-feature

# Make changes, commit
git add .
git commit -m "feat: add my feature"

# Push and open PR to development
git push -u origin feature/my-feature
```

**What happens:**

- ✅ Lint and typecheck run automatically
- ✅ Tests run automatically
- PR can merge once checks pass

### 2. Releasing to Production

```bash
# Merge development to main
git checkout main
git pull
git merge development

# Bump version and create tag
pnpm run version:bump patch  # or major, patch

# Script will:
# - Update version in package.json and app.config.ts
# - Create git commit
# - Create git tag (v1.37.1) based on semver change
# - Prompt you to update release notes

# (AS NECCESARRY) Manually update release notes to notify end-users of changes
# Edit src/constants/releaseNotes.ts
# Add corresponding i18n keys src/locales/en-US.json
# Auto translate version changes
pnpm run translate

# Amend the version commit with release notes
git add src/constants/releaseNotes.ts src/locales/
git commit --amend --no-edit

# Push tag to trigger production build
git push origin main --follow-tags

# Switch back to development to avoid accidental writes to prod
git switch development
```

**What happens:**

- ✅ Production workflow runs (lint, test, typecheck)
- ✅ iOS build submitted to App Store
- ✅ Android build submitted to Play Store
- ✅ GitHub Release created

## Version Bumping

Use semantic versioning (`MAJOR.MINOR.PATCH`):

```bash
# Breaking changes (1.36.0 → 2.0.0)
pnpm run version:bump major

# New features (1.36.0 → 1.37.0)
pnpm run version:bump minor

# Bug fixes (1.36.0 → 1.36.1)
pnpm run version:bump patch
```

### After Version Bump

1. **Update Release Notes** (`src/constants/releaseNotes.ts`):

```typescript
export const releaseNotes: ReleaseNote[] = [
  {
    version: '1.37.0',
    date: '2025-10-07',
    i18nKey: 'releaseNotes.v1_37_0',
  },
  // ... existing notes
]
```

2. **Add i18n Keys** (e.g., `src/locales/en.json`):

```json
{
  "releaseNotes": {
    "v1_37_0": "• Added dark mode\n• Fixed crash on startup\n• Performance improvements"
  }
}
```

3. **Commit and Push**:

```bash
git add src/constants/releaseNotes.ts src/locales/
git commit --amend --no-edit
git push origin main --follow-tags
```

## GitHub Actions Workflows

### On PRs to `main`

- `pr-preview-build.yml` - Runs lint, typecheck, tests, then EAS preview builds for iOS and Android
  - **Validation job**: Lint, typecheck, test, circular dependency check
  - **Build job**: Only runs if validation passes (saves compute resources)

### On Tag Push to `main` (e.g., `v1.37.0`)

- `production-release.yml` - Full validation, production builds, auto-submit to stores
  - Runs lint, typecheck, tests before expensive EAS builds
  - Builds and auto-submits to App Store and Play Store
  - Creates GitHub Release

## Quick Reference

| Action                | Command                              |
| --------------------- | ------------------------------------ |
| Create feature branch | `git switch -C feature/name`         |
| Bump patch version    | `pnpm run version:bump patch`        |
| Bump minor version    | `pnpm run version:bump minor`        |
| Bump major version    | `pnpm run version:bump major`        |
| Push with tags        | `git push origin main --follow-tags` |

## Branch Protection

`main` branch requires:

- ✅ Passing status checks (lint, test)
- ✅ Up-to-date with base branch
- ✅ PR review (recommended but not enforced)

## Tips

- **Never commit directly to `main`** - always use PRs
- **Test on `development` first** - merge multiple features, test together
- **Only tag on `main`** - tags trigger production releases
- **Update release notes** - users see these in-app
- **Check EAS dashboard** - monitor build progress after tagging
