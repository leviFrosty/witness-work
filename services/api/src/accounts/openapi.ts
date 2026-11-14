import { z } from "zod";
import { describeRoute } from "hono-openapi";
import {
  apiErrorSchema,
  staleErrorSchema,
  b64u,
  buddiesId,
  errorResponse,
  fieldTable,
  json,
  jsonBody,
  jsonResponse,
  signedBody,
  signedEnvelopeSchema,
} from "../openapi/schemas";
import {
  appAttestV2AssertionFields,
  playIntegrityFields,
  sha256Hex,
} from "../attestation/openapi";
import { ACCOUNT_SESSION_PURPOSE } from "../attestation/purposes";
import {
  ACCOUNT_STATUS_REASONS,
  ACCOUNT_STATUSES,
  ACTIVITY_KINDS,
  SESSION_METHODS,
  SESSION_PLATFORMS,
} from "./schema";
import { REFRESH_REFUSALS } from "./sessionStore";

/**
 * OpenAPI descriptions for `/accounts/v1/*` (src/accounts/route.ts) and the
 * accounts admin routes. Doc-only: the handlers keep their own parsing.
 *
 * Sessions and the account are REST resources (`/sessions`, `/account`).
 * Handoff and backup stay `POST /accounts/v1/{op}`, like Buddies, on purpose:
 * their channel and slot ids travel in bodies (or headers), never URLs, which
 * Cloudflare and Sentry record. `ID_IN_BODY` says so on each of them.
 */

// Shared with the passkey routes' docs (src/accounts/passkeyOpenapi.ts).
export const accountId = buddiesId("The account id");
const status = z.enum(ACCOUNT_STATUSES);

export const epochMs = (description: string) =>
  z
    .number()
    .int()
    .meta({ description: `${description}, epoch milliseconds.` });
export const okOnly = jsonResponse("Done.", z.object({ ok: z.literal(true) }));
export const internal = {
  500: errorResponse("Unexpected failure.", ["internal"]),
};
export const readTier =
  "Limits: the Buddies read tier (600 a minute per caller IP).";

/** The account key payload every self-signed envelope carries. */
export const keyPayloadShape = {
  accountPub: b64u("Ed25519 public key of the account signing key, 32 bytes"),
  ts: z.number().int().meta({
    description:
      "Client time in epoch milliseconds; must be within 5 minutes of the server’s.",
  }),
  nonce: buddiesId("A fresh random nonce"),
};

/** A signed envelope whose payload adds `fields` to the key payload. */
export const keySignedWith = (
  op: string,
  fields: z.ZodRawShape = {},
  more = "",
) =>
  signedBody(
    z.object({ ...keyPayloadShape, ...fields }),
    `A signed envelope; \`signature\` is the account key’s signature over \`ww-account/v1\\n${op}\\n\` followed by the decoded \`payload\` bytes.${more}`,
  );

const keySignedBody = (op: string) => keySignedWith(op);

const signatureErrors = {
  400: errorResponse("Malformed envelope or payload.", ["bad_request"]),
  401: errorResponse(
    "Bad signature, or `ts` too far from the server clock. `stale` carries `serverTime` (epoch ms) and a `Date` header.",
    ["bad_signature", "stale"],
    staleErrorSchema,
  ),
};

// --- Bearer tokens and the legacy switch -----------------------------------

/** A bearer token, or (while the legacy switch is on) none: the envelope. */
const bearerOrLegacy: Record<string, string[]>[] = [{ bearerAuth: [] }, {}];

const LEGACY_FORM = (op: string) =>
  `**Legacy** (no \`Authorization\` header; app versions before sessions): a signed envelope instead, whose \`signature\` is the account key’s signature over \`ww-account/v1\\n${op}\\n\` followed by the decoded \`payload\` bytes. It works while the legacy switch (KV \`auth:legacy\`) is on and is 426 \`upgrade_required\` once it’s off. A request with an \`Authorization\` header is always a bearer request.`;

/** Why handoff and backup ops aren't resource paths. */
const ID_IN_BODY =
  "Like Buddies ops, this is `POST /accounts/v1/{op}` rather than a resource path, so its ids travel in the body (or headers), never the URL, which Cloudflare and Sentry record.";

/** A bearer request's plain JSON fields, or the legacy envelope. */
const bearerOrSignedBody = (op: string, fields: z.ZodRawShape) =>
  jsonBody(
    z.union([
      z.object(fields).meta({ title: "Bearer" }),
      signedEnvelopeSchema.meta({ title: "Legacy envelope" }),
    ]),
    `**Bearer:** the fields as plain JSON.\n\n${LEGACY_FORM(op)}\n\n**Decoded \`payload\`:**\n\n${fieldTable(
      z.object({ ...keyPayloadShape, ...fields }),
    )}`,
  );

/** No body (bearer), or the legacy envelope. */
const optionalSignedBody = (op: string) => ({
  required: false,
  description: `**Bearer:** no body.\n\n${LEGACY_FORM(op)}\n\n**Decoded \`payload\`:**\n\n${fieldTable(
    z.object(keyPayloadShape),
  )}`,
  content: json(signedEnvelopeSchema),
});

const bearerErrors = {
  400: errorResponse("Malformed JSON, envelope, or field.", ["bad_request"]),
  401: errorResponse(
    'A bearer request’s token is missing, expired, or invalid (`unauthorized`, with `WWW-Authenticate: Bearer error="invalid_token"`; refresh once and retry). A legacy request’s signature is bad (`bad_signature`) or its `ts` is more than 5 minutes off (`stale`, with `serverTime` and a `Date` header).',
    ["unauthorized", "bad_signature", "stale"],
    staleErrorSchema,
  ),
};

/**
 * Routes with `requireLiveSession` (src/accounts/auth.ts): a token whose
 * session ended is refused like an expired one.
 */
const ENDED_SESSION =
  'A token whose session has ended (signed out, signed out by another device, replaced, or expired) is refused the same way at once, even before the token itself expires: refreshing then fails too, and the app opens a new session. `reason: "key_changed"` means two things, by where it comes: on a call, the access token is from before the session’s own key change (its `kep` below the session’s key epoch), so refresh and retry; on a refresh (`POST /sessions/refresh`), the session is over because the account key changed on another session while this one was live, with `changedAt`, so sign in with the new key.';

/** 403 `key_retired`: when the key changed. */
const keyRetiredSchema = apiErrorSchema.extend({
  changedAt: epochMs("When the key was retired"),
});
const KEY_RETIRED =
  "The account key was retired by a key change (`key_retired`, with `changedAt`): it never opens a session or makes an account again; sign in with the new key.";

const upgradeRequired = {
  426: errorResponse(
    "A legacy request after the legacy switch (KV `auth:legacy`) was turned off. Update the app; there’s no `Retry-After`.",
    ["upgrade_required"],
  ),
};

export const accountRegisterDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Register an account (legacy)",
  deprecated: true,
  description: `Returns the account for a signing key, creating it on first use. Self-signed by the account key under the \`ww-account/v1\` context, and idempotent: the same key always gets the same \`accountId\`.

Replaced by opening a session (\`POST /accounts/v1/sessions\`), and kept for app versions before sessions: once the legacy switch (KV \`auth:legacy\`) is off, it’s 426 \`upgrade_required\`.

Limits: the Buddies register tier (60 a minute per caller IP) and 2,000 registrations per caller per rolling day, shared in kind with \`inbox/register\`. Answers \`disabled\` on a worker without the accounts database.`,
  requestBody: keySignedBody("account/register"),
  responses: {
    200: jsonResponse(
      "The account for this key.",
      z.object({ ok: z.literal(true), accountId, status }),
    ),
    ...signatureErrors,
    403: errorResponse(KEY_RETIRED, ["key_retired"], keyRetiredSchema),
    ...upgradeRequired,
    429: errorResponse("Over the per-caller rate or daily quota.", [
      "rate_limited",
    ]),
    500: errorResponse("Unexpected failure.", ["internal"]),
    503: errorResponse("Accounts are off on this worker.", ["disabled"]),
  },
});

const accountInfoSchema = z.object({
  ok: z.literal(true),
  accountId,
  accountPub: b64u("The account signing key’s public key"),
  status,
  createdAt: epochMs("When the account was registered"),
  keyEpoch: z.number().int().meta({
    description:
      "The account’s key epoch: `0`, raised by one on each key change (`POST /account/rekey`).",
  }),
  inboxIds: z.array(buddiesId("An inbox linked to the account")),
  statusChanges: z.array(
    z.object({ status, createdAt: epochMs("When it changed") }),
  ),
});

export const accountDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Read your account",
  description: `What the accounts database holds for the access token’s own account, for Settings → Account and the app’s developer tools: its id, public key, status, creation time, linked inboxes, and status changes (without their reasons). Read-only: it never creates an account.

Limits: the Buddies read tier (600 a minute per caller IP). Answers \`disabled\` on a worker without the accounts database.`,
  security: [{ bearerAuth: [] }],
  responses: {
    200: jsonResponse("The token’s account.", accountInfoSchema),
    401: errorResponse(
      `Missing, expired, or invalid token (\`WWW-Authenticate: Bearer error="invalid_token"\`; refresh once and retry). ${ENDED_SESSION}`,
      ["unauthorized"],
    ),
    404: errorResponse("The token’s account is gone.", ["unknown_account"]),
    429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
    500: errorResponse("Unexpected failure.", ["internal"]),
    503: errorResponse("Accounts are off on this worker.", ["disabled"]),
  },
});

export const accountInfoDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Read your account (legacy)",
  description: `\`GET /accounts/v1/account\`’s answer, for app versions before it. A bearer request with no body reads the token’s account. ${ENDED_SESSION}

${LEGACY_FORM("account/info")} An unregistered key is 404 \`unknown_account\`.

Limits: the Buddies read tier (600 a minute per caller IP). Answers \`disabled\` on a worker without the accounts database.`,
  deprecated: true,
  security: bearerOrLegacy,
  requestBody: optionalSignedBody("account/info"),
  responses: {
    200: jsonResponse("The account.", accountInfoSchema),
    ...bearerErrors,
    404: errorResponse(
      "No account has this key (legacy), or the token’s account is gone.",
      ["unknown_account"],
    ),
    ...upgradeRequired,
    429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
    500: errorResponse("Unexpected failure.", ["internal"]),
    503: errorResponse("Accounts are off on this worker.", ["disabled"]),
  },
});

const adminErrors = {
  400: errorResponse("Invalid JSON or field.", ["bad_request"]),
  404: errorResponse(
    "Missing or wrong admin token, no accounts database, or no such account.",
    ["not_found", "unknown_account"],
  ),
  429: errorResponse("Too many admin requests from this IP.", ["rate_limited"]),
};

const accountSummary = z.object({
  id: accountId,
  status,
  inboxIds: z.array(buddiesId("An inbox linked to the account")),
});

export const accountLookupDocs = describeRoute({
  tags: ["Admin"],
  summary: "Look up an account",
  description:
    "Finds an account, its status, and its inboxes. Abuse reports name the buddy’s `inboxId`; this finds the account behind it. Send `inboxId` or `accountId`.",
  security: [{ adminToken: [] }],
  requestBody: jsonBody(
    z.union([
      z.object({ inboxId: buddiesId("The reported inbox") }),
      z.object({ accountId }),
    ]),
  ),
  responses: {
    200: jsonResponse(
      "The account.",
      z.object({ ok: z.literal(true), account: accountSummary }),
    ),
    ...adminErrors,
  },
});

export const accountStatusDocs = describeRoute({
  tags: ["Admin"],
  summary: "Suspend or reinstate an account",
  description:
    "Sets the account’s status, records the change in `account_status_events`, and tells each of its inboxes. A suspended account’s inboxes refuse owner ops with 403 `suspended` and close their live sockets. If `inboxesFailed` is above 0, send the same request again.",
  security: [{ adminToken: [] }],
  requestBody: jsonBody(
    z.object({
      accountId,
      status: status.meta({ description: "`active` reinstates." }),
      reason: z.enum(ACCOUNT_STATUS_REASONS),
    }),
  ),
  responses: {
    200: jsonResponse(
      "Status recorded. `ok` is false when some inboxes weren’t updated.",
      z.object({
        ok: z.boolean(),
        account: accountSummary,
        inboxesUpdated: z.number().int(),
        inboxesFailed: z.number().int(),
      }),
    ),
    ...adminErrors,
  },
});

// --- Handoff (Set Up Another Device) ---------------------------------------

const channelId = buddiesId("The channel id from the QR code");
const claimToken = buddiesId(
  'The claim token, `HKDF-SHA256(secret, "", "ww-account/v1/handoff/claim\\n" + channelId, 16)`',
);
const expiresAt = epochMs("When the channel and everything in it is deleted");
const handoffStatus = z.enum(["open", "claimed", "sent", "done", "cancelled"]);

const accountsOff = {
  503: errorResponse("Accounts are off on this worker.", ["disabled"]),
};
const notFound = errorResponse(
  "No such channel, or it expired (10 minutes after `handoff/open`).",
  ["not_found"],
);
const oldPhoneErrors = (extra: string) => ({
  ...bearerErrors,
  403: errorResponse("Another account opened this channel.", ["forbidden"]),
  404: errorResponse(
    `${extra} Also \`unknown_account\` when no account has the signing key (legacy).`,
    ["not_found", "unknown_account"],
  ),
  ...upgradeRequired,
});
const tokenErrors = {
  400: errorResponse("Malformed JSON or field.", ["bad_request"]),
  401: errorResponse(
    "Wrong `claimToken`. The fifth wrong token on a channel cancels it.",
    ["bad_signature"],
  ),
  404: notFound,
};
const tokenBody = (extra: z.ZodRawShape = {}) =>
  jsonBody(z.object({ channelId, claimToken, ...extra }));

