# Notes Import minimum app version

`GET /notes-import/status` (ww-api) can advertise `minAppVersion`
(`major.minor.patch`). When this build's `Constants.expoConfig.version`
(`app.config.ts`) is below it, the app treats Notes Import as unavailable with
the client-synthesized reason `version_below_min`:

- the composer text input is disabled and the pinned banner explains the
  version gap with an **Update** button that opens the App Store
  (`links.appStore`);
- the Settings → App row is disabled with "Update WitnessWork to use Notes
  Import.";
- Paywall/Help allowance copy is unaffected.

Gate logic: `src/features/notes-import/lib/notesImportVersionGate.ts`; wiring
in `hooks/useNotesImportAvailability.ts`. It is **fail-open** — no floor, an
unparseable floor, or a failed probe never disables anything. The floor wins
over the proxy kill-switch because it's the one state the user can fix.

The worker does not reject requests from old builds; this is UX-only.

## When to bump

After deploying a ww-api change older builds can't handle (request/response
contract break), set the floor to the first app version that supports it:

```bash
# in ~/dev/ww-api
wrangler kv key put --binding NOTES_KV notes-import:min-version '{"minVersion":"1.42.0"}'            # production
wrangler kv key put --binding NOTES_KV notes-import:min-version '{"minVersion":"1.42.0"}' --env dev  # development
```

Edge-cached for 60 s. See `AGENTS.md` in ww-api for the full runbook.
