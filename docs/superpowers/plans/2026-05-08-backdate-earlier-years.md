# Backdate Earlier Years Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a trailing "+ Add earlier year" row to the All-time tab's Year-by-Year list that lets users seed a zero-hour `ServiceReport` for any service year up to 100 years in the past, expanding the visible span.

**Architecture:** Append a tappable row at the bottom of `YearByYearList`. Tapping it opens a tamagui bottom-sheet hosting a single `@react-native-picker/picker` wheel of selectable service-year `endYear`s (computed from the existing reports + a 100-year floor). Confirming inserts one zero-hour `ServiceReport` dated September 1 of the chosen `startYear` via the existing `addServiceReport` store action; the list re-renders with the expanded continuous span automatically.

**Tech Stack:** React Native + TypeScript, zustand store (`stores/serviceReport`), tamagui `Sheet`, `@react-native-picker/picker`, `expo-crypto` for ids, `moment` for service-year math, `i18n` via `src/lib/locales` lookup over `src/locales/<locale>.json`.

---

## File Structure

**New:**

- `src/components/AddEarlierYearSheet.tsx` — bottom sheet UI: hosts the wheel picker and emits `onConfirm(endYear)`.

**Modified:**

- `src/components/YearByYearList.tsx` — append the trailing row, manage sheet open state, compute `availableEndYears`, wire confirm handler to `addServiceReport`.
- `src/locales/en-US.json` — add `addEarlierYear` and `addEarlierYear_pickerTitle` keys.
- `src/lib/serviceReport.ts` — add and export a small pure helper `getAvailableEarlierEndYears(endYears, currentEndYear, floorYearsBack)` so the picker logic is unit-testable independently of the React component.

**Tests (new):**

- `src/lib/__tests__/serviceReport.getAvailableEarlierEndYears.test.ts` — unit tests for the new helper.

> The codebase does not currently colocate component tests for this area, and there is no existing testing pattern for tamagui `Sheet` interactions in this repo (search `*.test.tsx` to confirm). Component-level testing is therefore out of scope; verification is via the unit test for the pure helper plus manual iOS verification (Task 6).

---

## Task 1: Add the i18n keys

**Files:**

- Modify: `src/locales/en-US.json` (only en-US in this task; the project's auto-translate tooling — if any — handles other locales separately and is out of scope here. Other locale files will fall back to the English key string at runtime.)

- [ ] **Step 1: Open `src/locales/en-US.json` and locate the `"yearByYear"` key**

Use a search to find the exact line. Add two new keys directly below `"yearByYear"`. Maintain alphabetical/logical grouping if the file uses one — if not, just place them adjacent.

- [ ] **Step 2: Add the keys**

Insert these two key/value pairs adjacent to `"yearByYear"`:

```json
"addEarlierYear": "Add earlier year",
"addEarlierYear_pickerTitle": "Add Earlier Service Year",
```

(Make sure trailing commas remain valid JSON.)

- [ ] **Step 3: Verify JSON is valid**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('src/locales/en-US.json','utf8')); console.log('ok')"
```

Expected output: `ok`

- [ ] **Step 4: Commit**

```bash
git add src/locales/en-US.json
git commit -m "i18n(en): add backdate-earlier-year keys"
```

---

## Task 2: Add the `getAvailableEarlierEndYears` helper (TDD)

**Files:**

- Create: `src/lib/__tests__/serviceReport.getAvailableEarlierEndYears.test.ts`
- Modify: `src/lib/serviceReport.ts` (append new export near `getServiceYearEndYearsSpan` around line 498)

- [ ] **Step 1: Confirm no existing **tests** folder pattern conflicts**

Run:

```bash
ls src/lib/__tests__ 2>/dev/null || echo "no dir"
find src -name "*.test.ts" -not -path "*/node_modules/*" | head -5
```

If `src/lib/__tests__/` does not exist, the next step will create it implicitly via the new file. If a different test convention is in use (e.g. `*.test.ts` colocated next to source), follow that convention instead — place the test file at `src/lib/serviceReport.getAvailableEarlierEndYears.test.ts`. Use whichever path the rest of the codebase prefers; the rest of this task assumes the `__tests__/` path.

- [ ] **Step 2: Write the failing test**

Create `src/lib/__tests__/serviceReport.getAvailableEarlierEndYears.test.ts`:

```ts
import { getAvailableEarlierEndYears } from '../serviceReport'

