/**
 * The Hono app: every HTTP route the Worker serves. `src/index.ts` wraps it
 * with Sentry and the cron handler, and re-exports the Durable Objects.
 */
import { Hono } from "hono";
import { routePath } from "hono/route";
import type { AppEnv, AppContext, HealthCheckResponse } from "./types";
import { HERE_API, HTTP_STATUS } from "./config";
import { apiError, dateHeader } from "./errors";
import { rateLimit } from "./rateLimit";
import { cors } from "./cors";
import { proxyRequestToHereApi } from "./proxy";
import {
  handleAasaRequest,
  handleContactLinkRequest,
  handleLegacyContactLinkRequest,
} from "./contactLink";
import {
  handleNotesImportRequest,
  handleNotesImportStatusRequest,
  handleNotesImportUsageRequest,
  handleNotesImportKickoffRequest,
  handleNotesImportTranscribeRequest,
  handleNotesImportEventsRequest,
  handleNotesImportResultRequest,
  handleNotesImportCancelRequest,
  handleNotesImportDestroyRequest,
  handleNotesImportAdminResetRequest,
} from "./notesImport/route";
import {
  cancelDocs as notesImportCancelDocs,
  destroyDocs as notesImportDestroyDocs,
  eventsDocs as notesImportEventsDocs,
  kickoffDocs as notesImportKickoffDocs,
  legacyImportDocs as notesImportLegacyDocs,
  resultDocs as notesImportResultDocs,
  statusDocs as notesImportStatusDocs,
  transcribeDocs as notesImportTranscribeDocs,
  usageDocs as notesImportUsageDocs,
} from "./notesImport/openapi";
import {
  ATTESTATION_BASE_PATH,
  deprecatedPath,
  handleAttestationChallengeRequest,
  handleAttestationRegisterRequest,
  handleAttestationStatusRequest,
  handleAttestationVerifyRequest,
} from "./attestation/route";
import {
  challengeDocs as attestationChallengeDocs,
  legacyAttestDocs,
  legacyChallengeDocs,
  legacyVerifyDocs,
  registerDocs as attestationRegisterDocs,
  statusDocs as attestationStatusDocs,
  verifyDocs as attestationVerifyDocs,
} from "./attestation/openapi";
import {
  handleScribeStatusRequest,
  handleScribeStepRequest,
  handleScribeTerritoryNotesRequest,
  handleScribeTranscribeRequest,
  handleScribeUsageRequest,
} from "./scribe/route";
import { handleScribeAdminResetRequest } from "./scribe/admin";
import { legacyAdminGate, notesImportCutover } from "./scribe/legacy";
import {
  scribeAdminResetDocs,
  scribeStatusDocs,
  scribeStepDocs,
  scribeTerritoryNotesDocs,
  scribeTranscribeDocs,
  scribeUsageDocs,
} from "./scribe/openapi";
import { handleAppStoreRatingsRequest } from "./appStoreRatings/route";
import { handleAppConfigRequest } from "./appConfig";
import { Sentry, reportableError } from "./sentry";
import { createBuddiesRoutes } from "./buddies/route";
import { createAccountsRoutes } from "./accounts/route";
import { createSpacesRoutes } from "./spaces/route";
import { createAccountsAdminRoutes } from "./accounts/admin";
import { handleBuddyInvitePage } from "./buddies/invitePage";
import { handleHandoffPage } from "./accounts/handoffPage";
import { apexPassthrough } from "./linkHosts";
import { createRoutePlanningRoutes } from "./routePlanning/route";
import { createMapsRoutes, createPlacesRoutes } from "./maps/route";
import { handleRevenueCatWebhook } from "./accounts/revenueCatWebhook";
import { revenueCatWebhookDocs } from "./accounts/openapi";
import { mountApiDocs } from "./openapi/route";
import {
  aasaDocs,
  appConfigDocs,
  appStoreRatingsDocs,
  autocompleteDocs,
  buddyInvitePageDocs,
  handoffPageDocs,
  contactLinkDocs,
  geocodeDocs,
  healthDocs,
  legacyContactLinkDocs,
  shortBuddyInvitePageDocs,
  shortContactLinkDocs,
  shortHandoffPageDocs,
  notesImportAdminResetDocs,
} from "./openapi/coreDocs";

