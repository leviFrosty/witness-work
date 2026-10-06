# iPad pointer and Pencil hover testing

Everything else about running and checking the app on simulators and emulators
lives in the [`verify-witnesswork`](../.agents/skills/verify-witnesswork/SKILL.md)
skill. Hover is the one thing it can't automate.

Hover needs a real pointer. Neither `xcrun simctl` nor XCTest can produce
hover events on iOS; XCTest's `hover()` is macOS-only, and `idb ui tap` doesn't
deliver touches to Xcode 27 simulators. To test hover:

1. Run `wwv up --platform ios --ipad`, then open that `WW Verify iPad N`
   simulator in DeviceHub
   (`/Applications/Xcode.app/Contents/Applications/DeviceHub.app`, which
   replaces Simulator.app in current Xcode).
2. Turn on pointer capture so the Mac trackpad or mouse drives the iPad
   pointer. In Simulator.app this was I/O → Input → Send Pointer to Device;
   DeviceHub should have the equivalent.
3. Check the behaviour described in the `agents.md` pointer section: effects
   on buttons and rows, tooltips on icon-only controls, chart readouts, map pin
   names, and the resize arrows on the sidebar grip.

Driving DeviceHub's window from a script needs macOS Screen Recording and
Accessibility permission for the calling app. Without them, `screencapture`
fails with "could not create image from display" and AppleScript times out.
Ask the user to grant them rather than retrying.

If you can't get pointer input, say hover is untested. Don't infer results
from code or unit tests.
