---
status: accepted
---

# Unlocks arrive as toasts; the full-screen moment opens on request

## Context

When the User's own action earned a Badge, the badge celebration took over the screen right away (ADR 0021). People found it too jarring: it covered whatever they were doing, often a moment after closing Add Time. Pet room items and hats had the opposite problem. Nothing marked the moment they opened up; the User only found a "New" pill the next time they opened Decorate Room.

The app also had three unrelated in-app notice systems:

- Burnt's native toast at the top, which became a plain system toast on Android;
- a custom Undo bar at the bottom;
- the takeovers.

None of them could show art or be tapped to open something.

## Decision

1. **One toast system** (`src/stores/toasts.ts`, drawn by `src/components/toast/ToastHost.tsx`) replaces Burnt and the Undo bar. Each toast states its intent, and the intent decides where it goes.
   - The result of the User's own action (`success`, `info`, `error`, `undo`) answers at the bottom, near their thumb.
   - What the app brings them (`unlock`, `news`) drops in from the top.
   - Each edge stacks like Sonner: the newest is in front and older ones peek out behind it. Tapping a toast behind the front one, or hovering with a pointer, spreads the stack out. A swipe away from the edge lets a toast go.
2. **A Badge or pet item that the User's action just earned or opened up shows an unlock toast**, one per item. Tapping it opens the full-screen moment: the existing badge celebration, or a new pet item reveal. Swiping it away settles it. Takeovers no longer start on their own for these.
3. **Unlocks that nobody acted on wait in the notifications tray.**
   - This covers an unlock earned while the app wasn't in front or at launch (iCloud Sync, the Watch, Siri, a new month).
   - It also covers an unlock toast that timed out, never got its turn, or was still showing when the app went to the background.
   - The tray's View opens the same full-screen moment.
   - Launching the app never puts up a pile of unlock toasts.
   - The Home "New badge" card is gone; the tray replaces it.
4. **Toasts and the tray stay separate features.** A toast never writes to the tray. Each feature derives its tray items from its own state (the badges' `badgeCardDismissed`, the pet's `petUnlockNews`) and leaves out whatever is on screen as a toast. Feedback and Undo toasts never reach the tray.
5. **Unlock toasts wait while a takeover holds the screen.** An unlock toast that waits past its action's moment (`CELEBRATION_WINDOW_MS`) goes to the tray instead.

ADR 0021's action rule still decides whether something is live. The streak celebration, What's New, the update reveal, the Schedule intro, and the badges welcome and history summary stay takeovers.

## Consequences

- No moment covers the screen unless the User asks for it, except the streak milestone and the explanations above.
- Burnt and `@tamagui/toast` are removed. Toasts look the same on iOS and Android, and native builds need a rebuild.
- Every in-app message goes through `toast`. A new feature doesn't add its own banner or toast layer.
- Unlock news is per device, like the tray: an item synced from another device isn't announced again here.