export const app = new Hono<AppEnv>();

async function handleGeocodeRequest(context: AppContext) {
  return proxyRequestToHereApi(context, HERE_API.GEOCODE_URL);
}

async function handleAutocompleteRequest(context: AppContext) {
  return proxyRequestToHereApi(context, HERE_API.AUTOCOMPLETE_URL);
}

/**
 * Liveness plus the server clock. Clients calibrate against `Date` (and
 * `serverTime`, epoch ms) before signing time-bound requests (Buddies `ts`),
 * so it is never cached anywhere: a cached copy would carry an old clock. No
 * I/O, no rate limit.
 */
function handleHealthCheckRequest(context: AppContext) {
  const now = Date.now();
  const response: HealthCheckResponse = {
    status: "ok",
    timestamp: new Date(now).toISOString(),
    serverTime: now,
    versionId: context.env.CF_VERSION_METADATA.id,
    versionTag: context.env.CF_VERSION_METADATA.tag || undefined,
    deployedAt: context.env.CF_VERSION_METADATA.timestamp,
  };
  return context.json(response, 200, {
    "Cache-Control": "no-store",
    ...dateHeader(now),
  });
}

function handleNotFound() {
  return apiError(HTTP_STATUS.NOT_FOUND, "not_found");
}

/**
 * A route that threw. A database error is reported and logged as the route
 * alone (`reportableError`), since its message quotes the query's parameters.
 */
function handleApplicationError(error: Error, context: AppContext) {
  const reported = reportableError(
    error,
    `${context.req.method} ${routePath(context)}`
  );
  Sentry.captureException(reported);
  console.error("Application error:", reported);
  return apiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, "server_error");
}

// On the website apex (witnesswork.app), only the link pages and association
// files are ww-api's; any other request a route catches goes on to the site
// Worker (src/linkHosts.ts), so it never sees ww-api's CORS either. Every
// other host skips it. Registered first.
app.use("*", apexPassthrough());

// CORS for the web app's origins (src/cors.ts): answers preflights before
// every other middleware (no limiter, auth, or KV read sees one) and adds the
// CORS headers to every answer, errors included. Registered right after the
// apex passthrough.
app.use("*", cors());

// Scribe AI's hard cutover (src/scribe/legacy.ts): every Notes Import route
// but `GET /notes-import/status` is 426 unless KV `scribe:legacy-notes-import`
// is on, before its rate limit, auth, or kill switch. Registered before them
// so it runs first.
app.use("/notes-import", notesImportCutover());
app.use("/notes-import/*", notesImportCutover());

// Each family counts in its own per-IP bucket (src/rateLimit.ts).
app.use("/geocode", rateLimit("places"));
app.use("/autocomplete", rateLimit("places"));
app.use("/places/*", rateLimit("places"));
app.use("/notes-import", rateLimit("notes-import"));
// The usage read counts in the read edge tier instead (in its handler), so
// opening the composer on every device never spends the imports' bucket.
app.use(
  "/notes-import/*",
  rateLimit("notes-import", ["/notes-import/usage"])
);
app.use("/attestation/*", rateLimit("attestation"));
// Scribe AI's model calls; status and usage count in the read edge tier (in
// their handlers) instead.
app.use("/scribe/v1/step", rateLimit("scribe"));
app.use("/scribe/v1/transcribe", rateLimit("scribe"));
app.use("/scribe/v1/territory-notes", rateLimit("scribe"));
app.use("/admin/*", rateLimit("admin"));
app.use("/route-planning/*", rateLimit("route-planning"));
app.use("/maps/*", rateLimit("maps"));
app.use("/app/v1/*", rateLimit("app"));