export const handoffOpenDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Open a handoff channel (old phone)",
  description: `The phone with the account opens a channel for Set Up Another Device and shows its QR code. The server stores the account, the claim token’s verifier, and nothing else until a new phone claims it. The channel and everything in it is deleted 10 minutes after opening.

A bearer request needs a live session: ${ENDED_SESSION}

Limits: the Buddies register tier (60 a minute per caller IP) and 20 opens per account a rolling day.

${ID_IN_BODY}`,
  security: bearerOrLegacy,
  requestBody: bearerOrSignedBody("handoff/open", {
    channelId,
    verifier: b64u("`SHA-256(claimToken bytes)`, 32 bytes"),
  }),
  responses: {
    200: jsonResponse("Opened.", z.object({ ok: z.literal(true), expiresAt })),
    ...bearerErrors,
    404: errorResponse("No account has this key; register first (legacy).", [
      "unknown_account",
    ]),
    ...upgradeRequired,
    409: errorResponse("The channel already exists.", ["conflict"]),
    429: errorResponse("Over the per-caller rate or the daily opens.", [
      "rate_limited",
    ]),
    ...internal,
    ...accountsOff,
  },
});

export const handoffClaimDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Claim a handoff channel (new phone)",
  description: `The new phone answers the QR code with its temporary X25519 public key and its sealed hello. The first valid claim wins; repeating it with the same body gets \`ok\` again (a lost response), and any other claim is \`conflict\`. Plain JSON, authorized by \`claimToken\`.

${readTier}

${ID_IN_BODY}`,
  requestBody: tokenBody({
    claimPub: b64u("The new phone’s temporary X25519 public key, 32 bytes"),
    hello: b64u(
      "The hello, sealed with `helloKey` (`0x01 ‖ nonce[12] ‖ ChaCha20-Poly1305`), at most 2,048 characters",
    ),
  }),
  responses: {
    200: jsonResponse(
      "Claimed (or the same claim again).",
      z.object({ ok: z.literal(true), expiresAt }),
    ),
    ...tokenErrors,
    409: errorResponse("Another phone claimed it, or it was cancelled.", [
      "conflict",
    ]),
    413: errorResponse("`hello` is over 2,048 characters.", ["too_large"]),
    429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
    ...internal,
    ...accountsOff,
  },
});

export const handoffStatusDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Read a handoff channel (old phone)",
  description: `What the old phone polls (every 1.5 seconds) while it shows the code: the status and, once claimed, the new phone’s public key and sealed hello. Only the opening account can read it.

${readTier}

${ID_IN_BODY}`,
  security: bearerOrLegacy,
  requestBody: bearerOrSignedBody("handoff/status", { channelId }),
  responses: {
    200: jsonResponse(
      "The channel.",
      z.object({
        ok: z.literal(true),
        status: handoffStatus,
        expiresAt,
        claimPub: b64u(
          "The new phone’s temporary public key, from `claimed` until `done` or `cancelled`",
        ).optional(),
        hello: b64u(
          "The sealed hello, from `claimed` until `done` or `cancelled`",
        ).optional(),
      }),
    ),
    ...oldPhoneErrors("No such channel, or it expired."),
    429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
    ...internal,
    ...accountsOff,
  },
});

export const handoffSendDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Send the account key (old phone)",
  description: `After the User approves the new phone, the old phone sends the account key sealed with \`keyKey\`. Only while \`claimed\`; the status becomes \`sent\`.

A bearer request needs a live session: ${ENDED_SESSION}

${readTier}

${ID_IN_BODY}`,
  security: bearerOrLegacy,
  requestBody: bearerOrSignedBody("handoff/send", {
    channelId,
    key: b64u(
      "The account key, sealed with `keyKey`, at most 1,024 characters",
    ),
  }),
  responses: {
    200: okOnly,
    ...oldPhoneErrors("No such channel, or it expired."),
    409: errorResponse("The channel isn’t `claimed`.", ["conflict"]),
    413: errorResponse("`key` is over 1,024 characters.", ["too_large"]),
    429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
    ...internal,
    ...accountsOff,
  },
});

export const handoffReceiveDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Poll for the account key (new phone)",
  description: `The new phone polls (every 1.5 seconds) until the status is \`sent\`, which carries the sealed key, or \`cancelled\`.

${readTier}

${ID_IN_BODY}`,
  requestBody: tokenBody(),
  responses: {
    200: jsonResponse(
      "The status, and the key once sent.",
      z.object({
        ok: z.literal(true),
        status: handoffStatus,
        key: b64u("The sealed account key, while `sent`").optional(),
      }),
    ),
    ...tokenErrors,
    429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
    ...internal,
    ...accountsOff,
  },
});

export const handoffDoneDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Finish a handoff (new phone)",
  description: `The new phone has the key: the server deletes the blobs at once and keeps only the status (\`done\`) until the channel expires. Repeating it is \`ok\`.

${readTier}

${ID_IN_BODY}`,
  requestBody: tokenBody(),
  responses: {
    200: okOnly,
    ...tokenErrors,
    409: errorResponse("The key wasn’t sent, or the channel was cancelled.", [
      "conflict",
    ]),
    429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
    ...internal,
    ...accountsOff,
  },
});

export const handoffCancelDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Cancel a handoff (either phone)",
  description: `Either phone ends the channel: the server deletes every blob at once and keeps only the status (\`cancelled\`) until the channel expires. Idempotent; a \`done\` channel stays \`done\`. The new phone sends plain JSON with \`claimToken\` (with or without a session of its own). The old phone sends \`{ channelId }\` as a bearer request and must be the opening account; before sessions it sent a signed envelope (op \`handoff/cancel\`, payload \`channelId\` plus the key payload), which works while the legacy switch is on.

${readTier}

${ID_IN_BODY}`,
  security: bearerOrLegacy,
  requestBody: jsonBody(
    z.union([
      z.object({ channelId, claimToken }).meta({ title: "New phone" }),
      z.object({ channelId }).meta({ title: "Old phone (bearer)" }),
      signedEnvelopeSchema.meta({ title: "Old phone (legacy envelope)" }),
    ]),
    "A body with `claimToken` is the new phone’s. Otherwise a bearer request, or a signed envelope, is the old phone’s.",
  ),
  responses: {
    200: okOnly,
    400: errorResponse("Malformed envelope, JSON, or field.", ["bad_request"]),
    401: errorResponse(
      "The old phone’s token is missing, expired, or invalid (`unauthorized`), its envelope’s signature is bad or `ts` stale (legacy), or the new phone’s `claimToken` is wrong (`bad_signature`; the fifth cancels the channel).",
      ["unauthorized", "bad_signature", "stale"],
      staleErrorSchema,
    ),
    ...upgradeRequired,
    403: errorResponse("Another account opened this channel.", ["forbidden"]),
    404: errorResponse(
      "No such channel, it expired, or no account has the signing key.",
      ["not_found", "unknown_account"],
    ),
    429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
    ...internal,
    ...accountsOff,
  },
});

// --- Backup ------------------------------------------------------------------

const slotId = buddiesId("The device’s backup slot");
const backupOff = {
  503: errorResponse(
    "Backups are off on this worker (no backup bucket or accounts database).",
    ["disabled"],
  ),
};
const backupNotes =
  "A suspended account can still back up. A slot is deleted 400 days after its last upload.";

const backupEtag = z.string().meta({
  description:
    "The slot’s etag, opaque. Send it quoted in `If-Match` on `backup/put`.",
});

const binary = (description: string) => ({
  description,
  content: {
    "application/octet-stream": {
      schema: { type: "string" as const, format: "binary" },
    },
  },
});

const keyPayloadFields = (op: string, fields: z.ZodRawShape) =>
  fieldTable(
    z.object({
      accountPub: b64u(
        "Ed25519 public key of the account signing key, 32 bytes",
      ),
      ts: z.number().int().meta({
        description:
          "Client time in epoch milliseconds; must be within 5 minutes of the server’s.",
      }),
      nonce: buddiesId("A fresh random nonce"),
      ...fields,
    }),
  ) +
  `\n\nSigned over \`ww-account/v1\\n${op}\\n\` followed by the decoded \`payload\` bytes.`;

export const backupPutDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Upload a backup",
  description: `Replaces this device’s slot with an end-to-end encrypted backup (\`0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305\`). A bearer request; the body is the raw blob, at most 20 MiB, with the slot in \`x-ww-slot-id\`, \`b64u(SHA-256(body))\` in \`x-ww-sha256\`, and its length in \`Content-Length\`.

**Legacy** (no \`Authorization\` header): the signed envelope (op \`backup/put\`) rides in the \`x-ww-payload\` and \`x-ww-signature\` headers instead, while the legacy switch is on (older builds send \`x-ww-p\`/\`x-ww-s\`).

**Decoded \`x-ww-payload\`:**

${keyPayloadFields("backup/put", {
  slotId,
  size: z.number().int().min(1).meta({
    description:
      "The body’s exact length, at most 20 MiB. `Content-Length`, when sent, must match.",
  }),
  sha256: b64u("`SHA-256(body)`, 32 bytes"),
})}

\`If-Match: "<etag>"\` (optional; the slot’s \`etag\` from \`backup/list\`, or the \`ETag\` of \`backup/get\`) puts only while the slot still holds exactly those bytes: re-sealing a slot after an account key change can then never roll back a newer backup or re-create a deleted one. A slot that has other bytes or no longer exists is 412 \`precondition_failed\` and nothing is written; a weak (\`W/"…"\`), unquoted, \`*\`, or list value is 400 \`bad_request\`. The match is checked again inside the storage write, so a put landing in between can’t be overwritten. Without the header the put replaces whatever is there, as before. The etag is opaque; compare it, don’t parse it. The 200 returns the slot’s new one.

Limits: 20 MiB a blob, 8 slots an account, one upload a slot a minute (a conditional put counts too), and the Buddies photo-upload tier (60 a minute per caller IP). ${backupNotes}

${ID_IN_BODY}`,
  security: bearerOrLegacy,
  parameters: [
    {
      name: "x-ww-slot-id",
      in: "header" as const,
      required: false,
      schema: { type: "string" as const },
      description: "Bearer: the device’s slot id (22-character base64url).",
    },
    {
      name: "x-ww-sha256",
      in: "header" as const,
      required: false,
      schema: { type: "string" as const },
      description: "Bearer: `SHA-256(body)`, 32 bytes, base64url.",
    },
    {
      name: "Content-Length",
      in: "header" as const,
      required: false,
      schema: { type: "integer" as const },
      description:
        "The body’s length; required on a bearer request (it is the size), at most 20 MiB.",
    },
    {
      name: "If-Match",
      in: "header" as const,
      required: false,
      schema: { type: "string" as const },
      description:
        'A strong quoted `"<etag>"` of the slot to replace; see above.',
    },
    {
      name: "x-ww-payload",
      in: "header" as const,
      required: false,
      schema: { type: "string" as const },
      description: "Legacy: the request’s fields as UTF-8 JSON, base64url.",
    },
    {
      name: "x-ww-signature",
      in: "header" as const,
      required: false,
      schema: { type: "string" as const },
      description: "Legacy: the account key’s Ed25519 signature, base64url.",
    },
  ],
  requestBody: { required: true, ...binary("The encrypted backup bytes.") },
  responses: {
    200: {
      ...jsonResponse(
        "Stored. The new etag is also sent as `ETag`.",
        z.object({
          ok: z.literal(true),
          uploadedAt: epochMs("When the slot was written"),
          etag: backupEtag,
        }),
      ),
      headers: {
        ETag: {
          description: "The slot’s new quoted etag.",
          schema: { type: "string" as const },
        },
      },
    },
    400: errorResponse(
      "Missing or malformed headers or payload (a weak, unquoted, `*`, or list `If-Match` too), or a body whose length isn’t `size` or whose SHA-256 isn’t `sha256`.",
      ["bad_request"],
    ),
    401: bearerErrors[401],
    404: errorResponse("No account has this key; register first (legacy).", [
      "unknown_account",
    ]),
    412: errorResponse(
      "`If-Match` didn’t match the slot’s etag, or the slot doesn’t exist. Nothing was written.",
      ["precondition_failed"],
    ),
    413: errorResponse(
      "`size`, `Content-Length`, or the streamed body is over 20 MiB.",
      ["too_large"],
    ),
    ...upgradeRequired,
    429: errorResponse(
      "The account has 8 other slots (`limit`; delete one first), the slot was written less than a minute ago, or over the per-caller rate (`rate_limited`, with `Retry-After`).",
      ["limit", "rate_limited"],
    ),
    ...internal,
    ...backupOff,
  },
});

export const backupListDocs = describeRoute({
  tags: ["Accounts"],
  summary: "List backups",
  description: `Every slot of the caller’s account, for a restore. A bearer request with no body.

${LEGACY_FORM("backup/list")}

${readTier} ${backupNotes}

${ID_IN_BODY}`,
  security: bearerOrLegacy,
  requestBody: optionalSignedBody("backup/list"),
  responses: {
    200: jsonResponse(
      "The account’s slots.",
      z.object({
        ok: z.literal(true),
        slots: z.array(
          z.object({
            slotId,
            size: z.number().int().meta({ description: "Bytes." }),
            uploadedAt: epochMs("When the slot was last written"),
            etag: backupEtag,
          }),
        ),
      }),
    ),
    ...bearerErrors,
    404: errorResponse("No account has this key; register first (legacy).", [
      "unknown_account",
    ]),
    ...upgradeRequired,
    429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
    ...internal,
    ...backupOff,
  },
});

