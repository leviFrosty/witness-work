/**
 * Legacy "upgrade your time reports" sheet — historically prompted users to
 * retroactively classify free-text tag strings as credit-bearing or not. The
 * tag → Category refactor (`src/lib/categories.ts`) absorbed that flow into the
 * boot-time migration runner, so this sheet has nothing to do. Kept as a thin
 * no-op so HomeScreen's gated render still type-checks during the one-release
 * deprecation window; remove in a follow-up PR.
 */

type UpgradeLegacyTimeReportsTagsSheetProps = {
  sheet: boolean
  setSheet: React.Dispatch<React.SetStateAction<boolean>>
}

export default function UpgradeLegacyTimeReportsSheet(
  _props: UpgradeLegacyTimeReportsTagsSheetProps
) {
  return null
}
