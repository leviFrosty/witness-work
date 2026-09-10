# Shared and settings UI consistency coverage

This pass applies the shared form treatment by default through the input-layout
primitives. Settings pages use `SettingsInputLayout` for the shared 12pt
horizontal inset and 680pt maximum content width; the drawer continues to use
the explicit `drawer` variant in `SettingsScreen`.

## Shared primitives reviewed

- `components/ui/inputs/InputLayout.tsx`: settings and drawer tokens plus the
  explicit context contract.
- `components/ui/inputs/InputRowContainer.tsx`: 76pt form rows, 48pt drawer
  rows, label/info/description layout, and control sizing variants.
- `components/ui/inputs/InputRowSelect.tsx`, `InputRowSwitch.tsx`, and
  `TextInputRow.tsx`: bounded selects, native settings switches, outlined
  inputs, and full-width multiline handling.
- `components/ui/inputs/Section.tsx`: rounded inset settings groups and transparent
  drawer groups.
- `components/ui/Select.tsx`, `TextInput.tsx`, and `InfoPopover.tsx`:
  outlined controls, accessibility labels, and inline info-button alignment.
- `components/ui/SelectWheel.tsx`, `DateTimePicker.tsx`, and
  `WheelPicker.tsx`: picker surfaces keep their platform-specific interaction,
  while the wheel trigger uses the shared 44pt select geometry and exposes its
  selected value and expanded state to VoiceOver.
- `components/AssistantPreviewSheet.tsx` and `components/TypeSelectorRow.tsx`:
  compound controls preserve their selection semantics while TypeSelectorRow
  uses a compact type select and separate full-width custom-category controls.
- `features/settings/components/inputs/InputRowButton.tsx` and
  `components/shared/SectionTitle.tsx`: drawer rows, row spacing, and section
  heading alignment.

## Settings screens covered

`PreferencesScreen`, Appearance, Backups, Conversations, Custom Fields, Home,
Navigation, Personalization, Plans, Publisher, Schedule, Widgets, and iCloud
Preferences all mount through `SettingsInputLayout`. `MoreScreen` and
`ImportAndExportScreen` use the same content inset contract. The drawer itself
keeps `InputLayoutProvider value='drawer'` so its 48pt rows, 2pt gaps, 40pt
section spacing, and nav-aligned headings remain intact.

## Intentional exceptions

- `PreferencesCustomFieldsScreen` uses `controlWidth='full'` for compound
  reorder/edit rows and explicitly restores the child controls' horizontal
  direction.
- Stacked offset rows in Backups, Conversations, and Plans use
  `controlWidth='full'` and expose essential copy through `description`.
- iCloud rows retain their activity indicators and status values alongside
  native `Switch` controls; they cannot be represented by a plain switch row.
- Home and Schedule visibility lists retain reorder buttons next to native
  switches; these are compound list rows rather than ordinary preference
  toggles.
- Publisher onboarding and settings share the same selector and custom-hours
  row through the default form treatment.
- Boolean controls, including record-selection flows, use native `Switch`
  controls with an accessible checked state.

## Verification

The repository-wide input, `Section` child, route, and sheet inventory is
complete; Astra max found no unknown input groups. Final checks pass: lint,
typecheck, 88 test files with 1,216 tests, dependency validation with no
circular dependencies, and `git diff --check`.

Runtime verification covered dark ProMax drawer and Publisher states, normal
and error Contact name outlines, native switches, and light 390pt iPhone 17e
Onboarding, Profile, Add Time, compact Type/Hours/Minutes controls, 44pt
controls, 80pt full-width notes, wheel-picker modal, and Custom Fields
composition. The installed simulator dev binary kept a native splash overlay
above the live React tree; the reviewer temporarily hid only that
noninteractive splash view for inspection, without a source or store change.
Clean native launch was not validated, and representative states do not cover
every interaction.

Only `src/locales/en-US.json` is eligible for translation updates; no other
locale was changed by this pass.