export const backupGetDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Download a backup",
  description: `Streams one slot’s bytes exactly as uploaded. A bearer request.

${readTier}

${ID_IN_BODY}`,
  security: bearerOrLegacy,
  requestBody: bearerOrSignedBody("backup/get", { slotId }),
  responses: {
    200: {
      ...binary("The encrypted backup bytes."),
      headers: {
        "Cache-Control": {
          description: "`no-store`.",
          schema: { type: "string" as const },
        },
        "Content-Length": { schema: { type: "integer" as const } },
        ETag: {
          description:
            "The slot’s quoted etag, for `If-Match` on `backup/put`.",
          schema: { type: "string" as const },
        },
      },
    },
    ...bearerErrors,
    404: errorResponse(
      "The account has no such slot (`not_found`), or no account has the key (legacy).",
      ["not_found", "unknown_account"],
    ),
    ...upgradeRequired,
    429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
    ...internal,
    ...backupOff,
  },
});

export const backupDeleteDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Delete backups",
  description: `Deletes one slot, or every slot of the account when \`slotId\` is left out (before Delete Buddies replaces the account key). Gone from storage at once; idempotent.

A bearer request **and** a signed envelope: \`signature\` is the account key’s signature over \`ww-account/v1\\nbackup/delete\\n\` followed by the decoded \`payload\` bytes, and the key must be the token’s own account (\`forbidden\` otherwise), so a leaked token alone can’t delete backups. A web session must have passed a passkey step-up (or opened) in the last 5 minutes (\`step_up_required\`); phone sessions are exempt. Each bearer request’s envelope works once (409 \`replay\`; sign a new one to retry). ${ENDED_SESSION} **Legacy** (no \`Authorization\` header): the envelope alone, while the legacy switch is on.

${readTier}

${ID_IN_BODY}`,
  security: bearerOrLegacy,
  requestBody: keySignedWith("backup/delete", {
    slotId: slotId.optional(),
  }),
  responses: {
    200: okOnly,
    ...bearerErrors,
    403: errorResponse(
      "The envelope is signed by another account than the token’s (`forbidden`), or the web session needs a step-up (`step_up_required`).",
      ["forbidden", "step_up_required"],
    ),
    404: errorResponse("No account has this key; register first.", [
      "unknown_account",
    ]),
    409: errorResponse("This envelope was already used; sign a new one.", [
      "replay",
    ]),
    ...upgradeRequired,
    429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
    ...internal,
    ...backupOff,
  },
});

// --- Sessions ----------------------------------------------------------------

const sessionsOff = {
  503: errorResponse(
    "Sessions are off on this worker (no accounts database or token secret).",
    ["disabled"],
  ),
};

const sessionHash = sha256Hex(
  '`SHA-256(UTF-8("ww-account/v1/session\\n" + accountPub))`; `contentHash` and `requestHash` are both this',
);
const sessionInstallId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/)
  .meta({
    description:
      "The install id (`uuid`) the challenge was issued for; its App Attest key is pinned to it.",
  });
const sessionAttestationBinding = {
  uuid: sessionInstallId,
  contentHash: sessionHash,
  requestHash: sessionHash,
};
const appAttestSessionAttestation = z
  .object({
    ...appAttestV2AssertionFields(ACCOUNT_SESSION_PURPOSE),
    ...sessionAttestationBinding,
  })
  .meta({ title: "App Attest v2 (iOS)" });
const playIntegritySessionAttestation = z
  .object({
    ...playIntegrityFields(ACCOUNT_SESSION_PURPOSE),
    ...sessionAttestationBinding,
  })
  .meta({ title: "Play Integrity (Android)" });
const sessionOpenPayload = z.object({
  ...keyPayloadShape,
  attestation: z
    .union([appAttestSessionAttestation, playIntegritySessionAttestation])
    .optional()
    .meta({
      description:
        "The challenge request’s fields plus `challenge` and the assertion or integrity token (tables below). Required except with the development bypass.",
    }),
  device: b64u("The sealed device label, at most 512 characters").optional(),
  ticket: z.string().optional().meta({
    description:
      "A browser’s ticket in place of `attestation` (`passkey`, `approval`, or `recovery`; at most 512 characters, 2 minutes, for this key’s account). Both is `bad_request`.",
  }),
  appVersion: z.string().optional().meta({
    description: "The app version, `major.minor.patch`, at most 32 characters.",
  }),
  capabilities: z.array(z.string()).optional().meta({
    description:
      "What the app does, so ww-api knows what it may send it: `sync-everyone` (it turns Cloud Sync on by itself only for a new install; without it, `everyone`’s Cloud Sync is a Supporter benefit for this session). At most 16 names of at most 32 characters (`a-z0-9-`); unknown names are ignored.",
  }),
  accountId: buddiesId(
    "The account the device expects: the session opens only if `accountPub` is its current key (404 `unknown_account` otherwise), and never creates an account",
  ).optional(),
  renews: buddiesId(
    "A renewal: the live phone session this one replaces, whose access token the request carries as `Authorization: Bearer` (see Renewing). Never with `ticket`",
  ).optional(),
});

/** `attestation_failed` and the attestation `bad_request`s carry these. */
const sessionAttestationErrorSchema = apiErrorSchema
  .extend({
    reason: z.string().optional().meta({
      description:
        "The attestation routes’ stable reason: `device_integrity_failed`, `app_not_recognized`, `integrity_token_invalid`, `integrity_unavailable`, a challenge reason (`challenge_not_found`, `challenge_expired`, `operation_conflict`), an App Attest key reason (`identity_not_bound`, `key_not_active`, `assertion_invalid`, `counter_not_increasing`), or `invalid_request` / `unsupported_protocol` on a 400.",
    }),
    action: z.string().optional().meta({
      description:
        "What to do next, as on the attestation routes: `none`, `retry`, `start_new_operation`, `bind`, …",
    }),
  })
  .meta({
    id: "SessionAttestationError",
    description:
      "The accounts error envelope (`error` repeats `code`) plus the attestation’s `reason` and `action`.",
  });

/** Refresh tokens: `<sessionId>.<secret>.<mac>`, b64u of 16, 32, 32 bytes. */
const refreshTokenSchema = (description: string) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/)
    .meta({
      description: `${description}. Opaque to the app: the session’s id, a secret, and the server’s MAC over both, \`<sessionId>.<secret>.<mac>\` (base64url, 16, 32, and 32 bytes); store and send it as is`,
    });

export const tokenPair = {
  accessToken: z.string().meta({
    description:
      "A JWT (HS256) for `Authorization: Bearer`, opaque to the app. Keep it in memory only.",
  }),
  accessExpiresAt: epochMs("When the access token expires (15 minutes)"),
  refreshToken: refreshTokenSchema(
    "The session’s refresh token. Keep it in the platform keystore, not synced; each refresh replaces it",
  ),
  sessionExpiresAt: epochMs(
    "When the session ends: 90 days after it opened for phones (refreshing never extends it); for `web`, 180 days after this refresh",
  ),
};

export const sessionPlatformOf = z.enum(SESSION_PLATFORMS).meta({
  description:
    "The session’s platform (the access token’s `platform` claim): `ios`, `android`, `dev`, or `web`.",
});

const sessionDevBypassHeader = {
  name: "x-ww-dev-bypass",
  in: "header" as const,
  required: false,
  schema: { type: "string" as const },
  description:
    "Development worker only: the `NOTES_IMPORT_DEV_BYPASS_TOKEN` secret, in place of `attestation` (platform `dev`). Production never sets the token, so the header is ignored there.",
};

export const sessionOpenDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Open a session",
  description: `The one place an account proves it’s the app. First get a challenge from \`POST /attestation/v1/challenge\` with \`purpose: "account-session"\` and both hashes set to the hash of \`accountPub\`: an App Attest v2 \`assert\` challenge on iOS (the install’s key, bound through \`POST /attestation/v1/register\`), or a Play Integrity v1 challenge on Android (\`attestationProvider: "play-integrity"\`). Then send this envelope, self-signed by the account key (op \`session/open\`) and carrying the answer: the signature covers the attestation and the attestation covers \`accountPub\`.

Creates the account when the key has none (it replaces \`account/register\`), unless the payload names \`accountId\`: then it opens only into that account, when \`accountPub\` is its current key. A key a key change retired is \`key_retired\` whichever way the session opens, and never makes an account. A suspended account still gets a session (\`status: suspended\`). Opening an eleventh live phone session for an account ends its oldest.

**Web sessions:** a browser sends \`ticket\` (from \`POST /passkeys/assert\`, \`approval/receive\`, or \`web/recovery\`) in place of \`attestation\`. The ticket’s account must be \`accountPub\`’s and exist (a ticket never creates one; \`ticket_invalid\` otherwise). The session’s platform is \`web\`; it lasts 180 days from its last refresh, with no absolute limit, and counts as stepped up when it opens. At most 3 web sessions an account, apart from the phones’ 10: a fourth ends the least recently active (\`session.replaced\`). The same signed request again (same \`nonce\` and ticket) within the ticket’s 2 minutes, after a lost response, gets the same session, a new access token, and the same refresh token (or, if that one was refreshed in the last minute, the token it was replaced by), so the first answer’s refresh token never counts as reused. An \`approval\` ticket opens a session only while the phone session that approved is live. Answers 201 with \`Location: /accounts/v1/sessions/current\`, the session the new access token addresses.

**Renewing:** a phone renews its live session before its 90 days are up with the same request (account key envelope and a fresh attestation) plus \`renews\`, that session’s id, and its access token as \`Authorization: Bearer\`. The new session (a full 90 days) replaces it: the old one ends with refresh reason \`renewed\`, and the account’s activity gets one \`session.renewed\` (\`session\` the new one, \`actor\` the old one) and no \`session.opened\`. It keeps the old session’s account and platform, and its label, app version, and capabilities unless the request sends new ones; phones never step up, so there’s no step-up to keep. It never ends another session at the cap, since the old one ends first. 401 \`unauthorized\` when the token isn’t that session’s, the session isn’t live (signed out, revoked, replaced, renewed, expired), isn’t a phone’s, isn’t \`accountPub\`’s account, or isn’t the attestation’s platform: the app then keeps its session and opens a new one when it ends. A refused attestation ends nothing. Renewals count toward the 20 opens a day. When the old session’s refresh token comes back (the device lost this answer, or was stopped before saving it), the new session is signed out (\`session.signed_out\`) if it has never been refreshed, so no session is left live without a holder; one that was refreshed stays.

\`device\` is the device’s label, sealed (Buddies \`seal\` format) under \`HKDF-SHA256(accountKey, "", "ww-account/v1/device", 32)\` with AAD \`"ww-account/v1/device\\n" + accountPub\`; the server stores it and can’t read it.

Limits: the Buddies register tier (60 a minute per caller IP) and 20 opens per account key a rolling day.`,
  parameters: [sessionDevBypassHeader],
  requestBody: jsonBody(
    signedEnvelopeSchema,
    `A signed envelope; \`signature\` is the account key’s signature over \`ww-account/v1\\nsession/open\\n\` followed by the decoded \`payload\` bytes.

**Decoded \`payload\`:**

${fieldTable(sessionOpenPayload)}

**\`attestation\`, App Attest v2 (iOS):**

${fieldTable(appAttestSessionAttestation)}

**\`attestation\`, Play Integrity (Android):**

${fieldTable(playIntegritySessionAttestation)}`,
  ),
  responses: {
    201: {
      ...jsonResponse(
        "The session.",
        z.object({
          ok: z.literal(true),
          accountId,
          status,
          sessionId: buddiesId("The session"),
          platform: sessionPlatformOf,
          ...tokenPair,
        }),
      ),
      headers: {
        Location: {
          description: "`/accounts/v1/sessions/current`.",
          schema: { type: "string" as const },
        },
      },
    },
    400: errorResponse(
      "Malformed envelope, payload, or attestation, or an attestation for another key or purpose.",
      ["bad_request"],
      sessionAttestationErrorSchema,
    ),
    401: errorResponse(
      "Bad signature, or `ts` too far from the server clock (`stale` carries `serverTime` and a `Date` header). `unauthorized`: a renewal (`renews`) whose bearer token or session can’t be renewed (see Renewing).",
      ["bad_signature", "stale", "unauthorized"],
      staleErrorSchema,
    ),
    403: errorResponse(
      `The attestation was refused (there’s no fallback: no attestation, no session), or a browser’s ticket is malformed, expired, used, or for another account (\`ticket_invalid\`). ${KEY_RETIRED}`,
      ["attestation_failed", "ticket_invalid", "key_retired"],
      sessionAttestationErrorSchema.extend({
        changedAt: epochMs(
          "`key_retired`: when the key was retired",
        ).optional(),
      }),
    ),
    404: errorResponse(
      "The payload named `accountId`, and `accountPub` isn’t that account’s current key.",
      ["unknown_account"],
    ),
    413: errorResponse("`device` is over 512 characters.", ["too_large"]),
    429: errorResponse(
      "Over the per-caller rate, the account key’s 20 opens a day, or the install’s open challenges (`too_many_challenges`, `Retry-After: 300`).",
      ["rate_limited"],
      sessionAttestationErrorSchema,
    ),
    ...internal,
    ...sessionsOff,
  },
});

