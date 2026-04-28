# iOS 26 Liquid Glass Adoption Plan

## Context

The app is narrowing to iOS-only and adopting Apple's iOS 26 Liquid Glass material. `expo-glass-effect` is already installed (`~55.0.10`) and `expo-blur` is available as a fallback (`~55.0.14`). The reference implementation lives in `src/components/TabBar.tsx` — it uses `GlassView` from `expo-glass-effect` with `isLiquidGlassAvailable()` gating and a `BlurView` fallback for older iOS.

### Apple HIG Principles

Liquid Glass is reserved for the **navigation/functional layer** that floats above content — never the content layer. Variants:

- **Regular**: default; handles legibility over varied/text content
- **Clear**: for components over rich media (photos, video, maps); often paired with a subtle dimming layer

Key rules:

- One floating layer at a time. Avoid glass-on-glass stacking.
- Reduce or remove existing custom backgrounds on bars/buttons so the system effect can take over.
- Use sparingly — reserve for the most important functional elements.
- Test with **Reduce Transparency** enabled.

### References

- [Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass)
- [Liquid Glass Overview](https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass)
- [HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [WWDC25: Build a UIKit App with the New Design](https://developer.apple.com/videos/play/wwdc2025/284/)
- [`expo-glass-effect` docs](https://docs.expo.dev/versions/latest/sdk/glass-effect/)

### Reference pattern

`expo-glass-effect` (Expo SDK 55+) handles fallback automatically: **`GlassView` renders as a regular `View` on iOS < 26, Android, and web** — no manual gating required. The default pattern is just:

```tsx
import { GlassView } from 'expo-glass-effect'
;<GlassView glassEffectStyle='regular' style={shape}>
  {children}
</GlassView>
```

**Implications:**

- The `isLiquidGlassAvailable()` + `BlurView` ladder used in `TabBar.tsx` today is **over-engineered** — it can be simplified to a plain `<GlassView>`. Existing usage works, but new adoptions shouldn't repeat it.
- The auto-fallback is a transparent `View`, not a visual approximation. If a component needs a **visible surface on iOS < 26** (e.g., the floating tab bar would disappear into the content), keep a backing layer:
  - Tamagui `Sheet.Frame` already provides one — the `GlassView` just adds the material on top on iOS 26.
  - For free-floating elements (`TabBar`, `FullScreenLoader`, `Chip`), keep a `BlurView` underneath the `GlassView` (or behind it via `position: absolute`) as the visible-surface fallback. Don't gate it; let the system stack both layers — `GlassView` is opaque enough on iOS 26 to mask the `BlurView`.
- `isLiquidGlassAvailable()` is still useful for **telemetry / behavioral branching** (e.g., disabling motion that only makes sense with the material), just not for render gating.
- **Accessibility:** `isLiquidGlassAvailable()` does **not** account for the user's "Reduce Transparency" setting. If we ever branch on it, also check `AccessibilityInfo.isReduceTransparencyEnabled()`.
- **Grouped controls:** Use `GlassContainer` (also from `expo-glass-effect`) when two or more glass surfaces sit next to each other and should merge as a single material — relevant for the existing tab bar (main pill + accessory pill) and any grouped toolbar items we add later.

Reference docs: [`expo-glass-effect`](https://docs.expo.dev/versions/latest/sdk/glass-effect/).

---

## Definite — should adopt Liquid Glass

These are unambiguously in the navigation/control/modal layer per Apple HIG. Adopt `GlassView` and **strip existing solid backgrounds** so the material reads correctly. (Fallback to plain `View` on iOS < 26 is automatic — only keep a `BlurView`/solid backing for components that would visually disappear without one. See "Reference pattern" above.)

### Navigation layer

| #   | Component            | Path                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Custom screen header | `src/components/layout/Header.tsx` | Currently `<View>` with `backgroundColor: theme.colors.background` and a 1px bottom border. Used by ~all screens via `RootStack`. Replace solid bg with `GlassView` regular, drop the bottom border (the material provides separation). Keep `noBottomBorder`/`backgroundColor` props as overrides.                                                                                                   |
| 2   | Floating tab bar     | `src/components/TabBar.tsx`        | **Already adopted**, but the manual `isLiquidGlassAvailable()` ternary can be simplified — `GlassView` auto-fallbacks. Keep `BlurView` as the visible-surface fallback for iOS < 26 (without it the bar would float over nothing on older devices), but rendered unconditionally underneath rather than gated. Wrap the two pills in `GlassContainer` so the materials merge correctly when adjacent. |

### Sheets, modals, popovers (presentation layer)

All Tamagui `Sheet` usage shares the same shape: replace `Sheet.Frame`'s default solid background with a glass surface (wrap content in `GlassView`, or set `Sheet.Frame` `backgroundColor='transparent'` and put the glass behind `Sheet.ScrollView`). Keep `Sheet.Overlay` as a dim layer — it provides the "subtle dimming" the HIG recommends for Clear variant on rich backgrounds.

| #   | Component                     | Path                                                                                           |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| 3   | QuickActionSheet              | `src/components/QuickActionSheet.tsx`                                                          |
| 4   | WhatsNewSheet                 | `src/components/WhatsNewSheet.tsx`                                                             |
| 5   | CreditInfoSheet               | `src/components/CreditInfoSheet.tsx`                                                           |
| 6   | SelectedDateSheet             | `src/components/SelectedDateSheet.tsx`                                                         |
| 7   | ShareAddressSheet             | `src/components/ShareAddressSheet.tsx`                                                         |
| 8   | DismissContactSheet           | `src/components/DismissContactSheet.tsx`                                                       |
| 9   | ExportTimeSheet               | `src/components/ExportTimeSheet.tsx`                                                           |
| 10  | MilestoneAdjustSheet          | `src/components/MilestoneAdjustSheet.tsx`                                                      |
| 11  | SupporterInfoSheet            | `src/components/SupporterInfoSheet.tsx`                                                        |
| 12  | FirstEnableSheet              | `src/components/sync/FirstEnableSheet.tsx`                                                     |
| 13  | UpgradeLegacyTimeReportsSheet | `src/components/UpgradeLegacyTimeReportsSheet.tsx`                                             |
| 14  | AvatarPickerPopover           | `src/components/AvatarPickerPopover.tsx` (RN `Modal`-based; wrap content in `GlassView`)       |
| 15  | SyncPopover                   | `src/components/sync/SyncPopover.tsx` (RN `Modal`-based popover)                               |
| 16  | ProfileDetailOverlay          | `src/components/ProfileDetailOverlay.tsx` (RN `Modal` with spring-animated layout — clean fit) |

### Manual glass replicas — delete & replace

These are stop-gap "fake glass" wrappers that hand-build the effect with `BlurView` + opacity overlays + custom borders. Apple's HIG explicitly warns that custom backgrounds interfere with the system material — these need to be torn out, not refactored in place.

| #   | Component        | Path                                  | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17  | GlassCard        | `src/components/GlassCard.tsx`        | **Delete the file.** It manually composes `BlurView` + a `theme.colors.card` opacity overlay (0.55–0.70) + an optional amber tint + a hand-drawn hairline border — none of which should coexist with the real material. Audit every caller and replace with one of: (a) the new shared `<GlassSurface />` helper if the card genuinely floats above content/maps; (b) the plain `Card` component if it's content-layer; (c) inline `GlassView` with `glassEffectStyle='regular'` if it needs a one-off shape. The `tone='amber'` celebration variant should become a `GlassSurface` + `Clear` variant + dim/tint overlay. |
| 18  | FullScreenLoader | `src/components/FullScreenLoader.tsx` | Already `BlurView` over the whole screen. Replace with `GlassView` regular and keep the `BlurView` underneath (rendered unconditionally) so iOS < 26 still has a visible loader scrim — `GlassView` auto-fallbacks to a transparent `View` and the loader needs a surface.                                                                                                                                                                                                                                                                                                                                                |
| 19  | Chip             | `src/components/Chip.tsx`             | Already a pill with `BlurView` + 55%-opacity card overlay. Replace with `GlassView` regular and remove the manual color overlay so the system material handles luminosity. Keep `BlurView` underneath unconditionally as the visible-surface fallback for iOS < 26 — chips float over content and need a backing on older OS.                                                                                                                                                                                                                                                                                             |

### Primary CTAs (`.glassProminent` candidates)

Per HIG, primary actions can use the prominent glass style. These are the only buttons that should adopt glass; secondary buttons stay flat.

| #   | Component                  | Path                              | Notes                                                                                                                                                                                                                  |
| --- | -------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20  | ActionButton               | `src/components/ActionButton.tsx` | Solid accent-color pill. This is the app's flagship CTA (used in QuickActionSheet, SelectedDateSheet, key screens). Replace solid bg with `GlassView` `glassEffectStyle='regular'` and tint via overlay or text color. |
| 21  | `Button` `variant='solid'` | `src/components/Button.tsx`       | The styled solid variant only (used in form/modal contexts). Leave the no-variant base button alone — it has no surface to glass.                                                                                      |

### Search & selection (functional controls)

| #   | Component   | Path                             | Notes                                                                                                    |
| --- | ----------- | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 22  | SearchBar   | `src/components/SearchBar.tsx`   | Solid `backgroundLighter` + border. Replace with `GlassView` regular; drop the border.                   |
| 23  | SelectWheel | `src/components/SelectWheel.tsx` | Wheel picker presented in a sheet — falls under modal/control layer. Apply glass to the sheet container. |

---

## Questionable — needs design judgment

Each entry includes the reason it's borderline so we can decide explicitly rather than by default.

| #   | Component                                                | Path                                                      | Why it's questionable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | `Select` (UIMenu wrapper)                                | `src/components/Select.tsx`                               | Uses the **native iOS `MenuView`** via `@react-native-menu/menu`. iOS already renders system menus on Liquid Glass automatically — we shouldn't override. **Likely no-op**, but worth verifying on device that the system menu renders as glass; if it doesn't (e.g., due to RN bridging), we may need to swap to a custom popover and apply glass ourselves. Components that just wrap `Select` (`PublisherTypeSelector`, `AnnualGoalSelector`, `DefaultNavigationSelector`, `InputRowSelect`) inherit the same answer. |
| Q2  | InputRowButton                                           | `src/components/inputs/InputRowButton.tsx`                | Used in Settings/Preferences sections. If it functions as a **disclosure/picker trigger** (control layer, glass appropriate), it's a candidate. If it's a **list row showing data** (content layer), glass is wrong. Likely a mix depending on caller. Audit usages before deciding; lean toward **no glass** unless it's clearly a navigation row. Glass-on-glass risk if these rows sit inside a sheet that's also glass.                                                                                              |
| Q3  | ProfileCard                                              | `src/components/ProfileCard.tsx`                          | Has an existing tilt/shader treatment via `TiltableCard`. Glass would compete with that effect rather than complement it. **Default: leave as-is.** Reconsider only if the shader is removed.                                                                                                                                                                                                                                                                                                                            |
| Q4  | MapCarouselCard                                          | `src/components/MapCarouselCard.tsx`                      | Floats _above the map_ (rich media background — exactly the HIG's Clear-variant use case), but is conceptually a content card showing contact info. Either: (a) treat as content and keep flat, or (b) adopt `glassEffectStyle='clear'` with a dimming overlay since it sits on a map. **Recommend (b)** if it visually competes with the map — but verify with design before committing.                                                                                                                                |
| Q5  | AccentColorPicker                                        | `src/components/AccentColorPicker.tsx`                    | Lives inside Settings — typically content. But if presented inside a sheet (e.g., as part of `SupporterInfoSheet` styling preview), it's already inside the glass layer and should stay flat to avoid stacking. **Default: no glass.**                                                                                                                                                                                                                                                                                   |
| Q6  | ShareAppButton                                           | `src/components/ShareAppButton.tsx`                       | If it's a floating CTA in a navigation-adjacent location → glass candidate. If it's an inline link in a settings list → keep flat. Depends entirely on where it's placed. Audit usages.                                                                                                                                                                                                                                                                                                                                  |
| Q7  | Native `Switch` (in `UpgradeLegacyTimeReportsSheet.tsx`) | —                                                         | iOS toggles already pick up Liquid Glass automatically when the app is built against the iOS 26 SDK and **no `UIDesignRequiresCompatibility` flag** is set. **Action: verify `app.json`/`Info.plist` does not opt out**, then leave the native control alone.                                                                                                                                                                                                                                                            |
| Q8  | DateTimePicker                                           | `src/components/DateTimePicker.tsx`                       | Native `RNDateTimePicker`. Same as Q7 — system handles it. **Do not override.** Just verify on-device behavior.                                                                                                                                                                                                                                                                                                                                                                                                          |
| Q9  | Stack header (React Navigation `headerStyle`)            | `src/stacks/RootStack.tsx`, `src/stacks/HomeTabStack.tsx` | The app uses the custom `layout/Header.tsx` for most screens, but any screen that falls back to React Navigation's default header needs `headerTransparent: true` + a glass background view, OR migration to the custom Header (preferred for consistency). Audit `screenOptions` per stack.                                                                                                                                                                                                                             |

---

## Out of scope (avoid)

The following are confirmed **content layer** — do not adopt glass even though they're visually prominent. Listed for completeness so we don't revisit.

- Content cards: `Card`, `CardWithTitle`, `HintCard`, `LifetimeHoursCard`, `StudiesCard`, `SupporterNudgeCard`, `YearMilestoneCard`, `HourEntryCard`, `PublisherCheckBoxCard`, `TiltableCard`
- Static badges: `Badge`, `CreditBadge`, `SinceBadge`, `SupporterBadge`
- Form inputs: `TextInput`, `TextInputRow`, `CheckboxWithLabel`
- Layout scaffolding: `Wrapper`, `XView`
- Static visualizations: `CategorySegmentBar`, `MilestoneProgressBar`, `SimpleProgressBar`, `MonthServiceReportProgressBar`, contribution graphs, etc.
- Native iOS `Alert` dialogs (system-rendered)
- Icon-only `IconButton` (no surface to glass — keep transparent)

---

## Suggested rollout order

1. **Simplify `TabBar.tsx`** — remove the `isLiquidGlassAvailable()` ternary, render `GlassView` directly (auto-fallback handles iOS < 26), keep `BlurView` underneath unconditionally as the visible-surface fallback, wrap the two pills in `GlassContainer`. Establishes the canonical pattern other components copy.
2. **Optional helper** — only extract a `<GlassSurface />` wrapper if a usage pattern actually repeats more than 3× verbatim. With the auto-fallback, most call sites are just `<GlassView glassEffectStyle='regular' style={...} />`, which is short enough to inline.
3. **Delete `GlassCard.tsx` (#17)** — audit every caller and replace with `GlassView`, plain `Card`, or `GlassSurface`. Ship before headers/sheets so we're not migrating callers twice.
4. **Header (#1)** — biggest visual impact; shows up on nearly every screen.
5. **All sheets & popovers (#3–16)** — they share a Tamagui shape; ship as one batched change. `Sheet.Frame` already provides a backing surface, so the auto-`View` fallback on iOS < 26 just renders the existing solid sheet — no `BlurView` needed.
6. **CTAs (#20–21)** — `ActionButton` + solid `Button` variant.
7. **SearchBar, SelectWheel, Chip, FullScreenLoader (#18, 19, 22, 23)** — small, isolated.
8. **Triage Questionable items** — Q1/Q7/Q8 just need on-device verification. Q2–Q6 need a design pass before code changes.
9. **`Info.plist` / `app.json`** — confirm `UIDesignRequiresCompatibility` is **not** set, otherwise system controls won't pick up the new look.

## Validation checklist

- [ ] On iOS 26 device: every Definite item renders Liquid Glass.
- [ ] On iOS < 26: every Definite item is still functional — either via an underlying `BlurView` (free-floating components: TabBar, Chip, FullScreenLoader) or via the host's existing surface (Tamagui `Sheet.Frame`, custom `Header`'s background prop). Nothing should "disappear" because `GlassView` fell back to a transparent `View`.
- [ ] Reduce Transparency accessibility setting: text remains legible across all adopted surfaces. (Note: `isLiquidGlassAvailable()` returns `true` even when the user has Reduce Transparency on — pair with `AccessibilityInfo.isReduceTransparencyEnabled()` if we ever branch on it.)
- [ ] No glass-on-glass stacking (e.g., a glass sheet containing a glass card).
- [ ] Adjacent glass elements (tab bar pills, grouped toolbar items) use `GlassContainer` so the materials merge instead of stacking.
- [ ] Light + dark theme both render correctly. The `colorScheme` prop on `GlassView` can override system appearance if a specific surface needs to lock to one theme.
- [ ] Tab bar still reads correctly when sheets are open above it.
- [ ] `app.json`/`Info.plist`: `UIDesignRequiresCompatibility` is **not** set.