describe('getAvailableEarlierEndYears', () => {
  it('returns years from (current - floor) up to (earliest - 1), descending, excluding any already-present year', () => {
    // currentEndYear = 2026, floor = 5 → range floor = 2021
    // present = [2024, 2025, 2026] → earliest = 2024 → upper = 2023
    // available = [2023, 2022, 2021]
    expect(getAvailableEarlierEndYears([2024, 2025, 2026], 2026, 5)).toEqual([
      2023, 2022, 2021,
    ])
  })

  it('returns empty array when earliest is already at or below the floor', () => {
    // currentEndYear = 2026, floor = 5 → floor year = 2021
    // earliest = 2021 → upper = 2020 < 2021 → no available years
    expect(
      getAvailableEarlierEndYears([2021, 2022, 2023, 2024, 2025, 2026], 2026, 5)
    ).toEqual([])
  })

  it('returns empty array when endYears is empty (no reports)', () => {
    expect(getAvailableEarlierEndYears([], 2026, 100)).toEqual([])
  })

  it('excludes interior years already present (defensive: span is normally continuous)', () => {
    // Hypothetical non-continuous input — helper should still dedupe.
    // currentEndYear = 2026, floor = 10 → floor year = 2016
    // present = [2020, 2026] → earliest = 2020 → upper = 2019
    // available = [2019, 2018, 2017, 2016] (none of those are in present)
    expect(getAvailableEarlierEndYears([2020, 2026], 2026, 10)).toEqual([
      2019, 2018, 2017, 2016,
    ])
  })

  it('respects a 100-year floor', () => {
    expect(getAvailableEarlierEndYears([2026], 2026, 100).slice(0, 3)).toEqual([
      2025, 2024, 2023,
    ])
    expect(getAvailableEarlierEndYears([2026], 2026, 100).slice(-1)).toEqual([
      1926,
    ])
  })
})
```

- [ ] **Step 3: Run the test — expect FAIL**

Run:

```bash
yarn jest src/lib/__tests__/serviceReport.getAvailableEarlierEndYears.test.ts
```

(If the project uses `npm test` or another runner, substitute. Check `package.json` `scripts.test`.)

Expected: failure with `getAvailableEarlierEndYears is not a function` or `not exported`.

- [ ] **Step 4: Implement the helper**

Open `src/lib/serviceReport.ts`. Directly after the `getHoursForServiceYearEndYear` export (around line 516), add:

```ts
/**
 * Compute the list of service-year `endYear`s the user is allowed to backdate
 * into from the All-time tab's "Add earlier year" picker.
 *
 * Range: from `currentEndYear - floorYearsBack` up to (earliest present
 * endYear) - 1, descending. Excludes any year already in `endYears` (defensive;
 * `getServiceYearEndYearsSpan` already returns a continuous span, but we don't
 * want to rely on that contract here).
 *
 * Returns `[]` if `endYears` is empty or if every candidate year is already
 * present / below the floor.
 */
export const getAvailableEarlierEndYears = (
  endYears: number[],
  currentEndYear: number,
  floorYearsBack: number
): number[] => {
  if (endYears.length === 0) return []
  const earliest = Math.min(...endYears)
  const floor = currentEndYear - floorYearsBack
  const upper = earliest - 1
  if (upper < floor) return []
  const present = new Set(endYears)
  const out: number[] = []
  for (let y = upper; y >= floor; y--) {
    if (!present.has(y)) out.push(y)
  }
  return out
}
```

- [ ] **Step 5: Run the test — expect PASS**

Run:

```bash
yarn jest src/lib/__tests__/serviceReport.getAvailableEarlierEndYears.test.ts
```

Expected: 5 passing.

- [ ] **Step 6: Type-check**

Run:

```bash
yarn tsc --noEmit
```

(Or whichever script the repo uses — check `package.json`.)

Expected: no new type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/serviceReport.ts src/lib/__tests__/serviceReport.getAvailableEarlierEndYears.test.ts
git commit -m "feat(serviceReport): add getAvailableEarlierEndYears helper"
```

---

## Task 3: Build `AddEarlierYearSheet` component