const rekeyPayload = {
  newAccountPub: b64u(
    "The new account signing key’s public key, 32 bytes; not any account’s key or a retired one",
  ),
  keyEpoch: z.number().int().meta({
    description:
      "The account’s key epoch as the device read it (`GET /account`); the swap happens only while it’s still the account’s.",
  }),
  device: b64u(
    'The caller’s device label re-sealed under the new key (AAD `"ww-account/v1/device\\n" + newAccountPub`), at most 512 characters',
  ).optional(),
  history: b64u(
    "The key history, sealed under the new key’s history key; stored opaque, at most 65,536 characters",
  ),
  passkeyWrap: z
    .object({
      credentialId: b64u("The passkey of this session’s step-up"),
      wrapId: buddiesId("A fresh id for the wrap"),
      wrap: b64u(
        "The new account key wrapped for the new epoch, 98 characters",
      ),
    })
    .optional()
    .meta({
      description:
        "A wrap of the new key from the passkey of this session’s step-up (any platform’s session that passed one); `credentialId` must be that passkey.",
    }),
};

export const accountRekeyDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Change the account key",
  description: `The same account under a new key (witness-work ADR 0039). Bearer with a live session, **and** the current key’s envelope (op \`account/rekey\`, each envelope works once), **and** \`newSignature\`: the new key’s signature over \`ww-account/v1\\naccount/rekey/new\\n\` followed by the same decoded \`payload\` bytes, so nobody can move an account to a key they don’t hold.

**Who may:** an attested phone session (\`ios\`, \`android\`, \`dev\`) at any age; a web session at least 24 hours old (\`session_too_new\`) that passed a step-up in the last 5 minutes (\`step_up_required\`). A suspended account may.

**One batch:** the account’s key and epoch are swapped only while they’re still the payload’s (409 \`conflict\` with the account’s \`keyEpoch\` otherwise, so of two devices changing the key at once one wins); the old key is retired for good (\`key_retired\` on every session open); every other session still live ends (\`session.revoked\`, with this one as actor; \`ended_reason: key_changed\`, so its refresh is refused with \`reason: "key_changed"\` and \`changedAt\`; one already ended keeps why it ended); this session takes the new epoch and \`device\`; every passkey wrap is deleted and \`passkeyWrap\` stored for the new epoch; the key history is stored; each RevenueCat customer the account links is unlinked from other accounts that first linked it later, and locked to it for 90 days unless another account linked it as early or earlier (see \`POST /accounts/v1/revenuecat-customers\`); \`account.key_changed\` is logged. Then every Cloud Sync socket of the account closes with \`4005 "key_changed"\`.

The answer’s access token carries the new epoch; the refresh token is unchanged, and its next refresh carries the new epoch too. A lost answer isn’t retried with the same envelope: refresh, then \`GET /account\` says whether the key changed. ${ENDED_SESSION}

Limits: 3 changes per account a rolling day and 10 a rolling 30 days, and the Buddies register tier (60 a minute per caller IP).`,
  security: [{ bearerAuth: [] }],
  requestBody: jsonBody(
    signedEnvelopeSchema.extend({
      newSignature: b64u(
        "The new key’s Ed25519 signature over `ww-account/v1\\naccount/rekey/new\\n` and the decoded payload",
      ),
    }),
    `\`signature\` is the current key’s signature over \`ww-account/v1\\naccount/rekey\\n\` followed by the decoded \`payload\` bytes.

**Decoded \`payload\`:**

${fieldTable(z.object({ ...keyPayloadShape, ...rekeyPayload }))}`,
  ),
  responses: {
    200: jsonResponse(
      "The key changed.",
      z.object({
        ok: z.literal(true),
        keyEpoch: z.number().int().meta({ description: "The new key epoch." }),
        accessToken: tokenPair.accessToken,
        accessExpiresAt: tokenPair.accessExpiresAt,
      }),
    ),
    400: errorResponse(
      "Malformed envelope or payload, or the same key twice.",
      ["bad_request"],
    ),
    401: errorResponse(
      `The token is missing, expired, or invalid (\`unauthorized\`); a signature is bad (\`bad_signature\`), or \`ts\` is more than 5 minutes off (\`stale\`). ${ENDED_SESSION} A session that ends while the change runs is \`unauthorized\` with its \`reason\` (\`revoked\`, \`replaced\`, \`expired\`), never a \`conflict\`: the key didn’t change.`,
      ["unauthorized", "bad_signature", "stale"],
      staleErrorSchema,
    ),
    403: errorResponse(
      "The envelope’s key isn’t the account’s (`forbidden`), or the web session is younger than 24 hours (`session_too_new`) or needs a step-up (`step_up_required`).",
      ["forbidden", "session_too_new", "step_up_required"],
    ),
    404: errorResponse(
      "`passkeyWrap` names a credential other than this session’s step-up passkey.",
      ["not_found"],
    ),
    409: errorResponse(
      "The key or epoch changed first (`keyEpoch` says the account’s now), the new key is in use or retired, or this envelope was already used (`replay`).",
      ["conflict", "replay"],
      apiErrorSchema.extend({
        keyEpoch: z
          .number()
          .int()
          .optional()
          .meta({ description: "The account’s key epoch now." }),
      }),
    ),
    413: errorResponse("`history` or `device` is over its cap.", ["too_large"]),
    429: errorResponse(
      "Over the per-caller rate, or the account’s key changes a day or 30 days.",
      ["rate_limited"],
    ),
    ...internal,
    ...sessionsOff,
  },
});

export const accountKeyHistoryDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Read the key history",
  description: `The key history blob the account’s last key change stored, sealed by the devices under a key from the current account key; the server can’t read it. Needs a live session. Not logged.

${readTier}`,
  security: [{ bearerAuth: [] }],
  responses: {
    200: jsonResponse(
      "The key history.",
      z.object({
        ok: z.literal(true),
        keyEpoch: z
          .number()
          .int()
          .meta({ description: "The account’s key epoch." }),
        history: z.string().nullable().meta({
          description:
            "The sealed blob, or `null` for an account whose key never changed.",
        }),
      }),
    ),
    401: errorResponse(
      `Missing, expired, or invalid token (\`WWW-Authenticate: Bearer error="invalid_token"\`). ${ENDED_SESSION}`,
      ["unauthorized"],
    ),
    429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
    ...internal,
    503: errorResponse("Accounts are off on this worker.", ["disabled"]),
  },
});

export const sessionRefreshDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Refresh a session",
  description: `Plain JSON, no envelope: a new access token and a new refresh token, which replaces this one. Sending the refresh token just replaced again within 60 seconds (a lost response, or two refreshes at once) gets a new access token and the same new refresh token; sending it later, or any older one, ends the session. An ended or expired session is \`unauthorized\`: open a new one, attesting again, without asking the User.

A \`POST\` on the \`sessions\` collection rather than the session itself, since the refresh token, not an id in the URL, names the session.

${readTier}`,
  requestBody: jsonBody(
    z.object({
      refreshToken: refreshTokenSchema("The session’s current refresh token"),
      appVersion: z.string().optional().meta({
        description:
          "The app version, `major.minor.patch`, at most 32 characters; the session keeps the latest.",
      }),
      capabilities: z.array(z.string()).optional().meta({
        description:
          "Like the open’s `capabilities`; when sent, replaces the session’s.",
      }),
    }),
  ),
  responses: {
    200: jsonResponse(
      "New tokens.",
      z.object({ ok: z.literal(true), ...tokenPair }),
    ),
    400: errorResponse("Malformed JSON, or no `refreshToken`.", [
      "bad_request",
    ]),
    401: errorResponse(
      "Malformed, not issued by this worker (its MAC doesn’t verify), unknown, replaced, ended, or expired: open a new session. A replaced token presented after its minute, or any older one, also ends the session; one this worker didn’t issue never does. `reason` says why: `revoked` (signed out, by another device or itself), `replaced` (a cap ended it), `expired`, `reused` (a replaced refresh token came back), `key_changed` (the account key changed on another session while this one was live, with `changedAt`; one signed out before the change stays `revoked`, one already expired `expired`), or `unknown`.",
      ["unauthorized"],
      apiErrorSchema
        .extend({
          reason: z.enum([...REFRESH_REFUSALS]).meta({
            description: "Why the refresh was refused.",
          }),
          changedAt: epochMs(
            "With `key_changed`: when the account key changed",
          ).optional(),
        })
        .meta({ id: "RefreshRefusedError" }),
    ),
    429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
    ...internal,
    ...sessionsOff,
  },
});

export const sessionCloseDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Close the current session",
  description: `Ends the access token’s own session (\`current\`; there’s no other session id in a URL): its refresh token stops working at once, and the access token within 15 minutes. Idempotent. No body. The app calls it on sign out, before replacing the account key, and before Delete Buddies.

${readTier}`,
  security: [{ bearerAuth: [] }],
  responses: {
    200: okOnly,
    401: errorResponse("Missing, expired, or invalid token.", ["unauthorized"]),
    429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
    ...internal,
    ...sessionsOff,
  },
});

// --- Activity and devices (witness-work ADR 0028) ----------------------------

const liveSessionErrors = {
  401: errorResponse(
    `Missing, expired, or invalid token (\`WWW-Authenticate: Bearer error="invalid_token"\`; refresh once and retry). ${ENDED_SESSION}`,
    ["unauthorized"],
  ),
  429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
  ...internal,
  ...sessionsOff,
};

const bearerReadErrors = {
  401: errorResponse(
    'Missing, expired, or invalid token (`WWW-Authenticate: Bearer error="invalid_token"`; refresh once and retry).',
    ["unauthorized"],
  ),
  429: errorResponse("Over the per-caller rate.", ["rate_limited"]),
  ...internal,
  ...sessionsOff,
};

const sessionPlatform = z.enum(SESSION_PLATFORMS).meta({
  description:
    "What attested the session (`ios`, `android`; `dev` is the development bypass), or `web` for a browser’s session opened with a ticket.",
});
const sealedDevice = b64u(
  "The session’s sealed device label, exactly as `POST /accounts/v1/sessions` received it. Only the account’s devices can open it (see that route)",
);

const liveSessionSchema = z.object({
  sessionId: buddiesId("The session (the access token’s `sid`)"),
  platform: sessionPlatform,
  device: sealedDevice.optional(),
  current: z.boolean().meta({
    description: "`true` for the session the request’s token belongs to.",
  }),
  createdAt: epochMs("When it opened"),
  lastActiveAt: epochMs(
    "Its last refresh, or when it opened; accurate to about 15 minutes",
  ),
  expiresAt: epochMs(
    "When it ends: 90 days after it opened for phones; for `web`, 180 days after its last refresh (sliding)",
  ),
  method: z.enum(SESSION_METHODS).meta({
    description:
      "How it opened: `attestation`, `dev`, or for `web` the ticket’s kind (`passkey`, `approval`, `recovery`) or `signup`.",
  }),
  appVersion: z.string().optional().meta({
    description:
      "The app version it last opened or refreshed with; absent when unknown.",
  }),
});

export const sessionListDocs = describeRoute({
  tags: ["Accounts"],
  summary: "List your devices",
  description: `The token’s account’s live sessions (not ended, not expired), newest first: one per signed-in device. Settings → Account → Devices shows them, opening each sealed label on the device.

It also answers the server’s \`now\` and \`stepUpUntil\`, so a browser can tell whether a sensitive action still needs a step-up (\`step_up_required\`) by the server’s clock, not its own. \`stepUpUntil\` is null when no step-up counts on the session, as on phones, which never need one.

Works for a suspended account. ${readTier}`,
  security: [{ bearerAuth: [] }],
  responses: {
    200: jsonResponse(
      "The live sessions.",
      z.object({
        ok: z.literal(true),
        sessions: z.array(liveSessionSchema),
        now: epochMs("The server’s clock when it answered"),
        stepUpUntil: epochMs(
          "When the token’s session stops counting as stepped up: 5 minutes after its last passkey step-up, where opening a web session counts as one. Earlier than `now` once it has passed",
        ).nullable(),
      }),
    ),
    ...liveSessionErrors,
  },
});

export const sessionRevokeDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Sign out a device",
  description: `Ends one of the token’s account’s sessions and logs \`session.revoked\` in its activity, naming the calling session. Its refresh token stops working at once and its access token within 15 minutes. The token’s own session is ended like \`DELETE /sessions/current\` (\`session.signed_out\`). An already ended session is \`ok\`. A session a phone renewed leads to the session that renewed it (\`session.renewed\`, through any later renewals): that live one is signed out, so a device list read before a renewal still signs the device out (or the caller itself, when it was the caller’s own).

This doesn’t take the account key away: a device that still has it opens a new session when it next needs one, which shows up as a new \`session.opened\`.

A device that was signed out can’t sign out another in return, even while its access token lasts: its token is \`unauthorized\` here at once, and of two devices signing each other out at the same moment only the first succeeds.

A \`POST\` with the id in the body rather than \`DELETE /sessions/{sessionId}\`: session ids stay out of URLs, which Cloudflare and Sentry record. Bearer token only, with no step-up signature: signing a device out loses nothing it can’t get back by opening a session.

Works for a suspended account. ${readTier}`,
  security: [{ bearerAuth: [] }],
  requestBody: jsonBody(
    z.object({ sessionId: buddiesId("The session to end") }),
  ),
  responses: {
    200: okOnly,
    400: errorResponse("Missing or malformed `sessionId`.", ["bad_request"]),
    404: errorResponse("The account has no such session.", ["not_found"]),
    ...liveSessionErrors,
  },
});