app.get("/geocode", geocodeDocs, handleGeocodeRequest);
app.get("/autocomplete", autocompleteDocs, handleAutocompleteRequest);
// Points of interest for the web app's place field (HERE Discover), shaped
// rather than passed through.
app.route("/places/v1", createPlacesRoutes());
app.get("/health", healthDocs, handleHealthCheckRequest);
// The app's minimum version (Update Required), read at launch and foreground.
app.get("/app/v1/config", appConfigDocs, handleAppConfigRequest);
// Paywall social proof (App Store ratings), edge-cached; refreshed by cron.
app.get(
  "/app-store/ratings",
  appStoreRatingsDocs,
  handleAppStoreRatingsRequest
);
// Device attestation for the whole API (App Attest on iOS, Play Integrity on
// Android): challenges, App Attest key registration, and a diagnostic verify.
// Each protected route checks its own assertion (src/attestation/http.ts).
const attestationPath = (op: string) => `${ATTESTATION_BASE_PATH}/${op}`;
app.get(
  attestationPath("status"),
  attestationStatusDocs,
  handleAttestationStatusRequest
);
app.post(
  attestationPath("challenge"),
  attestationChallengeDocs,
  handleAttestationChallengeRequest
);
app.post(
  attestationPath("register"),
  attestationRegisterDocs,
  handleAttestationRegisterRequest
);
app.post(
  attestationPath("verify"),
  attestationVerifyDocs,
  handleAttestationVerifyRequest
);
// Notes Import: availability probe, the metered calls, and its run routes.
app.get(
  "/notes-import/status",
  notesImportStatusDocs,
  handleNotesImportStatusRequest
);
app.get(
  "/notes-import/usage",
  notesImportUsageDocs,
  handleNotesImportUsageRequest
);
// The attestation routes' old paths, for deployed apps: same handlers, plus a
// `Deprecation` header. Remove once the minimum app version uses the new ones.
app.post(
  "/notes-import/challenge",
  legacyChallengeDocs,
  deprecatedPath("/notes-import/challenge", attestationPath("challenge")),
  handleAttestationChallengeRequest
);
app.post(
  "/notes-import/attest",
  legacyAttestDocs,
  deprecatedPath("/notes-import/attest", attestationPath("register")),
  handleAttestationRegisterRequest
);
app.post(
  "/notes-import/verify",
  legacyVerifyDocs,
  deprecatedPath("/notes-import/verify", attestationPath("verify")),
  handleAttestationVerifyRequest
);
// Streaming import: attested kickoff → SSE progress stream → result snapshot.
app.post(
  "/notes-import/kickoff",
  notesImportKickoffDocs,
  handleNotesImportKickoffRequest
);
app.post(
  "/notes-import/transcribe",
  notesImportTranscribeDocs,
  handleNotesImportTranscribeRequest
);
app.get(
  "/notes-import/:importId/events",
  notesImportEventsDocs,
  handleNotesImportEventsRequest
);
app.get(
  "/notes-import/:importId/result",
  notesImportResultDocs,
  handleNotesImportResultRequest
);
app.post(
  "/notes-import/:importId/cancel",
  notesImportCancelDocs,
  handleNotesImportCancelRequest
);
app.post(
  "/notes-import/:importId/destroy",
  notesImportDestroyDocs,
  handleNotesImportDestroyRequest
);
// Legacy synchronous path (fallback during cutover).
app.post("/notes-import", notesImportLegacyDocs, handleNotesImportRequest);
// Scribe AI (witness-work docs/scribe-ai-protocol.md): the public status, the
// account's usage windows, one model step over SSE, paper pages, and
// territory notes. Bearer account sessions; metered per account in the
// ScribeMeter DO.
app.get("/scribe/v1/status", scribeStatusDocs, handleScribeStatusRequest);
app.get("/scribe/v1/usage", scribeUsageDocs, handleScribeUsageRequest);
app.post("/scribe/v1/step", scribeStepDocs, handleScribeStepRequest);
app.post(
  "/scribe/v1/transcribe",
  scribeTranscribeDocs,
  handleScribeTranscribeRequest
);
app.post(
  "/scribe/v1/territory-notes",
  scribeTerritoryNotesDocs,
  handleScribeTerritoryNotesRequest
);
// Maintainer-only usage resets (secret auth inside handler; 404 fail-closed).
app.post(
  "/admin/scribe/reset",
  scribeAdminResetDocs,
  handleScribeAdminResetRequest
);
// Notes Import's reset is reachable only while its routes are (legacy on).
app.post(
  "/admin/notes-import/reset",
  notesImportAdminResetDocs,
  legacyAdminGate(),
  handleNotesImportAdminResetRequest
);
// Account moderation: look up and suspend accounts (token auth; 404 fail-closed).
app.route("/admin/accounts", createAccountsAdminRoutes());
// Universal-link support for WitnessWork contact sharing. AASA must be served
// at this exact path with Content-Type application/json and no redirects.
app.get("/.well-known/apple-app-site-association", aasaDocs, handleAasaRequest);
// Shared contacts ride in the fragment (`/contacts#<payload>`), which never
// reaches the worker. The short `/c` (and `/c/:payload`, from the oldest
// builds) are in links people already sent, so they stay for good.
app.get("/contacts", contactLinkDocs, handleContactLinkRequest);
app.get("/c", shortContactLinkDocs, handleContactLinkRequest);
app.get("/c/:payload", legacyContactLinkDocs, handleLegacyContactLinkRequest);
// Buddies relay: POST /buddies/v1/{op}, ids only in bodies. Every op is
// rate-limited per caller inside the handler (src/buddies/limits.ts).
app.route("/buddies/v1", createBuddiesRoutes());
// Anonymous accounts (witness-work ADR 0024, 0026, 0027): sessions
// (`/accounts/v1/sessions`, attested once through /attestation/v1) hand out
// bearer tokens for `GET /accounts/v1/account` and the `POST
// /accounts/v1/{op}` handoff and backup ops; ops from before sessions still
// take signed envelopes while the legacy switch is on (handoff's new-phone ops
// carry a claim token instead). Rate-limited per caller inside the handler.
app.route("/accounts/v1", createAccountsRoutes());
// Shared Spaces (witness-work ADR 0037; Shared Cars): POST /spaces/v1/{op}
// and the GET /spaces/v1/live socket, bearer only, ids and member tokens in
// bodies (the socket's in `x-ww-space-auth` and `x-ww-space-token`).
// Rate-limited per caller inside the handler.
app.route("/spaces/v1", createSpacesRoutes());
// RevenueCat's webhook (ADR 0029): keeps linked customers' Supporter status
// current. RevenueCat's servers only, authenticated by the integration's
// Authorization header.
app.post(
  "/revenuecat/v1/webhook",
  revenueCatWebhookDocs,
  handleRevenueCatWebhook
);
// Buddy invite no-app fallback; the invite secret stays in the URL fragment.
// `/b` is the short path in invites already sent.
app.get("/buddies/invite", buddyInvitePageDocs, handleBuddyInvitePage);
app.get("/b", shortBuddyInvitePageDocs, handleBuddyInvitePage);
// Set Up Another Device QR codes opened by a camera instead of the app; the
// handoff secret stays in the URL fragment. `/h` is the short path.
app.get("/accounts/handoff", handoffPageDocs, handleHandoffPage);
app.get("/h", shortHandoffPageDocs, handleHandoffPage);
// Supporter-only route ordering (HERE Waypoints Sequence); coordinates only,
// with per-account limits in the RoutePlanningQuota DO.
app.route("/route-planning", createRoutePlanningRoutes());
// MapKit JS tokens for the web app's map frame (witness-work ADR 0037 §8);
// bearer, with per-account limits.
app.route("/maps/v1", createMapsRoutes());
// The OpenAPI document and Scalar reference for every route above.
mountApiDocs(app);
app.notFound(handleNotFound);
app.onError(handleApplicationError);
