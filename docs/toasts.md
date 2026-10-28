# Toasts

Every short in-app message goes through one toast system (ADR 0034): `toast` in [`src/stores/toasts.ts`](../src/stores/toasts.ts), drawn by [`ToastHost`](../src/components/toast/ToastHost.tsx) at the app root. Don't add another banner, snackbar or toast layer.

Toasts aren't the notifications tray. The tray is a separate feature: each feature lists its own items there (`src/types/notifications.ts`). An unlock that nobody acted on joins the tray through its feature's tray hook, never through the toast.

## Intents

Pick the intent from what the message is for. The intent decides where the toast goes, how long it stays, and whether anything follows it into the tray.

| Intent    | For                                                          | Where  | Default time | Tray                                   |
| --------- | ------------------------------------------------------------ | ------ | ------------ | -------------------------------------- |
| `success` | The User's action worked ("Copied", "Saved")                 | Bottom | 3 s          | Never                                  |
| `info`    | A neutral result of their action                             | Bottom | 4 s          | Never                                  |
| `error`   | Their action failed                                          | Bottom | 5 s          | Never                                  |
| `undo`    | A finished action they can take back                         | Bottom | 5 s          | Never                                  |
| `unlock`  | Something they just earned or opened up: a Badge, a pet item | Top    | 8 s          | Its feature's tray item, until settled |
| `news`    | Something arriving that they didn't just do (an alert)       | Top    | 5 s          | Never                                  |

```ts
import { toast } from '@/stores/toasts'

toast.success(i18n.t('copied'))
toast.error(i18n.t('mileage.exportFailed'))
toast.undo({ title: i18n.t('contactDismissed'), onUndo: restore })
toast.unlock({ key, eyebrow, title, message, art, onOpen, onClose })
```

With VoiceOver or TalkBack on, a toast with something to press stays 60 s and any other toast stays 10 s. Android raises both to the User's "Time to take action" setting (`src/lib/toastDuration.ts`).

## How they look and move

- **Bottom:** a dark bar above the tab bar, with an optional text button (Undo) that's a full 44 pt target. An `accessory` trails the text: what a save earned the pet, measured with `measureReward` from `src/lib/actionRewards.ts` around the save. Its `label` is read with the toast.
- **The reward stack** (`src/stores/rewardStack.ts`, drawn by `RewardStackLayer`) is part of this system, not a layer of its own: what a save earned stomps in line by line just above the bottom toasts ("+1 Time added", "+1 Planned day kept"), its total slams, then drops into the toast's accessory (`RewardTally`, the pet's wallet) and counts up. `ToastHost` draws it (and stays mounted while it plays), a streak celebration draws it while a milestone line plays there, and it plays over the pet's Home card for what was earned elsewhere. A tap anywhere skips it. Settings → Rewards turns it off; the accessory is then a plain "+N" chip. See `docs/pet-companion.md`.
- **Top:** a card below the status bar. An unlock shows its art, an eyebrow, a title, a View pill, and a grabber that says it can be swiped.
- **Stacking:** each edge stacks like Sonner. The newest toast is in front. Up to two more peek out above it, 10 pt apart and 5% smaller each, blank. On both edges older toasts sit above newer ones, so a top stack keeps its oldest by the status bar and grows down. Tapping a toast behind the front one, or hovering the stack with a pointer, spreads it out. It folds back 4 s after the last touch.
- **Timing:** a toast's time pauses while the User touches the stack, hovers it, or has it spread out. Top toasts also wait while a takeover holds the screen.
- **Dismissing:** swipe a toast away from its edge, or sideways. Tapping an unlock opens it. Undo is a button of its own.
- **Reduce Motion:** toasts fade in and out without sliding.

## Unlocks

An unlock follows the action rule (ADR 0021):

- **Right after the User's own action, in the foreground:** an unlock toast, one per item. Tapping it opens the full-screen moment (the badge celebration, or `PetUnlockReveal`). Swiping it away settles it.
- **Otherwise:** only the tray lists it. This covers launch, iCloud Sync, the Watch and Siri, and a new month. It also covers an unlock toast that timed out, waited behind a takeover past `CELEBRATION_WINDOW_MS`, or was showing when the app went to the background.

`onClose(reason)` reports why a toast left. `toastAcknowledged(reason)` is true for `opened`, `swiped` and `action`; settle the news only then. The tray hook leaves out any key on screen as a toast (`toastKeys`), so nothing is listed twice.

| Unlock   | Toast                                                                           | Tray                        | Settled by                                                        |
| -------- | ------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------- |
| Badge    | `showBadgeUnlockToasts` (badges `lib/badgeToasts`)                              | `useBadgeNotifications`     | `badgeCardDismissed`, or opening the profile or the Badges screen |
| Pet item | `announcePetUnlocks` (pet `lib/unlockAnnounce`), shown by `PetUnlockRevealHost` | `usePetUnlockNotifications` | `petUnlockNews`, or opening Decorate Room                         |

## Developer harness

- `__WW_DEV__.toasts.getState()` lists what's on screen.
- `__WW_DEV__.toast.success('Copied')` (and the other intents) shows a toast.
- `__WW_DEV__.noteUserAction()`, then `__WW_DEV__.badges.celebrate('yearRound.2')` or `__WW_DEV__.pet.unlock(['hat:beret'])`, shows unlock toasts. Without the action, the same calls go to the tray.
- `__WW_DEV__.badges.moment(key)` opens a badge's full-screen celebration directly.
- `__WW_DEV__.pet.reward('soft' | 'save' | 'milestone')` plays the reward stack; `__WW_DEV__.stores.rewardStack.getState().run` reads it back.