**Files:**

- Create: `src/components/AddEarlierYearSheet.tsx`

The sheet pattern mirrors the existing `SelectWheel.tsx` (tamagui `Sheet` wrapped in a RN `Modal`, header with Cancel/Done, native `Picker` body). Re-implementing the chrome here rather than reusing `SelectWheel` because we want a distinct primary "Add Year" action label and a section title, not the generic Done.

- [ ] **Step 1: Create the component file**

Create `src/components/AddEarlierYearSheet.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, View } from 'react-native'
import { Picker } from '@react-native-picker/picker'
import { Sheet } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import Text from './MyText'

interface AddEarlierYearSheetProps {
  /** Controls visibility. Parent owns this. */
  open: boolean
  /** Selectable service-year endYears, descending (most-recent first). */
  availableEndYears: number[]
  /** Fired when the user taps the primary "Add Year" button. */
  onConfirm: (endYear: number) => void
  /** Fired when the user dismisses without confirming. */
  onClose: () => void
}

const formatPickerLabel = (endYear: number): string =>
  `${endYear - 1}-${endYear}`

const AddEarlierYearSheet = ({
  open,
  availableEndYears,
  onConfirm,
  onClose,
}: AddEarlierYearSheetProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  // Keep the RN Modal mounted through the Sheet's dismiss animation, mirroring
  // SelectWheel.tsx so the slide-down animation runs instead of a hard cut.
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const t = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(t)
  }, [open])

  // Authoritative draft state lives LOCAL to the sheet — see SelectWheel.tsx
  // for why (PickerIOS reconciliation race when state is split across trees).
  const initialValue = availableEndYears[0]
  const [draftValue, setDraftValue] = useState<number | undefined>(initialValue)
  const draftRef = useRef(draftValue)
  draftRef.current = draftValue

  useEffect(() => {
    if (open) setDraftValue(availableEndYears[0])
  }, [open, availableEndYears])

  const handleConfirm = () => {
    if (draftRef.current !== undefined) onConfirm(draftRef.current)
  }

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      animationType='none'
      onRequestClose={onClose}
    >
      <Sheet
        open={open}
        modal={false}
        snapPointsMode='fit'
        onOpenChange={(next: boolean) => {
          if (!next) onClose()
        }}
        animation='quick'
        disableDrag
      >
        <Sheet.Overlay zIndex={100_000 - 1} />
        <Sheet.Frame
          backgroundColor={theme.colors.background}
          padding={0}
          paddingBottom={insets.bottom}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={{ color: theme.colors.accent, fontSize: 16 }}>
                {i18n.t('cancel')}
              </Text>
            </Pressable>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 16,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('addEarlierYear_pickerTitle')}
            </Text>
            <Pressable onPress={handleConfirm} hitSlop={8}>
              <Text
                style={{
                  color: theme.colors.accent,
                  fontSize: 16,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('addEarlierYear')}
              </Text>
            </Pressable>
          </View>
          <Picker
            style={{ height: 216 }}
            selectedValue={draftValue}
            onValueChange={(next) => setDraftValue(Number(next))}
            itemStyle={{ color: theme.colors.text }}
          >
            {availableEndYears.map((endYear) => (
              <Picker.Item
                key={endYear}
                label={formatPickerLabel(endYear)}
                value={endYear}
                color={theme.colors.text}
              />
            ))}
          </Picker>
        </Sheet.Frame>
      </Sheet>
    </Modal>
  )
}

export default AddEarlierYearSheet
```

- [ ] **Step 2: Type-check**

Run:

```bash
yarn tsc --noEmit
```

Expected: no errors. If `useTheme`/`Text`/`i18n` import paths differ, adjust to match neighboring components in `src/components/`.

- [ ] **Step 3: Commit**

```bash
git add src/components/AddEarlierYearSheet.tsx
git commit -m "feat(components): add AddEarlierYearSheet for backdating service years"
```

---

## Task 4: Wire the trailing row into `YearByYearList`

**Files:**

- Modify: `src/components/YearByYearList.tsx`

- [ ] **Step 1: Add imports and supporting hooks at the top of the file**

Open `src/components/YearByYearList.tsx`. After the existing imports (currently lines 1-14), add:

