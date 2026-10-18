# Rearrangeable screens (jiggle mode)

Home and Progress → Month let people rearrange their screen the way the iOS
Home Screen does. Holding a card (or choosing Edit) starts edit mode. Items
jiggle, holding one lifts it to drag, a gray minus at the top leading corner
removes it, and a curved handle at the bottom trailing corner resizes it. Done
or tapping empty space ends edit mode. The pieces live in
`src/components/ui/reorderable/`, so another screen gets the same behavior by
composing them.

## The pieces

| Piece                        | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useEditMode(surface)`       | The mode itself (`src/hooks/useEditMode.ts`): `editing`, `start(source)`, `finish()`, plus `adding`/`setAdding` for a header's Add button. One surface edits at a time, and any component can read it, so a header and its screen share one mode. Pass `lifecycle: true` from the screen: leaving it ends editing, and Android's Back ends editing instead of leaving. `snapshot`/`onFinish` report what changed once, for analytics.                                       |
| `ReorderableContainer`       | Owns the drag, the lifted copy, auto-scroll near the scroll view's edges, holding empty space (`onBackgroundLongPress`) and tapping it (`onBackgroundPress`). It measures where each item is, so items can sit in any layout: a grid, columns, a list. An item that moves to another column remounts without dropping the drag.                                                                                                                                             |
| `ReorderableItem`            | One card or section. Jiggles while editing (never for Reduce Motion), and shows `onRemove`'s badge and `resize`'s handle. `locked` items rest dimmed. Outside edit mode, holding the item lifts it and starts editing (when the container has `onLiftToEdit`). `liftOutsideEditing={false}` is for items whose long press opens their own menu, and `'zone'` lifts only from a `ReorderableLiftZone`. `gap` and `emptyPlaceholder` handle content that draws nothing today. |
| `ReorderableGrid`            | Columns with spans, for cards: each size spans some columns, and items side by side share a height. It fills in the resize handle's widths from the columns.                                                                                                                                                                                                                                                                                                                |
| `ReorderableLiftZone`        | Limits where a hold lifts an item outside edit mode, for items full of long-pressable rows (the Days list lifts from its header).                                                                                                                                                                                                                                                                                                                                           |
| `ReorderableItemBox`         | Marks the card inside an item that has a heading above it, so the remove badge sits on the card's corner rather than on the heading.                                                                                                                                                                                                                                                                                                                                        |
| `AddItemsSheet`              | The "widget gallery": everything that can go on the screen, with a check on what's there. Like the gallery, it closes after an add so the new item is seen in place.                                                                                                                                                                                                                                                                                                        |
| `useReorderScroller`         | Connects a scroll view for auto-scroll. Spread its `props` onto the scroll view and put `frameRef` on a view with the scroll view's frame.                                                                                                                                                                                                                                                                                                                                  |
| `useReorderableDragging(id)` | True while that item is under the finger, e.g. to keep the full Days list (whose header holds the lift gesture) until it's dropped, then show its short edit preview.                                                                                                                                                                                                                                                                                                       |
| `useInReorderableGhost`      | True inside the lifted copy. Native-hosted content (SwiftUI or Compose hosts) doesn't lay out a second time there, so `ContextMenu` draws plain views in it. A component that hosts native views should do the same.                                                                                                                                                                                                                                                        |

## Gestures and native menus

A gesture handler on an ancestor stops the native context menus (SwiftUI and
Compose) inside it from opening. So the container's own drag and tap gestures
run only while editing. Outside edit mode each item lifts with its own hold
gesture (or its lift zone's), and holding empty space is a plain `Pressable`
long press, which doesn't block menus. While editing, items' content doesn't
take touches (`pointerEvents='box-only'`), so a hold on a row lifts the item
instead of opening the row's menu. The container's touch-down checks run as
worklets, so a touch on a badge or handle reaches that control.

## Adding it to a screen

1. Store the layout as a preference, as a list of ids (plus sizes, if items
   resize). Keep it `null` or resolve it with an "effective" function so new
   items and unknown ids from newer versions are handled.
2. Call `useEditMode('<surface>', { lifecycle: true, snapshot, onFinish })` in
   the screen. Show Add and Done in the header while `editing`.
3. Wrap the items: `ReorderableGrid` for cards, or a `ReorderableContainer`
   around your own layout with a `ReorderableItem` per item. Give `onMove` a
   function that moves an id to where the target id is.
4. Pass `onLiftToEdit` if holding an item should start editing (items without
   menus of their own), or `onBackgroundLongPress` if holding empty space
   should. Pass `onBackgroundPress={finish}`.
5. Give each item its remove and accessibility actions (move earlier and
   later, sizes, remove): VoiceOver and TalkBack can't drag.
6. Add Undo for removing (`showUndoToast`), an analytics event for the editing
   session, and a FAQ entry.

## Resizing

Give `resize` only to items that come in more than one size that makes sense.
Its options are listed smallest first. Dragging the handle snaps to the size
whose frame is nearest the dragged corner; `ReorderableGrid` fills in the
widths, and an item that changes height passes a `height` estimate per size.
Estimates are lined up with the item's real height, so text size doesn't
matter. When every option has the same frame (one column), the drag steps
through the sizes instead. Tapping the handle steps to the next size. The
snapping is in `resizeSnap.ts` and unit-tested.

## Testing

`ww-verify` drives the gestures. On iOS, `axe batch` with a held
`touch --down`, a pause longer than `LIFT_DELAY_MS`, then repeated
`touch --down` steps at new points (about 80 ms apart) is a drag. A
`touch --up` ends it. Read the order back from the preferences store.