const activitySessionSchema = z.object({
  sessionId: buddiesId("The session"),
  platform: sessionPlatform.optional(),
  device: sealedDevice.optional(),
});

const activityEntrySchema = z
  .object({
    id: z.string().meta({
      description:
        "Opaque, stable, and unique within the account (48 base64url characters today; don’t parse it or rely on its length); pass the last one’s as `before` (`nextCursor` does). Sealed for the account, so it says nothing about other accounts and works as a cursor only for this one.",
    }),
    kind: z.enum(ACTIVITY_KINDS).meta({
      description:
        "What happened (table above). The server adds kinds over time; skip one you don’t know.",
    }),
    createdAt: epochMs("When it happened"),
    session: activitySessionSchema.optional().meta({
      description:
        "The session the entry is about, or that did it. Absent for account-level entries and calls made before sessions.",
    }),
    actor: activitySessionSchema.optional().meta({
      description:
        "`session.revoked` and `session.replaced`: the session that ended `session`. `session.renewed`: the session `session` replaced. An `approval` `session.opened`: the phone’s session that approved it.",
    }),
    method: z.enum(SESSION_METHODS).optional().meta({
      description:
        "`session.opened` and `session.renewed`: how it opened (`attestation`, `dev`, `passkey`, `approval`, `recovery`, `signup`). Absent on entries from before passkeys.",
    }),
    credentialId: z.string().optional().meta({
      description:
        "`passkey.added` and `passkey.removed`: the credential (base64url).",
    }),
    slotId: buddiesId(
      "`backup.deleted` (absent when every slot was deleted) and `backup.downloaded`: the backup slot",
    ).optional(),
  })
  .meta({ id: "AccountActivityEntry" });

export const activityListDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Read your account activity",
  description: `The token’s account’s security history, newest first: high-level, security-relevant actions only, written by the server (never by a client). Kept 400 days. No IP address, location, user agent, or content.

| \`kind\` | When | \`session\` | \`actor\` |
| --- | --- | --- | --- |
| \`account.created\` | The account was created | — | — |
| \`session.opened\` | A device signed in (\`method\` says how) | The new session | \`approval\`: the phone’s session that approved it |
| \`session.renewed\` | A phone renewed its session before it ran out (\`method\` says how it attested); not a new sign-in | The new session | The one it replaced |
| \`session.signed_out\` | A device ended its own session | It | — |
| \`session.revoked\` | Another device signed it out | The one signed out | The one that did it |
| \`session.replaced\` | An eleventh phone session ended the oldest, or a fourth web session the least recently active | The ended one | The new one |
| \`session.refresh_reused\` | A replaced refresh token came back after its grace minute (possibly stolen); the session ended | It | — |
| \`handoff.sent\` | The account key was sent to a new phone | The old phone’s | — |
| \`backup.deleted\` | A backup slot, or every slot, was deleted | The deleting one | — |
| \`backup.downloaded\` | A backup slot was downloaded (once per slot, session, and day) | The downloading one | — |
| \`account.suspended\` | The account was suspended | — | — |
| \`account.reinstated\` | The account was reinstated | — | — |
| \`buddies.inbox_linked\` | A Buddies inbox was linked to the account | The linking one | — |
| \`buddies.deleted\` | The account's Buddies inbox was deleted (Delete My Buddies Data) | The deleting one | — |
| \`passkey.added\` | A passkey was added (\`credentialId\`) | The adding one (the new one, at web sign-up) | — |
| \`passkey.removed\` | A passkey was removed (\`credentialId\`) | The removing one | — |
| \`device.approved\` | A phone approved a browser’s sign-in | The phone’s | — |

\`session\` is absent on handoff, backup, and Buddies entries made with an envelope before sessions. Buddies entries never name a buddy or another account's inbox: only the owner's own link and deletion are logged, never writer ops.

Works for a suspended account. ${readTier}`,
  security: [{ bearerAuth: [] }],
  parameters: [
    {
      name: "limit",
      in: "query" as const,
      required: false,
      schema: { type: "integer" as const, minimum: 1, maximum: 100 },
      description: "Entries per page, 1–100; 50 when absent.",
    },
    {
      name: "before",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const },
      description:
        "The previous page’s `nextCursor` (or any entry’s `id`): only entries older than it. Absent for the newest page. A cursor from another account, or a made-up one, is 400.",
    },
  ],
  responses: {
    200: jsonResponse(
      "One page of entries.",
      z.object({
        ok: z.literal(true),
        activity: z.array(activityEntrySchema),
        nextCursor: z.string().nullable().meta({
          description:
            "The next (older) page’s `before`; `null` on the last page.",
        }),
      }),
    ),
    400: errorResponse(
      "A malformed `limit`, or a `before` that isn’t one of this account’s cursors.",
      ["bad_request"],
    ),
    ...liveSessionErrors,
  },
});

// --- Supporter status (witness-work ADR 0029) ------------------------------

const supporterExpiresAt = z.number().int().nullable().meta({
  description:
    "When the account’s Supporter status ends, epoch milliseconds: the latest end over every linked customer. `null` for no end (a lifetime grant), and when not a Supporter.",
});

const supporterFields = {
  ok: z.literal(true),
  supporter: z.boolean().meta({
    description:
      "Whether the account is a Supporter: any customer it links has an active subscription or a `Lifetime Supporter` grant (ADR 0014; Tips never count).",
  }),
  expiresAt: supporterExpiresAt,
};

const revenueCatUnavailable = {
  503: errorResponse(
    "Accounts are off on this worker (`disabled`), or RevenueCat couldn’t be read (`unavailable`, with `Retry-After`); nothing changed.",
    ["disabled", "unavailable"],
  ),
};

export const supporterLinkDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Link your RevenueCat customer",
  description: `Links the RevenueCat customer the app is logged in as to the token’s account, so the server answers Supporter status from the account (Notes Import, route planning). The server reads the customer from RevenueCat’s REST API with its secret key and stores what RevenueCat says; it never takes status from the request. Answers the account’s status afterwards, over every customer it links.

- A customer RevenueCat has never seen isn’t linked; the answer is the account’s status without it.
- Idempotent. Repeating a link refreshes it and reads RevenueCat again, so it doubles as “check my status now” (after a purchase or a restore).
- An account keeps at most 5 customers and a customer at most 5 accounts; a new link past either replaces the least recently linked.
- When an account changes its key, each customer it linked first (no other account linked it as early) is locked to it for 90 days: another account can’t link it (by any of the customer’s app user ids) unless it still links that customer. 409 \`conflict\` with \`reason: "customer_locked"\`.

The app user id is the RevenueCat SDK’s capability for that customer: send only the one the app is logged in as. It travels in the body, never the URL.

Works for a suspended account. ${readTier} Each link also reads RevenueCat, so it counts against the Buddies register tier per account too (60 a minute).`,
  security: [{ bearerAuth: [] }],
  requestBody: jsonBody(
    z.object({
      appUserId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{8,64}$/)
        .meta({
          description:
            "The RevenueCat app user id the app is logged in as (`Purchases.getAppUserID()`): ADR 0011’s shared id or the install id. 8 to 64 of `A-Z a-z 0-9 _ -`; RevenueCat’s anonymous ids never match.",
        }),
    }),
  ),
  responses: {
    200: jsonResponse(
      "The account’s Supporter status after linking.",
      z.object(supporterFields),
    ),
    400: errorResponse("Missing or malformed `appUserId`.", ["bad_request"]),
    409: errorResponse(
      'Another account changed its key in the last 90 days and the customer is locked to it (`reason: "customer_locked"`); nothing was linked.',
      ["conflict"],
      apiErrorSchema.extend({ reason: z.literal("customer_locked") }),
    ),
    ...bearerReadErrors,
    ...revenueCatUnavailable,
  },
});

export const supporterStatusDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Read your Supporter status",
  description: `The token’s account’s Supporter status from the server’s record, which RevenueCat’s webhook keeps current. A customer record more than a day old, or a Supporter whose end has passed since it was read (a renewal, or a lapse), is read from RevenueCat again first. For the app’s developer tools.

Works for a suspended account. ${readTier}`,
  security: [{ bearerAuth: [] }],
  responses: {
    200: jsonResponse(
      "The account’s Supporter status.",
      z.object({
        ...supporterFields,
        customers: z.number().int().meta({
          description: "How many RevenueCat customers the account links.",
        }),
      }),
    ),
    ...bearerReadErrors,
    ...revenueCatUnavailable,
  },
});

export const revenueCatWebhookDocs = describeRoute({
  tags: ["Webhooks"],
  summary: "RevenueCat webhook",
  description: `Called by RevenueCat’s servers when a customer’s purchases change; not for clients. Authenticated by the Authorization header set on the RevenueCat integration (\`Bearer <REVENUECAT_WEBHOOK_AUTHORIZATION>\`), compared in constant time.

The body is RevenueCat’s event (\`{ api_version, event }\`), read only for \`event.id\` and the customers it names (\`app_user_id\`, \`original_app_user_id\`, \`aliases\`, and a \`TRANSFER\`’s \`transferred_from\` and \`transferred_to\`). Each customer some account links is read again from RevenueCat’s REST API, the authority, so event order and type don’t matter. Customers nobody linked are ignored and never stored. A repeated \`event.id\` is answered 200 without reading anything.

Any answer but 200 makes RevenueCat retry (five times over about 80 minutes).`,
  security: [{ revenueCatWebhook: [] }],
  requestBody: jsonBody(
    z
      .object({
        api_version: z.string().optional(),
        event: z
          .object({
            id: z.string().meta({ description: "The event id; deduplicated." }),
            type: z.string().optional(),
            app_user_id: z.string().optional(),
            original_app_user_id: z.string().optional(),
            aliases: z.array(z.string()).optional(),
            transferred_from: z.array(z.string()).optional(),
            transferred_to: z.array(z.string()).optional(),
          })
          .passthrough(),
      })
      .meta({
        description: "RevenueCat’s webhook event; other fields are ignored.",
      }),
  ),
  responses: {
    200: jsonResponse(
      "Handled.",
      z.object({
        ok: z.literal(true),
        customers: z.number().int().meta({
          description: "How many linked customers were read again.",
        }),
        duplicate: z.literal(true).optional().meta({
          description: "The event id was already handled.",
        }),
      }),
    ),
    400: errorResponse("No event or event id.", ["bad_request"]),
    401: errorResponse("Missing or wrong Authorization header.", [
      "unauthorized",
    ]),
    500: errorResponse("Unexpected failure; RevenueCat retries.", ["internal"]),
    503: errorResponse(
      "No webhook secret or accounts database on this worker (`disabled`), or RevenueCat couldn’t be read (`unavailable`); RevenueCat retries.",
      ["disabled", "unavailable"],
    ),
  },
});

// --- Cloud Sync --------------------------------------------------------------

const syncSlotId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/)
  .meta({
    description:
      "The device’s sync id, 8 to 64 characters of `A-Z a-z 0-9 _ -`: the `<deviceId>` in its `witness-work-<deviceId>.json`.",
  });
const syncEtag = b64u(
  "The slot’s ETag: `SHA-256` of its blob, 32 bytes. Sent quoted in `ETag` headers",
);
const syncSeq = z.number().int().min(0).meta({
  description:
    "The account’s change counter: every put and delete advances it. Only grows.",
});
const syncOff = {
  503: errorResponse(
    "Cloud Sync is off (kill switch KV `sync:enabled`, or no sync bucket or accounts database: `disabled`, with `Retry-After`), or RevenueCat couldn’t be read to check the account’s Supporter status (`unavailable`, with `Retry-After`).",
    ["disabled", "unavailable"],
  ),
};
const syncUnentitled = {
  403: errorResponse(
    "The account isn’t a Supporter, and Cloud Sync is a Supporter benefit for this session: KV `sync:entitlement` is `supporter`, or the session never sent the `sync-everyone` capability.",
    ["supporter_required"],
  ),
};
const syncRequestedAt = z.number().int().nullable().meta({
  description:
    "When the standing Cloud Sync request was made (the server’s clock, epoch milliseconds); `null` with none.",
});
const syncNotes =
  "A suspended account keeps syncing. A slot not written for 30 days whose writer’s session has ended, or not written for 400 days, is deleted.";
const SYNC_ENTITLED =
  "Needs Cloud Sync on (KV `sync:enabled`) and an entitled account: everyone (witness-work ADR 0040) on a session that sent the `sync-everyone` capability, unless KV `sync:entitlement` is `supporter`; otherwise Supporters only (the account’s own status, ADR 0029).";
const syncBinary = (description: string) => ({
  description,
  content: {
    "application/octet-stream": {
      schema: { type: "string" as const, format: "binary" },
    },
  },
});