```tsx
import { useState } from 'react'
import * as Crypto from 'expo-crypto'
import moment from 'moment'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'

import {
  getAvailableEarlierEndYears,
  getServiceYearFromDate,
} from '../lib/serviceReport'
import AddEarlierYearSheet from './AddEarlierYearSheet'
```

Note: `useMemo` is already imported from `'react'` (line 1). Merge `useState` into that existing import rather than duplicating: change `import { useMemo } from 'react'` to `import { useMemo, useState } from 'react'`.

- [ ] **Step 2: Add a constant for the floor**

Just below the imports, before the `useFlatServiceReports` declaration, add:

```ts
const EARLIER_YEAR_FLOOR_YEARS_BACK = 100
```

- [ ] **Step 3: Inside the `YearByYearList` component, add sheet state, derived `availableEndYears`, and `addServiceReport` access**

The current component reads `const reports = useFlatServiceReports()` and computes `endYears` and `rows` (lines 50-64). After those, before the `divisor` `useMemo` (line 66), add:

```ts
const { addServiceReport } = useServiceReport()

const [sheetOpen, setSheetOpen] = useState(false)

const availableEndYears = useMemo(() => {
  if (endYears.length === 0) return []
  const currentEndYear = getServiceYearFromDate(moment()) + 1
  return getAvailableEarlierEndYears(
    endYears,
    currentEndYear,
    EARLIER_YEAR_FLOOR_YEARS_BACK
  )
}, [endYears])
```

`useServiceReport()` is already imported at the top of the file (line 5). The current destructure pulls only `serviceReports` inside `useFlatServiceReports`; add a separate top-level destructure inside `YearByYearList` for `addServiceReport` as shown above.

- [ ] **Step 4: Add the confirm handler**

Below the `availableEndYears` memo, add:

```ts
const handleAddEarlierYear = (endYear: number) => {
  const startYear = endYear - 1
  // Sept 1 = canonical start of a JW service year. Noon avoids any DST edge
  // case that could shift the stored calendar day.
  const date = new Date(startYear, 8, 1, 12, 0, 0, 0)
  addServiceReport({
    id: Crypto.randomUUID(),
    hours: 0,
    minutes: 0,
    date,
  })
  setSheetOpen(false)
}
```

- [ ] **Step 5: Render the trailing row at the bottom of the list**

Find the closing `</View>` of the inner row container (currently around line 164, the `</View>` that closes the `paddingHorizontal: 15` View). Before the `{rows.map(...)}` block's closing brace and after it inside the same container, append a new pressable trailing row. Replace this section:

```tsx
<View
  style={{
    paddingHorizontal: 15,
    gap: 6,
  }}
>
  {rows.map(({ endYear, hours }) => {
    // ... existing row rendering ...
  })}
</View>
```

…so that after `{rows.map(...)}` (still inside the same `<View>`), add the trailing row:

```tsx
{
  availableEndYears.length > 0 && (
    <Pressable
      accessibilityRole='button'
      onPress={() => setSheetOpen(true)}
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : 1,
        backgroundColor: theme.colors.card,
        borderRadius: theme.numbers.borderRadiusSm,
        borderCurve: 'continuous',
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      })}
    >
      <FontAwesomeIcon icon={faPlus} color={theme.colors.text} size={14} />
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.text,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {i18n.t('addEarlierYear')}
      </Text>
    </Pressable>
  )
}
```

- [ ] **Step 6: Render the sheet at the end of the component's returned tree**

The current component returns a single `<View style={{ gap: 8 }}>` containing the section header and the rows container. Wrap that return value in a fragment and add the sheet:

```tsx
return (
  <>
    <View style={{ gap: 8 }}>{/* … existing header + rows container … */}</View>
    <AddEarlierYearSheet
      open={sheetOpen}
      availableEndYears={availableEndYears}
      onConfirm={handleAddEarlierYear}
      onClose={() => setSheetOpen(false)}
    />
  </>
)
```

- [ ] **Step 7: Type-check**

Run:

```bash
yarn tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Lint**

Run:

```bash
yarn lint src/components/YearByYearList.tsx src/components/AddEarlierYearSheet.tsx
```

(Or whichever lint script the project uses — check `package.json`.)

Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/components/YearByYearList.tsx
git commit -m "feat(progress): allow backdating earlier service years from All-time tab"
```

