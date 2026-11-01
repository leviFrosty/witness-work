# Paywall App Store ratings

The paywall keeps its original rating/country wording and layout; this correction
changes the totals and their data pipeline only. The block is iOS-only; Android
continues to hide App Store ratings. `countryCount` counts storefronts with
ratings, not an independent measurement of publisher locations.

`GET /app-store/ratings` on ww-api supplies a complete sweep of Apple's public
iTunes lookup endpoint for WitnessWork (`6469723047`) across 175 storefronts.
The response includes `complete: true`, `averageRating`, `ratingCount`,
`countryCount` (rated storefronts), and `updatedAt` (ISO timestamp).

The backend retries failed or malformed storefront lookups on later hourly
runs and publishes only after all storefronts have answered successfully. It
retains the previous complete summary during a new sweep. Versioned KV and
edge-cache keys prevent the old partial summary from surviving the correction.

The app accepts only complete, dated responses, rejecting both old persisted
values and old API bodies. It keeps the last valid snapshot offline and refreshes
at most once per session when its seven-day cache expires. Until a valid fetch,
it uses the bundled snapshot. The snapshot date stays in the data, not on the
paywall screen.

The bundled snapshot was independently checked on November 1, 2026: all 175
storefronts answered, with 769 ratings, a 4.89 weighted average, and ratings in
44 storefronts. Raw lookup evidence for this correction is in
`.verify/artifacts/ratings/apple-storefront-sweep.json`.

Regression coverage:

- App: `src/features/supporter/lib/appStoreRatings.test.ts` (legacy cache
  migration, complete-response validation, failed refreshes, caching).
- ww-api: `src/appStoreRatings/ratings.test.ts` (incomplete sweeps, retry recovery,
  preserving a complete summary, malformed lookup responses, legacy summary
  rejection, weighted totals and edge caching).