export const syncStatusDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Read your Cloud Sync status",
  description: `Whether the token’s account gets Cloud Sync (witness-work ADR 0030): end-to-end encrypted sync of every device’s data through this server, across iPhone and Android. Works while Cloud Sync is off. A RevenueCat failure answers \`supporter: false\` with \`supporterCheckFailed: true\`, never a 5xx.

${readTier}`,
  security: [{ bearerAuth: [] }],
  responses: {
    200: jsonResponse(
      "The account’s Cloud Sync status.",
      z.object({
        ok: z.literal(true),
        enabled: z.boolean().meta({
          description:
            "The kill switch (KV `sync:enabled`, then the `SYNC_ENABLED` var).",
        }),
        entitled: z.boolean().meta({
          description:
            "Whether puts, reads, and the live socket would be served: enabled, and `everyone` or a Supporter.",
        }),
        entitlement: z.enum(["supporter", "everyone"]).meta({
          description:
            "Who gets it on this session (KV `sync:entitlement`, then the `SYNC_ENTITLEMENT` var, else `everyone`; `supporter` for a session that never sent the `sync-everyone` capability).",
        }),
        supporter: z.boolean().meta({
          description: "The account’s own Supporter status (ADR 0029).",
        }),
        supporterCheckFailed: z.literal(true).optional().meta({
          description:
            "RevenueCat couldn’t be read; `supporter` is false for now. Absent otherwise.",
        }),
        requestedAt: syncRequestedAt,
        photos: z.boolean().meta({
          description:
            "Whether photo puts are on (KV `sync:photos`, then the `SYNC_PHOTOS` var, else on) and this worker has the photo bucket.",
        }),
        changes: z.boolean().meta({
          description:
            "Whether devices send record changes (witness-work ADR 0060; KV `sync:changes`, then the `SYNC_CHANGES` var, else off). False: publish whole snapshots.",
        }),
      }),
    ),
    ...bearerReadErrors,
  },
});

export const syncSwitchRequestDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Ask the account’s phones to turn on Cloud Sync",
  description: `\`{ "requested": true, "payload", "signature" }\` records that a browser asked the account’s phones to switch to Cloud Sync (witness-work ADR 0040 §5); phones read \`requestedAt\` in \`GET /accounts/v1/sync\` and switch. Setting is a bearer request **and** a signed envelope: \`signature\` is the account key’s signature over \`ww-account/v1\\nsync/request\\n\` followed by the decoded \`payload\` bytes (\`accountPub\`, \`ts\`, \`nonce\`), and the key must be the token’s own account (\`forbidden\` otherwise), so a leaked token alone can’t move the User’s phones. It needs Cloud Sync on and an entitled account. Each envelope is good once (409 \`replay\` for a reused nonce), so a captured one can’t ask again after a withdrawal. Asking again while it stands keeps \`requestedAt\` and restarts its 30 days.

\`{ "requested": false }\` withdraws it: bearer only, always works, idempotent.

It clears itself once every live phone session of the account (\`ios\`, \`android\` or \`dev\`) has written a slot since \`requestedAt\`, or 30 days after it was last asked for. Phones never clear it. Not in the activity log.

${readTier}`,
  security: [{ bearerAuth: [] }],
  requestBody: jsonBody(
    z.object({
      requested: z
        .boolean()
        .meta({
          description: "`true` sets the request, `false` withdraws it.",
        }),
      payload: z.string().optional().meta({
        description:
          "With `requested: true`: base64url of the JSON `{ accountPub, ts, nonce }` (`ts` within 5 minutes of the server’s clock).",
      }),
      signature: z.string().optional().meta({
        description:
          "With `requested: true`: the account key’s Ed25519 signature, base64url.",
      }),
    }),
    "Set (signed) or withdraw.",
  ),
  responses: {
    200: jsonResponse(
      "The request as it stands now.",
      z.object({ ok: z.literal(true), requestedAt: syncRequestedAt }),
    ),
    400: errorResponse(
      "Malformed JSON, `requested` isn’t a boolean, or setting without a valid envelope.",
      ["bad_request"],
    ),
    401: errorResponse(
      "No valid bearer token (`unauthorized`), or the envelope’s signature doesn’t verify (`bad_signature`) or its `ts` is too far off (`stale`).",
      ["unauthorized", "bad_signature", "stale"],
    ),
    403: errorResponse(
      "The envelope is signed by another account than the token’s (`forbidden`), or the account isn’t a Supporter while Cloud Sync is a Supporter benefit for this session (`supporter_required`).",
      ["forbidden", "supporter_required"],
    ),
    404: errorResponse("No account has the envelope’s key.", [
      "unknown_account",
    ]),
    409: errorResponse("This envelope was already used; sign a new one.", [
      "replay",
    ]),
    429: bearerReadErrors[429],
    ...internal,
    ...syncOff,
  },
});

export const syncPutDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Upload this device’s sync snapshot",
  description: `Replaces this device’s slot with its end-to-end encrypted snapshot (\`0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305\` under the account’s sync key; the server never sees plaintext). The body is the raw blob, at most 20 MiB, with the slot in \`x-ww-slot-id\`, \`b64u(SHA-256(body))\` in \`x-ww-sha256\` (the slot’s new ETag), and its length in \`Content-Length\`. After it lands, every other live socket of the account gets \`{"type":"changed","seq":…}\`.

\`If-Match: "<etag>"\` puts only while the slot still holds that ETag, and \`If-Match: *\` only while the slot exists (412 \`precondition_failed\` otherwise). Without it the put replaces whatever is there.

**Re-sealing** (\`x-ww-reseal: 1\`): after a key change, a device re-seals every slot, other devices’ too, under the new key. The slot keeps the session and platform that wrote it and its \`updatedAt\`, so retention and the Cloud Sync request see no new write. It needs \`If-Match: "<etag>"\` with the strong ETag the device read (400 \`bad_request\` without one or with a weak \`W/"…"\` one, and 412 when the slot changed since, so a re-seal never overwrites newer bytes), the slot must exist, and it’s allowed only within 7 days of the account’s last key change (403 \`forbidden\`).

**The base and its changes** (witness-work ADR 0060): the snapshot is the slot’s base, and \`sync/changes/put\` adds changes on top. \`x-ww-covers-sequence: N\` says the snapshot includes this slot’s changes up to sequence \`N\`: they’re deleted, \`N\` becomes the slot’s \`floorSequence\`, and devices whose cursor is past it don’t read the base. A put without the header replaces everything: the slot’s changes are all deleted and its floor is the put’s own \`seq\`, so every device reads it. An app from before record changes always puts this way. A re-seal keeps the slot’s changes and floor, and can’t send the header.

Needs a live session: ${ENDED_SESSION}

${SYNC_ENTITLED}

Limits: 20 MiB a blob, 20 slots an account (new slots only), one put a slot every 2 seconds (and one at a time), 1,000 puts and 2 GiB an account a rolling day, and the Buddies write tier (600 a minute per caller IP). ${syncNotes}

${ID_IN_BODY}`,
  security: [{ bearerAuth: [] }],
  parameters: [
    {
      name: "x-ww-slot-id",
      in: "header" as const,
      required: true,
      schema: { type: "string" as const },
      description: "This device’s slot (its sync id).",
    },
    {
      name: "x-ww-sha256",
      in: "header" as const,
      required: true,
      schema: { type: "string" as const },
      description: "`SHA-256(body)`, 32 bytes, base64url.",
    },
    {
      name: "Content-Length",
      in: "header" as const,
      required: true,
      schema: { type: "integer" as const },
      description: "The body’s length, at most 20 MiB.",
    },
    {
      name: "If-Match",
      in: "header" as const,
      required: false,
      schema: { type: "string" as const },
      description: '`"<etag>"` or `*`; see above.',
    },
    {
      name: "x-ww-reseal",
      in: "header" as const,
      required: false,
      schema: { type: "string" as const, enum: ["1"] },
      description:
        "`1` to re-seal an existing slot after a key change, with a strong quoted-ETag `If-Match`; see above. Any other value is `bad_request`.",
    },
    {
      name: "x-ww-covers-sequence",
      in: "header" as const,
      required: false,
      schema: { type: "integer" as const },
      description:
        "The sequence of this slot’s last change the snapshot includes; see above. Not with `x-ww-reseal`.",
    },
  ],
  requestBody: { required: true, ...syncBinary("The encrypted snapshot.") },
  responses: {
    200: jsonResponse(
      "Stored. Also sent as `ETag`.",
      z.object({
        ok: z.literal(true),
        etag: syncEtag,
        size: z.number().int().meta({ description: "Bytes." }),
        updatedAt: epochMs("When the slot was written, the server’s clock"),
        seq: syncSeq,
        floorSequence: z.number().int().min(0).meta({
          description:
            "The slot’s floor now: a device whose cursor is behind it reads this base.",
        }),
      }),
    ),
    400: errorResponse(
      "A missing or malformed header, or a body that doesn’t match its length or `SHA-256`.",
      ["bad_request"],
    ),
    401: bearerReadErrors[401],
    403: errorResponse(
      "Cloud Sync was made a Supporter benefit again (KV `sync:entitlement` is `supporter`) and the account isn’t one (`supporter_required`), or a re-seal came more than 7 days after the account’s last key change (`forbidden`).",
      ["supporter_required", "forbidden"],
    ),
    409: errorResponse(
      "The slot was deleted while this put was uploading; nothing was stored.",
      ["conflict"],
    ),
    412: errorResponse(
      "`If-Match` didn’t match the slot, or a re-seal named a slot that doesn’t exist.",
      ["precondition_failed"],
    ),
    413: errorResponse("Over 20 MiB, refused from `Content-Length`.", [
      "too_large",
    ]),
    429: errorResponse(
      "Over a limit: the account’s slot cap (`limit`), or a rate (`rate_limited`, with `Retry-After`).",
      ["limit", "rate_limited"],
    ),
    ...internal,
    ...syncOff,
  },
});

export const syncListDocs = describeRoute({
  tags: ["Accounts"],
  summary: "List the account’s sync slots",
  description: `Every slot’s ETag, size, last write, the platform of the session that wrote it and whether that session is live, and the account’s \`seq\`. A pull downloads only slots whose ETag changed since its last read. Send \`{}\`.

An app that reads record changes (witness-work ADR 0060) sends \`x-ww-sync-changes: 1\`. A list without it is a session that reads only snapshots: \`snapshotReaders\` is true for 14 days after, or until that session reads changes or ends, and devices that send changes also keep their base current.

${SYNC_ENTITLED}

${readTier}

${ID_IN_BODY}`,
  security: [{ bearerAuth: [] }],
  requestBody: jsonBody(z.object({}), "An empty JSON object."),
  responses: {
    200: jsonResponse(
      "The account’s slots.",
      z.object({
        ok: z.literal(true),
        seq: syncSeq,
        slots: z.array(
          z.object({
            slotId: syncSlotId,
            etag: syncEtag,
            size: z.number().int().meta({ description: "Bytes." }),
            updatedAt: epochMs(
              "When the slot was last written, the server’s clock",
            ),
            platform: z.enum(["ios", "android", "dev", "web"]).nullable().meta({
              description:
                "The platform of the session that last wrote the slot; `null` for a slot put before it was kept whose session is gone.",
            }),
            live: z.boolean().meta({
              description:
                "Whether that session is still live (`true` when the sessions couldn’t be read).",
            }),
          }),
        ),
      }),
    ),
    401: bearerReadErrors[401],
    ...syncUnentitled,
    429: bearerReadErrors[429],
    ...internal,
    ...syncOff,
  },
});

export const syncGetDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Download a sync slot",
  description: `One slot’s bytes exactly as put.

${SYNC_ENTITLED}

${readTier}

${ID_IN_BODY}`,
  security: [{ bearerAuth: [] }],
  requestBody: jsonBody(z.object({ slotId: syncSlotId }), "The slot to read."),
  responses: {
    200: {
      ...syncBinary("The encrypted snapshot."),
      headers: {
        ETag: {
          description: "The slot’s ETag, quoted.",
          schema: { type: "string" as const },
        },
        "x-ww-updated-at": {
          description:
            "When the slot was written (epoch ms, the server’s clock).",
          schema: { type: "integer" as const },
        },
        "Cache-Control": {
          description: "`no-store`.",
          schema: { type: "string" as const },
        },
      },
    },
    400: errorResponse("Malformed JSON or `slotId`.", ["bad_request"]),
    401: bearerReadErrors[401],
    ...syncUnentitled,
    404: errorResponse("The account has no such slot.", ["not_found"]),
    429: bearerReadErrors[429],
    ...internal,
    ...syncOff,
  },
});

export const syncDeleteDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Delete sync slots",
  description: `Deletes one slot, or every slot of the account when \`slotId\` is left out. Gone from storage at once; idempotent. Every live socket gets \`changed\`. A device deletes its own slot when it leaves Cloud Sync or the account, and every slot before Delete Buddies replaces the account key; another device’s only from its Devices list or a reset.

Works while Cloud Sync is off and for an account that isn’t entitled, so a device can always take its data off the server. Deleting every slot needs a live session: ${ENDED_SESSION}

${readTier}

${ID_IN_BODY}`,
  security: [{ bearerAuth: [] }],
  requestBody: jsonBody(
    z.object({ slotId: syncSlotId.optional() }),
    "One slot, or `{}` for every slot.",
  ),
  responses: {
    200: jsonResponse(
      "Deleted (or already gone).",
      z.object({ ok: z.literal(true), seq: syncSeq }),
    ),
    400: errorResponse("Malformed JSON or `slotId`.", ["bad_request"]),
    401: bearerReadErrors[401],
    429: bearerReadErrors[429],
    ...internal,
    503: errorResponse("No sync bucket or accounts database on this worker.", [
      "disabled",
    ]),
  },
});

const SYNC_CHANGES_ON =
  "Needs record changes on (KV `sync:changes`, then the `SYNC_CHANGES` var, else off): 503 `changes_disabled` otherwise, and the device publishes whole snapshots.";
const syncChangesOff = {
  503: errorResponse(
    "Cloud Sync is off (`disabled`), record changes are off (`changes_disabled`: publish whole snapshots), or RevenueCat couldn’t be read (`unavailable`).",
    ["disabled", "changes_disabled", "unavailable"],
  ),
};
const syncSequence = z.number().int().min(0).meta({
  description:
    "The account’s sequence (`seq` on the snapshot routes): every put, change, and delete takes the next one.",
});
const syncChangeId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{22}$/)
  .meta({
    description: "The change’s id: 16 random bytes the device made, base64url.",
  });