---

## Task 5: Verify `LifetimeHoursCard` span responds to the new earliest report

**Files:**

- Read-only: `src/components/LifetimeHoursCard.tsx`

The spec calls out that the card's "since {year}" metadata should reflect the new earliest report after a backdate. Verify, don't blindly modify.

- [ ] **Step 1: Read `src/components/LifetimeHoursCard.tsx`**

Open the file. Find where the "since" / span text is computed.

- [ ] **Step 2: Trace the data source**

If it derives from `getEarliestReportDate(reports)` (or equivalent computation over the flat reports array), no changes needed — the new placeholder will naturally shift the earliest date.

If it reads from a hardcoded floor or a publisher start-date config, write a follow-up note in the commit message but **do not** change behavior in this task — flag it for the user to decide whether changing the card's source-of-truth is in scope.

- [ ] **Step 3: Record the finding**

If no change needed: skip to Task 6. If a change is needed, stop and surface the question to the user before proceeding.

---

## Task 6: Manual verification on iOS

Run the app on a physical iOS device (per `memory/project_ios_only_liquid_glass.md`, this app is iOS-only) and walk through the flows below.

- [ ] **Step 1: Start the dev server**

Run:

```bash
yarn ios
```

(Or use `work` if a `work.yml` is configured — check `ls work.yml`.)

- [ ] **Step 2: Verify the trailing row appears**

Navigate to Progress → All-time tab. Confirm:

- The "+ Add earlier year" row is rendered as the last item below the oldest year row.
- It has the same card styling as real year rows.

- [ ] **Step 3: Open the picker, verify range and default**

Tap the trailing row. Confirm:

- Sheet animates up.
- Wheel default selection is one year prior to the previous earliest (e.g. if earliest was 2024-25, default reads `2023-2024`).
- Wheel scrolls back as far as `(currentServiceYearEnd - 100)`.
- "Cancel" dismisses without inserting.

- [ ] **Step 4: Confirm an addition**

Tap the trailing row again, scroll to a year ~5 back, tap "Add Year". Confirm:

- Sheet dismisses.
- A new row appears for that year and every intermediate year (continuous span).
- New rows are tappable and navigate into the Year tab for that year.
- The hours bar on the newly added year shows 0.

- [ ] **Step 5: Verify lifetime stats reflect the change**

Open the avatar overlay (where lifetime stats live). Confirm:

- Lifetime hours are unchanged (we added 0 hours).
- The "since {date}" / span text reflects the new earliest year (per Task 5's verification — only applies if the card sources from earliest report date).

- [ ] **Step 6: Verify floor enforcement**

Repeat adding earlier years until the picker has no items left. Confirm:

- When `availableEndYears` is empty, the trailing row disappears (does not render).

- [ ] **Step 7: Cleanup test data**

Use the existing in-app delete flow on the placeholder reports you created during testing, OR reset the simulator/dev account, so the test data does not pollute the real account.

- [ ] **Step 8: Final commit (if any tweaks were made during manual QA)**

If Steps 1-7 surfaced no issues, no commit needed. If you tweaked styling or fixed bugs, commit with a focused message.

---

## Self-Review Notes

Spec coverage cross-check:

- ✅ Trailing "+ Add earlier year" row — Task 4 Step 5.
- ✅ Picker range `currentEndYear - 100` to `earliestEndYear - 1` — Task 2 helper + Task 4 wiring.
- ✅ Default selection = one year before earliest — Task 3 (`availableEndYears[0]`, list is descending).
- ✅ Picker label `"YYYY-YYYY"` ASCII hyphen — Task 3 (`formatPickerLabel`).
- ✅ Seed report on Sept 1 of `startYear` at noon, 0 hrs/0 min, fresh uuid — Task 4 Step 4.
- ✅ Trailing row hidden when no available years — Task 4 Step 5 (`availableEndYears.length > 0`).
- ✅ Picker excludes already-present years — Task 2 (set membership check).
- ✅ LifetimeHoursCard span verification — Task 5.
- ✅ Manual iOS verification — Task 6.
- ✅ i18n keys added — Task 1.

No placeholders remain. Helper signatures consistent across tasks (`getAvailableEarlierEndYears(endYears, currentEndYear, floorYearsBack)`).
