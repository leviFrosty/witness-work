#!/usr/bin/env bash
# PROTOTYPE — throwaway. Captures one Add Time variant full screen and inside
# today's day sheet (Schedule, folded "Add Time" card opened).
# Usage: scripts/prototype-add-time-shots.sh <variant: current|A|B|C> <round> [dark]
set -euo pipefail
cd "$(dirname "$0")/.."
V="$1"
R="$2"
SCHEME="${3:-light}"
FILL="${4:-}"  # a preset label to tap for a filled shot, e.g. 2h
OUT=".verify/addtime-proto/r$R"
mkdir -p "$OUT"
wwv() { node scripts/verify/ww-verify.mjs "$@"; }

wwv seed pioneer >/dev/null
sleep 12  # let seeding's one-off effects (setup confetti) finish
wwv eval "(__WW_DEV__.stores.preferences.setState({ colorScheme: '$SCHEME', homeChecklistAllDoneCelebrated: true, homeChecklistDismissed: true }), true)" >/dev/null
wwv eval "(__ADD_TIME_PROTO__.getState().setVariant('$V'), __ADD_TIME_PROTO__.getState().setBar(false), true)" >/dev/null

# Native segments have no test IDs; fall back to the "2" segment's label.
press_fill() {
  wwv ad press 'label="2 Hrs"' --settle >/dev/null 2>&1 ||
    wwv ad press "id=\"$FILL\"" --settle >/dev/null
}

remount() {
  wwv eval '(__WW_DEV__.remount(), true)' >/dev/null
  for _ in $(seq 1 30); do
    [ "$(wwv eval '__WW_DEV__.state().ready')" = "true" ] && break
    sleep 1
  done
  sleep 1
}

shot() {
  local name="$1"
  local path
  path=$(wwv shot "$name" | grep -Eo '[^" ]+\.png' | tail -1)
  cp "$path" "$OUT/$name.png"
  sips -Z 1000 "$OUT/$name.png" >/dev/null
  echo "$OUT/$name.png"
}

# Full screen: Add Time from the deep link.
remount
wwv eval "(__WW_DEV__.navigate('Add Time'), true)" >/dev/null
wwv ad wait text "Add Time" >/dev/null 2>&1 || true
wwv ad wait stable >/dev/null 2>&1 || true
sleep 3  # let the push finish
shot "$V-$SCHEME-full"
if [ -n "$FILL" ]; then
  press_fill
  wwv ad press 'label="November"' >/dev/null 2>&1 || true
  wwv ad wait stable >/dev/null 2>&1 || true
  sleep 3  # let the press highlight fade
  shot "$V-$SCHEME-full-filled"
fi

# Day sheet at its tallest (65%), as someone filling the form would drag it.
wwv eval "(__WW_DEV__.stores.splitSheet.setState({ ratio: 0.65 }), true)" >/dev/null
# Day sheet: today on Schedule with no time, open the folded card.
wwv eval '(() => { const store = __WW_DEV__.stores.serviceReports.getState(); Object.values(store.serviceReports).flatMap((m) => Object.values(m).flat()).filter((e) => new Date(e.date).toDateString() === new Date().toDateString()).forEach((e) => store.deleteServiceReport(e)); return true })()' >/dev/null
remount
wwv eval "(() => { const d = new Date(); const day = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); __WW_DEV__.navigate('Root', { screen: 'Schedule', params: { date: day } }); return true })()" >/dev/null
wwv ad wait text "TIME REPORTS" >/dev/null 2>&1 || true
wwv ad wait stable >/dev/null 2>&1 || true
if [ "$V" != "D" ] && [ "$V" != "E" ]; then
  shot "$V-$SCHEME-sheet-closed"
  wwv ad press 'id="day-time-form"' --settle >/dev/null
  wwv ad wait stable >/dev/null 2>&1 || true
fi
shot "$V-$SCHEME-sheet-open"
if [ -n "$FILL" ]; then
  sleep 1
  press_fill
  # Pressing by id can't land on Add; retry once if the sheet was still moving.
  wwv ad wait text "Add 2" >/dev/null 2>&1 || press_fill
  # Move the simulator's pointer off the chip so no hover tint lingers.
  wwv ad press 'label="TIME REPORTS"' >/dev/null 2>&1 || true
  wwv ad wait stable >/dev/null 2>&1 || true
  sleep 3  # let the press highlight fade
  shot "$V-$SCHEME-sheet-filled"
fi
if [ "$V" = "D" ] || [ "$V" = "E" ]; then
  # A future day keeps the card folded.
  remount
  wwv eval "(() => { const d = new Date(Date.now() + 2 * 864e5); const day = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); __WW_DEV__.navigate('Root', { screen: 'Schedule', params: { date: day } }); return true })()" >/dev/null
  wwv ad wait text "TIME REPORTS" >/dev/null 2>&1 || true
  wwv ad wait stable >/dev/null 2>&1 || true
  shot "$V-$SCHEME-sheet-closed"
fi