const syncChangeBlob = z.string().meta({
  description:
    "The sealed change, unpadded base64url: a whole number of 256-byte blocks, at most 256 KiB.",
});
const syncSnapshotReaders = z.boolean().meta({
  description:
    "A device that reads only snapshots listed the account in the last 14 days: also write the base (with `x-ww-covers-sequence`) a few seconds after a change.",
});
const syncChange = z.object({
  sequence: syncSequence,
  slotId: syncSlotId,
  changeId: syncChangeId,
  keyEpoch: z.number().int().min(0).meta({
    description:
      "The key epoch of the session that sealed it, or re-sealed it: which account key opens it.",
  }),
  createdAt: epochMs("When the change was put, the server’s clock"),
  blob: syncChangeBlob,
});
const syncChangeUnauthorized = errorResponse(
  'Missing, expired, or invalid token, or the token’s session ended; with `reason: "key_changed"`, the token is from before the account’s key change (refresh and retry).',
  ["unauthorized"],
);

export const syncChangePutDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Send one record change",
  description: `Stores one small sealed change in this device’s slot (witness-work ADR 0060): the records that changed, sealed like a snapshot under the account’s sync key (\`0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305\`, AAD \`ww-account/v1/sync-change\\n<accountId>\\n<slotId>\\n<changeId>\`), padded to a whole number of 256-byte blocks. The server sees the slot, the padded size, and the time. It takes the account’s next sequence, and every other socket of the account that reads changes gets it as \`{"type":"change","change":…}\`.

The slot needs a base first (\`sync/put\`; 409 \`no_slot\`). The same \`changeId\` again answers the first put’s sequence. A slot’s changes stay until the device folds them into its base: \`sync/put\` with \`x-ww-covers-sequence\`.

This route reads no database: the access token carries the session’s capabilities, and the account’s Durable Object refuses a session that ended and a token from before a key change. A notice of an ended session that was lost lets its last token add changes for at most 15 minutes. It can’t replace or delete anything.

${SYNC_ENTITLED}

${SYNC_CHANGES_ON}

Limits: 256 KiB a change, 200 changes and 1 MiB in a slot’s tail (409 \`tail_full\`: write the base, then send again), 60 changes a slot a minute and 3,000 an account a rolling day, and the Buddies write tier. ${syncNotes}

${ID_IN_BODY}`,
  security: [{ bearerAuth: [] }],
  requestBody: jsonBody(
    z.object({ slotId: syncSlotId, changeId: syncChangeId, blob: syncChangeBlob }),
    "The change.",
  ),
  responses: {
    200: jsonResponse(
      "Stored (or already stored under this `changeId`).",
      z.object({
        ok: z.literal(true),
        sequence: syncSequence,
        tailCount: z.number().int().meta({
          description: "Changes in the slot’s tail now.",
        }),
        tailBytes: z.number().int().meta({
          description: "Sealed bytes in the slot’s tail now.",
        }),
        snapshotReaders: syncSnapshotReaders,
        changedAt: epochMs(
          "The slot’s last base put or change, the server’s clock",
        ),
      }),
    ),
    400: errorResponse(
      "Malformed JSON, a bad `slotId` or `changeId`, or a `blob` that isn’t base64url of a whole number of 256-byte blocks.",
      ["bad_request"],
    ),
    401: syncChangeUnauthorized,
    ...syncUnentitled,
    409: errorResponse(
      "The slot has no base (`no_slot`), or its tail is full (`tail_full`).",
      ["no_slot", "tail_full"],
    ),
    413: errorResponse("Over 256 KiB.", ["too_large"]),
    429: errorResponse("Over a rate, with `Retry-After`.", ["rate_limited"]),
    ...internal,
    ...syncChangesOff,
  },
});

export const syncChangesListDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Catch up on record changes",
  description: `What this device missed since its cursor (witness-work ADR 0060 §4), in one read: every slot with its \`floorSequence\`, and the other slots’ changes after \`afterSequence\`, oldest first. A device reads a slot’s base (\`sync/get\`) only when \`floorSequence\` is past its cursor, or its cursor is 0. Once it merged everything, its cursor is \`sequence\`. With \`more\`, ask again from the last change’s sequence.

\`slotId\` is the device’s own slot: its changes are left out, and the slot is marked as seen (at most daily), which retention counts as a write. The answer also carries \`requestedAt\` and \`photos\` from \`GET /accounts/v1/sync\`, so a launch needn’t read that too.

The live socket answers the same on \`{"type":"sync","afterSequence":N}\`. No database is read, as on \`sync/changes/put\`.

${SYNC_ENTITLED}

${SYNC_CHANGES_ON}

${readTier}

${ID_IN_BODY}`,
  security: [{ bearerAuth: [] }],
  requestBody: jsonBody(
    z.object({
      slotId: syncSlotId,
      afterSequence: z.number().int().min(0).meta({
        description: "The device’s cursor; 0 for everything.",
      }),
    }),
    "The device’s slot and cursor.",
  ),
  responses: {
    200: jsonResponse(
      "What the device missed.",
      z.object({
        ok: z.literal(true),
        sequence: syncSequence,
        slots: z.array(
          z.object({
            slotId: syncSlotId,
            etag: syncEtag,
            size: z.number().int().meta({ description: "The base’s bytes." }),
            updatedAt: epochMs("When the base was last written"),
            platform: z.enum(["ios", "android", "dev", "web"]).nullable(),
            floorSequence: syncSequence.meta({
              description:
                "A device whose cursor is behind this reads the slot’s base: changes up to it are folded in, or the base replaced everything.",
            }),
            changedAt: epochMs("The slot’s last base put or change"),
          }),
        ),
        changes: z.array(syncChange),
        more: z.boolean().meta({
          description:
            "More changes follow: ask again with the last change’s `sequence`.",
        }),
        snapshotReaders: syncSnapshotReaders,
        requestedAt: syncRequestedAt,
        photos: z.boolean().meta({
          description: "Whether photo puts are on, as `GET /accounts/v1/sync` says.",
        }),
      }),
    ),
    400: errorResponse("Malformed JSON, or a bad `slotId` or `afterSequence`.", [
      "bad_request",
    ]),
    401: syncChangeUnauthorized,
    ...syncUnentitled,
    429: bearerReadErrors[429],
    ...internal,
    ...syncChangesOff,
  },
});

export const syncChangeResealDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Re-seal a record change after a key change",
  description: `Replaces one change’s bytes with the same change sealed under the new account key (ADR 0039, witness-work ADR 0060 §10), as \`x-ww-reseal\` does for a slot. Its sequence, slot, and time stay, its \`keyEpoch\` becomes the token’s, and no socket is told. Allowed only within 7 days of the account’s last key change (403 \`forbidden\`).

Needs a live session: ${ENDED_SESSION}

${SYNC_ENTITLED}

${SYNC_CHANGES_ON}

Counts against the Buddies write tier.

${ID_IN_BODY}`,
  security: [{ bearerAuth: [] }],
  requestBody: jsonBody(
    z.object({
      sequence: syncSequence,
      changeId: syncChangeId,
      blob: syncChangeBlob,
    }),
    "The change, and its bytes under the new key.",
  ),
  responses: {
    200: jsonResponse(
      "Re-sealed.",
      z.object({ ok: z.literal(true), sequence: syncSequence }),
    ),
    400: errorResponse("Malformed JSON, or a bad `sequence`, `changeId` or `blob`.", [
      "bad_request",
    ]),
    401: bearerReadErrors[401],
    403: errorResponse(
      "More than 7 days after the account’s last key change (`forbidden`), or the account isn’t entitled (`supporter_required`).",
      ["forbidden", "supporter_required"],
    ),
    404: errorResponse(
      "No such change: its device folded it into its base. Nothing to re-seal.",
      ["not_found"],
    ),
    413: errorResponse("Over 256 KiB.", ["too_large"]),
    429: bearerReadErrors[429],
    ...internal,
    ...syncChangesOff,
  },
});

export const syncLiveDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Cloud Sync live socket (WebSocket)",
  description: `Upgrades to a WebSocket that says *that* another device of the account changed its slot, so the app pulls at once while in the foreground. A socket that asks for a catch-up also gets the other devices’ record changes on it, sealed (witness-work ADR 0060); any other socket gets notices only.

Headers: \`Authorization: Bearer <access token>\`, \`Upgrade: websocket\`, and \`x-ww-slot-id\`, the device’s own slot, so its own puts don’t echo back.

**Browsers** can’t set headers on a WebSocket, so they mint a \`sync\` ticket for their slot with \`POST /accounts/v1/live/ticket\` and offer \`Sec-WebSocket-Protocol: ww.v1, ticket.<ticket>\` instead (any order; no \`Authorization\` or \`x-ww-slot-id\`; never the access token, which Cloudflare’s logs would record). Checked in this order: the \`Origin\` must be one of the web app’s (\`WEB_APP_ORIGINS\`), else \`403 forbidden\`; an offer without \`ww.v1\`, with a repeated or unknown entry, or that isn’t a list of tokens is \`400 bad_request\`; then the switch (\`503\`) and the read tier (\`429\`); a missing, forged, expired (30 s), or Buddies ticket is \`401 unauthorized\`; then the header path’s checks (entitlement, upgrade); and while a socket opened with the same ticket is open, another is \`409 conflict\`. The 101 answers \`Sec-WebSocket-Protocol: ww.v1\`. Page script can’t see these statuses (a refused handshake is only a close), so mint a fresh ticket for every connect, never reuse one, and reconnect with backoff. No id goes in the URL, and the ticket names its ids sealed.

**Server → app messages:**

- \`{"type":"hello","seq":N}\` right after the upgrade (as Buddies' inbox socket); pull when \`N\` differs from the last \`seq\` pulled.
- \`{"type":"changed","seq":N}\` after every put by another slot, and every delete.
- \`{"type":"change","change":{…}}\`: another slot’s record change, sealed, as \`sync/changes/list\` gives it. Only to a socket that asked for a catch-up.
- \`{"type":"sync",…}\`: the answer to a catch-up, the body of \`sync/changes/list\` without \`ok\`.
- \`{"type":"error","error":…}\`: a catch-up that wasn’t answered: \`changes_disabled\` (publish whole snapshots), \`unavailable\` (use \`sync/changes/list\`), or \`bad_request\`.

**App → server:** \`{"type":"sync","afterSequence":N}\` (witness-work ADR 0060 §6) asks for what the device missed since its cursor, and from then on the socket gets other slots’ changes as they’re put. Merge a \`change\` at once; move the cursor only when its \`sequence\` follows the cursor, else ask again. A launch with nothing new is this socket and nothing else.

**The socket is its session’s.** It closes with \`4006 "session_ended"\` when the session signs out, is signed out from another device, or is found ended. It gets changes only while its session was confirmed live in the last 15 minutes: the token that opened it counts until it expires, and after that the server checks the session before it sends, never while a writer waits.

**Keepalive:** send the text \`ping\` about every 25 s; the server answers \`pong\` without waking the account’s Durable Object. Anything else the app sends, but the \`sync\` request, is ignored.

**Close codes:** \`4000 "replaced"\`: a 21st socket opened and closed the oldest (at most 20 per account, browser sockets included). \`4004 "expired"\` (browser sockets only): the access token its ticket was minted with expired; refresh, mint a ticket, and reconnect. Header sockets outlive their token, so a browser session’s (\`web\`) token is refused there with \`403 forbidden\`. Reconnect with backoff while in the foreground.

${SYNC_ENTITLED} Turning Cloud Sync off refuses new sockets but doesn’t close open ones.

${readTier}`,
  security: [{ bearerAuth: [] }],
  parameters: [
    {
      name: "Upgrade",
      in: "header" as const,
      required: true,
      schema: { type: "string" as const, enum: ["websocket"] },
      description: "Must be `websocket`, else `426 upgrade_required`.",
    },
    {
      name: "x-ww-slot-id",
      in: "header" as const,
      required: true,
      schema: { type: "string" as const },
      description:
        "This device’s slot (its sync id). Browsers don’t send it: their ticket names the slot.",
    },
    {
      name: "Sec-WebSocket-Protocol",
      in: "header" as const,
      required: false,
      schema: { type: "string" as const },
      description:
        "Browsers only: `ww.v1, ticket.<ticket>` (a `sync` ticket from `POST /accounts/v1/live/ticket`), in place of `Authorization` and `x-ww-slot-id`. Needs an allowed `Origin`.",
    },
  ],
  responses: {
    101: {
      description:
        "Switching protocols: the socket is open. A browser upgrade gets `Sec-WebSocket-Protocol: ww.v1`.",
    },
    400: errorResponse(
      "Missing or malformed `x-ww-slot-id`, or a malformed `Sec-WebSocket-Protocol` offer (no `ww.v1`, a repeated or unknown entry, or with `Authorization` too).",
      ["bad_request"],
    ),
    401: errorResponse(
      'Missing, expired, or invalid token (`WWW-Authenticate: Bearer error="invalid_token"`; refresh once and retry), or a browser’s missing, forged, expired, or Buddies ticket (mint another).',
      ["unauthorized"],
    ),
    403: errorResponse(
      "Cloud Sync is a Supporter benefit and the account isn’t one (`supporter_required`), or a browser upgrade’s `Origin` isn’t one of the web app’s (`forbidden`).",
      ["supporter_required", "forbidden"],
    ),
    409: errorResponse(
      "Browsers only: a socket opened with this ticket is still open. Mint another; a copied ticket never opens a second socket.",
      ["conflict"],
    ),
    426: errorResponse("Not a WebSocket upgrade. No `Retry-After`.", [
      "upgrade_required",
    ]),
    429: bearerReadErrors[429],
    ...internal,
    ...syncOff,
  },
});

