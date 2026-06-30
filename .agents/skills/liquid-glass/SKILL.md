---
name: liquid-glass
description: How to apply iOS 26 Liquid Glass material in WitnessWork — use `expo-glass-effect`'s GlassView, never hand-build glass from BlurView + opacity. Use when adding/reviewing material on nav bars, tab bars, sheets, primary CTAs, search, or floating overlays, or when you spot a hand-rolled blur/glass surface.
---

# iOS 26 Liquid Glass — use `expo-glass-effect`, never fake it

The app targets iOS 26's Liquid Glass material. `expo-glass-effect` is **already installed** — use `GlassView` for any nav/control/modal-layer surface that needs the material.

```tsx
import { GlassView } from 'expo-glass-effect'
;<GlassView glassEffectStyle='regular' style={shape}>
  {children}
</GlassView>
```

- **Auto-fallback.** `GlassView` renders as a plain `View` on iOS < 26 — no manual `isLiquidGlassAvailable()` gating needed for render. For free-floating elements that would visually disappear without the material (tab bar, chips, full-screen loaders), keep a `BlurView` underneath unconditionally as the visible-surface fallback.
- **`GlassContainer`** merges adjacent glass surfaces — use when grouping pills / toolbar items.
- **Do not hand-build glass** with `BlurView` + opacity overlays + custom borders. It replicates the system effect badly and conflicts with the real material when it activates.
- **Where glass belongs** (Apple HIG): nav bars, tab bars, sheets/popovers/modals, primary CTAs, search bars, floating overlays.
- **Where it does NOT belong:** content cards, list rows, badges, form inputs, static visualizations.

Plan + full inventory: `docs/liquid-glass-adoption-plan.md`. Reference implementation: `src/components/TabBar.tsx`.