export const liveTicketDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Mint a browser live socket ticket",
  description: `A ticket a browser offers to open a live socket, in place of its access token: Cloudflare’s logs record \`Sec-WebSocket-Protocol\` in full, and redact only \`Authorization\`. Offer it as \`Sec-WebSocket-Protocol: ww.v1, ticket.<ticket>\` to \`GET /accounts/v1/sync/live\` (\`socket: "sync"\`, \`id\`: the browser’s own slot) or \`GET /buddies/v1/inbox/live\` (\`socket: "buddies"\`, \`id\`: its inbox), within 30 seconds; mint a new one for every connect.

The ticket is opaque to the app: its claims (the account, session, socket, id, and the access token’s expiry) are encrypted and MACed under the server’s own secret, so it names no id where it’s logged. It opens only that socket for that id, and calls no other route. The socket closes with \`4004 "expired"\` when the access token it was minted with expires. Not single-use, but one socket at a time: within its 30 seconds it reopens its socket after a drop, while a second socket on it is \`409 conflict\`.

Needs a live session: after the device signs out or is revoked, it’s \`401\` (a socket already open stays until its token expires). A token with less than a second left is \`401\` too: refresh it, then mint. Only the id’s shape is checked here; the socket runs every other check when it opens (Cloud Sync’s switch and entitlement, the inbox’s ownership, suspension).

A browser can’t see a refused handshake’s status (page script gets only a close), so mint a fresh ticket for every connect and reconnect with backoff; when this route answers \`401\`, refresh the access token first.

${readTier}`,
  security: [{ bearerAuth: [] }],
  requestBody: jsonBody(
    z.object({
      socket: z
        .enum(["sync", "buddies"])
        .meta({ description: "Which live socket." }),
      id: z.string().meta({
        description:
          "`sync`: the browser’s own slot id (as `x-ww-slot-id`). `buddies`: its inbox id.",
      }),
    }),
    "The socket and its id.",
  ),
  responses: {
    200: jsonResponse(
      "The ticket.",
      z.object({
        ok: z.literal(true),
        ticket: z.string().meta({
          description:
            "Opaque, 466 characters of `[A-Za-z0-9_.-]`. A credential: never log it.",
        }),
        expiresAt: epochMs(
          "When the ticket stops opening sockets: 30 s after minting, or the access token’s expiry if sooner",
        ),
      }),
    ),
    400: errorResponse(
      "Malformed JSON, an unknown `socket`, or an `id` of the wrong shape.",
      ["bad_request"],
    ),
    401: errorResponse(
      'Missing, expired, or invalid token, a session that was signed out or revoked, or a token with less than a second left (`WWW-Authenticate: Bearer error="invalid_token"`; refresh once and retry).',
      ["unauthorized"],
    ),
    429: bearerReadErrors[429],
    ...internal,
    503: errorResponse(
      "No usable `LIVE_TICKET_SECRET` (unset, shorter than 32 characters, or equal to `ACCOUNT_TOKEN_SECRET`), or no token secret on this worker.",
      ["disabled"],
    ),
  },
});

// --- Cloud Sync photos -------------------------------------------------------

const photoName = b64u(
  "The photo’s keyed name, `HMAC-SHA256(nameKey, filename)`, 32 bytes: immutable, a new revision is a new name",
);
const photoUsage = z
  .object({
    bytes: z
      .number()
      .int()
      .meta({ description: "The live photos’ total blob size." }),
    count: z.number().int().meta({ description: "How many live photos." }),
    limit: z.number().int().meta({
      description:
        "The account’s storage limit in bytes (2,000,000,000 unless `SYNC_PHOTO_LIMIT_BYTES` says otherwise).",
    }),
  })
  .meta({ description: "The account’s photo storage." });
const photoView = {
  name: photoName,
  size: z.number().int().meta({ description: "Bytes." }),
  sha256: syncEtag,
  createdAt: epochMs("When the photo became live, the server’s clock"),
};
const photoOff = (also: string, photosDisabled: string) => ({
  503: errorResponse(
    `${also}${photosDisabled ? ` ${photosDisabled}: \`photos_disabled\`, with \`Retry-After\`.` : ""} No accounts database: \`disabled\`.`,
    photosDisabled
      ? ["disabled", "photos_disabled", "unavailable"]
      : ["disabled", "unavailable"],
  ),
});
const PHOTOS_ENTITLED = SYNC_ENTITLED;
const photoSlotHeader = {
  name: "x-ww-slot-id",
  in: "header" as const,
  required: false,
  schema: { type: "string" as const },
  description:
    "This device’s slot: its own live socket isn’t told of the change.",
};
const photoNotes =
  "Photos are end-to-end encrypted (witness-work ADR 0040 §6, `docs/cloud-sync-photos.md`): the server sees blobs, sizes, digests, sealed metas, keyed names and times, and logs none of them. A suspended account keeps syncing its photos.";

export const syncPhotoPutDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Upload a Cloud Sync photo",
  description: `Stores a photo’s end-to-end encrypted blob once under its name. The body is the raw blob, at most 25 MiB, with \`x-ww-photo-name\`, \`b64u(SHA-256(body))\` in \`x-ww-sha256\`, the sealed filename in \`x-ww-photo-meta\` (base64url, at most 512 characters), and \`Content-Length\`. The server always reads the body to the end before it answers.

A live name answers \`existed: true\` with the stored photo, writes nothing, and adds no bytes (it still counts as a put). A name deleted within 30 days comes back with the new blob. A put that would take the live photos over the limit is 429 \`storage_full\` with \`usage\`, checked when the put starts (counting other uploads in flight, each held for its reservation: 2 minutes, longer for a large body) and again when it commits. A put whose name is deleted while it uploads is 409 \`conflict\`; on an account with no slot, 409 \`no_slot\`. A stored photo advances \`seq\` and sends \`changed\` to every live socket but \`x-ww-slot-id\`’s.

${SYNC_ENTITLED}

Limits: 25 MiB a blob, 20,000 live photos (new names only), one put a name at a time, 20,000 puts (stored or \`existed\`; refused ones don’t count) and 4 GiB stored an account a rolling day, and the Buddies photo-upload tier (60 a minute per caller IP). ${photoNotes}`,
  security: [{ bearerAuth: [] }],
  parameters: [
    {
      name: "x-ww-photo-name",
      in: "header" as const,
      required: true,
      schema: { type: "string" as const },
      description: "The photo’s name (43 base64url characters).",
    },
    {
      name: "x-ww-sha256",
      in: "header" as const,
      required: true,
      schema: { type: "string" as const },
      description: "`SHA-256(body)`, 32 bytes, base64url.",
    },
    {
      name: "x-ww-photo-meta",
      in: "header" as const,
      required: true,
      schema: { type: "string" as const },
      description:
        "The sealed filename, base64url, at most 512 characters; stored as given.",
    },
    {
      name: "Content-Length",
      in: "header" as const,
      required: true,
      schema: { type: "integer" as const },
      description: "The body’s length, at most 25 MiB.",
    },
    photoSlotHeader,
  ],
  requestBody: { required: true, ...syncBinary("The encrypted photo.") },
  responses: {
    200: jsonResponse(
      "Stored, or already there (`existed`).",
      z.object({
        ok: z.literal(true),
        ...photoView,
        existed: z
          .boolean()
          .meta({
            description: "The name was already live; nothing was written.",
          }),
        usage: photoUsage,
      }),
    ),
    400: errorResponse(
      "A missing or malformed header, or a body that doesn’t match its length or `SHA-256`.",
      ["bad_request"],
    ),
    401: bearerReadErrors[401],
    ...syncUnentitled,
    409: errorResponse(
      "The name was deleted while this put uploaded (`conflict`), or the account has no slot (`no_slot`); nothing was stored.",
      ["conflict", "no_slot"],
    ),
    413: errorResponse("Over 25 MiB, refused from `Content-Length`.", [
      "too_large",
    ]),
    429: errorResponse(
      "Storage full (`storage_full`, with `usage`, no `Retry-After`), the live photo cap (`limit`, no `Retry-After`), or a rate (`rate_limited`, with `Retry-After`).",
      ["storage_full", "limit", "rate_limited"],
    ),
    ...internal,
    ...photoOff(
      "Cloud Sync is off (`disabled`), or RevenueCat couldn’t be read (`unavailable`).",
      "No photo bucket on this worker, or the photos switch KV `sync:photos` is off",
    ),
  },
});

export const syncPhotoListDocs = describeRoute({
  tags: ["Accounts"],
  summary: "List the account’s Cloud Sync photos",
  description: `Live photos only, ordered by name, at most 1,000 a page, each with its sealed meta. Pass \`cursor\` back for the next page; it’s \`null\` on the last. Every page carries the current \`usage\`.

${PHOTOS_ENTITLED}

${readTier}`,
  security: [{ bearerAuth: [] }],
  requestBody: jsonBody(
    z.object({
      cursor: z
        .string()
        .nullable()
        .optional()
        .meta({ description: "The previous page’s `cursor`; opaque." }),
    }),
    "`{}` for the first page.",
  ),
  responses: {
    200: jsonResponse(
      "A page of live photos.",
      z.object({
        ok: z.literal(true),
        photos: z.array(
          z.object({
            ...photoView,
            meta: z
              .string()
              .meta({ description: "The sealed filename, as put." }),
          }),
        ),
        cursor: z
          .string()
          .nullable()
          .meta({
            description: "The next page’s cursor, or `null` on the last page.",
          }),
        usage: photoUsage,
      }),
    ),
    400: errorResponse("Malformed JSON or `cursor`.", ["bad_request"]),
    401: bearerReadErrors[401],
    ...syncUnentitled,
    429: bearerReadErrors[429],
    ...internal,
    ...photoOff(
      "Cloud Sync is off (`disabled`), or RevenueCat couldn’t be read (`unavailable`).",
      "",
    ),
  },
});

export const syncPhotoGetDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Download a Cloud Sync photo",
  description: `A live photo’s blob exactly as put. A deleted, purged or unknown name is \`not_found\`.

${PHOTOS_ENTITLED}

Limits: 50,000 gets an account a rolling day (\`rate_limited\`, with \`Retry-After\`), and the Buddies read tier (600 a minute per caller IP).`,
  security: [{ bearerAuth: [] }],
  requestBody: jsonBody(z.object({ name: photoName }), "The photo to read."),
  responses: {
    200: {
      ...syncBinary("The encrypted photo."),
      headers: {
        ETag: {
          description: "The photo’s `sha256`, quoted.",
          schema: { type: "string" as const },
        },
        "x-ww-created-at": {
          description:
            "When the photo became live (epoch ms, the server’s clock).",
          schema: { type: "integer" as const },
        },
        "Cache-Control": {
          description: "`no-store`.",
          schema: { type: "string" as const },
        },
      },
    },
    400: errorResponse("Malformed JSON or `name`.", ["bad_request"]),
    401: bearerReadErrors[401],
    ...syncUnentitled,
    404: errorResponse("No live photo by that name.", ["not_found"]),
    429: errorResponse("Over a rate (`rate_limited`, with `Retry-After`).", [
      "rate_limited",
    ]),
    ...internal,
    ...photoOff(
      "Cloud Sync is off (`disabled`), or RevenueCat couldn’t be read (`unavailable`).",
      "No photo bucket on this worker",
    ),
  },
});

export const syncPhotoDeleteDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Delete Cloud Sync photos",
  description: `\`{ names }\` (1 to 100) or \`{ all: true }\`. Idempotent: unknown and already deleted names are fine. A deleted photo stops counting at once and is no longer listed or served; its object is purged 30 days later. A delete that deleted something advances \`seq\` and sends \`changed\` to every live socket but \`x-ww-slot-id\`’s. A put of the same name in flight answers \`conflict\`.

Works while Cloud Sync is off and for an account that isn’t entitled. Deleting every photo needs a live session: ${ENDED_SESSION}

${readTier}`,
  security: [{ bearerAuth: [] }],
  parameters: [photoSlotHeader],
  requestBody: jsonBody(
    z.object({
      names: z.array(photoName).min(1).max(100).optional(),
      all: z.literal(true).optional(),
    }),
    "Either `names` or `all: true`.",
  ),
  responses: {
    200: jsonResponse(
      "Deleted (or already gone).",
      z.object({ ok: z.literal(true), usage: photoUsage }),
    ),
    400: errorResponse("Malformed JSON, `names`, or both fields.", [
      "bad_request",
    ]),
    401: bearerReadErrors[401],
    429: bearerReadErrors[429],
    ...internal,
    ...photoOff("", ""),
  },
});

export const syncPhotoUsageDocs = describeRoute({
  tags: ["Accounts"],
  summary: "Read the account’s Cloud Sync photo storage",
  description: `The live photos’ total size and number, and the account’s limit. Works while Cloud Sync is off and for an account that isn’t entitled.

${readTier}`,
  security: [{ bearerAuth: [] }],
  responses: {
    200: jsonResponse(
      "The usage.",
      z.object({ ok: z.literal(true), usage: photoUsage }),
    ),
    401: bearerReadErrors[401],
    429: bearerReadErrors[429],
    ...internal,
    ...photoOff("", ""),
  },
});
