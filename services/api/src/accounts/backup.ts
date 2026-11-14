import type { AppContext } from "../types";
import {
  bytesToBase64Url,
  bytesToHex,
  sha256Bytes,
  timingSafeEqual,
} from "../crypto";
import { readBlobBody } from "../buddies/envelope";
import { buddiesErrorResponse } from "../buddies/errorResponse";
import {
  ACCOUNT_LIMITS,
  type AccountFields,
  type AccountsOp,
  backupObjectKey,
  backupPrefix,
} from "./contracts";
import {
  readPlainJson,
  type AccountAuth,
  type RequireAccountOptions,
} from "./auth";
import { refuseWithoutStepUp } from "./stepUp";
import { recordActivity, recordBackupDownload } from "./activity";
import { accountsDb } from "./store";
import { claimNonce } from "./passkeyStore";
import {
  accountCall,
  guarded,
  plainFields,
  refuseAtEdge,
  signedForToken,
  verifiedBody,
  verifiedHeaders,
  type AccountCallRead,
  type BearerFields,
} from "./signed";

/**
 * End-to-end encrypted backups (witness-work `docs/accounts-protocol.md`,
 * "Backup"): one R2 object per device slot at `v1/<accountId>/<slotId>`. The
 * server sees ciphertext, its size, and when it was uploaded
 * (`customMetadata.uploadedAt`, epoch ms). A suspended account can still
 * back up. R2's lifecycle rule deletes a slot 400 days after its last upload
 * (`scripts/r2-lifecycle.mjs`).
 *
 * `put`, `list`, and `get` are bearer requests; `delete` is a bearer request
 * that also carries the account key's envelope, signed by the token's own
 * account, so a leaked token alone can't delete backups. While the legacy
 * switch is on, each also takes the envelope alone, as before sessions.
 *
 * `backup/put` counts against the Buddies photo-upload edge tier, the rest
 * against the read tier.
 *
 * Deleting a slot that exists, and downloading one (once per slot, session,
 * and day), go in the account's activity (ADR 0028) before R2 is touched, so
 * a deletion is never unlogged.
 *
 * Privacy: nothing here logs or reports bodies, keys, account ids, or slot
 * ids.
 */

const { backupBytes, backupSlots, backupPutIntervalMs } = ACCOUNT_LIMITS;

/** `backup/put`'s bearer form names its slot and digest in these headers. */
export const BACKUP_PUT_HEADERS = {
  slotId: "x-ww-slot-id",
  sha256: "x-ww-sha256",
} as const;

interface Slot {
  slotId: string;
  size: number;
  uploadedAt: number;
  /** R2's own etag of the slot's bytes; opaque to the app. */
  etag: string;
}

/**
 * `If-Match`: absent is null; a strong quoted etag is its value; anything
 * else (weak `W/"…"`, unquoted, `*`, a list) is undefined, so `bad_request`.
 * A weak etag doesn't promise the same bytes, which is what a re-seal needs.
 */
const parseBackupIfMatch = (
  header: string | undefined,
): string | null | undefined => {
  if (header === undefined) return null;
  const match = /^"([A-Za-z0-9_-]{1,128})"$/.exec(header.trim());
  return match ? match[1] : undefined;
};

/** The account's slots, oldest key first. */
const listSlots = async (
  bucket: R2Bucket,
  accountId: string,
): Promise<Slot[]> => {
  const prefix = backupPrefix(accountId);
  const slots: Slot[] = [];
  let cursor: string | undefined;
  for (;;) {
    // `include` is honored from compatibility date 2022-08-04; the base
    // workers-types this repo compiles against predate it.
    const page = await bucket.list({
      prefix,
      cursor,
      include: ["customMetadata"],
    } as R2ListOptions);
    for (const object of page.objects) {
      const stamped = Number(object.customMetadata?.uploadedAt);
      slots.push({
        slotId: object.key.slice(prefix.length),
        size: object.size,
        uploadedAt: Number.isSafeInteger(stamped)
          ? stamped
          : object.uploaded.getTime(),
        etag: object.etag,
      });
    }
    if (!page.truncated) return slots;
    cursor = page.cursor;
  }
};

/**
 * Runs a backup op for its account: off (`disabled`) without the bucket or
 * the accounts database, then the edge tier, then `accountCall`.
 */
const backupCall = async <K extends AccountsOp>(
  c: AppContext,
  edgeAs: "blob/put" | "inbox/sync",
  read: AccountCallRead<K>,
  run: (
    bucket: R2Bucket,
    accountId: string,
    fields: AccountFields<K>,
  ) => Promise<Response>,
  options?: RequireAccountOptions,
): Promise<Response> => {
  const bucket = c.env.ACCOUNT_BACKUPS;
  if (!bucket || !c.env.ACCOUNTS_DB) return buddiesErrorResponse("disabled");
  const limited = await refuseAtEdge(c, edgeAs);
  if (limited) return limited;
  return accountCall(
    c,
    read,
    (accountId, fields) => run(bucket, accountId, fields),
    options,
  );
};

/** A bearer request's fields from its JSON body. */
const jsonFields =
  <K extends AccountsOp>(c: AppContext, op: K) =>
  async (): Promise<BearerFields<K>> =>
    plainFields(op, await readPlainJson(c));

/** The bearer session making the call; null for a legacy envelope. */
const callerSessionId = (c: AppContext): string | null =>
  c.get("account")?.sessionId ?? null;

/**
 * `backup/put`: the blob as the raw body, with `x-ww-slot-id`, `x-ww-sha256`,
 * and `Content-Length` (bearer) or the envelope in `x-ww-payload`/
 * `x-ww-signature` (legacy; older builds send `x-ww-p`/`x-ww-s`). A declared
 * `Content-Length` over the cap is refused before anything is read;
 * otherwise the body is read up to `size` and checked
 * against `size` and `sha256` before it replaces the slot.
 *
 * An optional `If-Match: "<etag>"` (the slot's `etag` from `backup/list` or
 * `backup/get`) makes the put replace only those exact bytes, so re-sealing a
 * slot after an account key change never rolls back a newer backup or
 * re-creates a deleted one: a slot that's gone or has other bytes is 412
 * `precondition_failed`, and a weak, unquoted, `*`, or list header is
 * `bad_request`. The check runs again inside R2 (`onlyIf.etagMatches`), so a
 * put that lands after the slots were listed can't be overwritten either.
 * Without the header a put replaces unconditionally, as older apps send it.
 */
const handlePut = guarded("backup/put", async (c) => {
  const ifMatch = parseBackupIfMatch(c.req.header("if-match"));
  const declared = c.req.header("content-length");
  if (declared != null && Number(declared) > backupBytes)
    return c.env.ACCOUNT_BACKUPS && c.env.ACCOUNTS_DB
      ? buddiesErrorResponse("too_large")
      : buddiesErrorResponse("disabled");
  return backupCall(
    c,
    "blob/put",
    {
      bearer: async () =>
        plainFields("backup/put", {
          slotId: c.req.header(BACKUP_PUT_HEADERS.slotId),
          sha256: c.req.header(BACKUP_PUT_HEADERS.sha256),
          size: declared == null ? undefined : Number(declared),
        }),
      legacy: () => verifiedHeaders(c, "backup/put"),
    },
    async (bucket, accountId, { slotId, size, sha256 }) => {
      if (size > backupBytes) return buddiesErrorResponse("too_large");
      if (ifMatch === undefined) return buddiesErrorResponse("bad_request");

      const now = Date.now();
      const slots = await listSlots(bucket, accountId);
      const existing = slots.find((slot) => slot.slotId === slotId);
      if (existing) {
        const wait = existing.uploadedAt + backupPutIntervalMs - now;
        if (wait > 0)
          return buddiesErrorResponse("rate_limited", {
            retryAfterSeconds: Math.max(1, Math.ceil(wait / 1_000)),
          });
        if (ifMatch != null && existing.etag !== ifMatch)
          return buddiesErrorResponse("precondition_failed");
      } else if (ifMatch != null) {
        return buddiesErrorResponse("precondition_failed");
      } else if (slots.length >= backupSlots) {
        return buddiesErrorResponse("limit");
      }

      const body = await readBlobBody(c.req.raw, size, backupBytes);
      if (!body.ok) return buddiesErrorResponse(body.error);
      const digest = await sha256Bytes(body.value);
      if (!timingSafeEqual(bytesToBase64Url(digest), sha256))
        return buddiesErrorResponse("bad_request");

      const written = await bucket.put(
        backupObjectKey(accountId, slotId),
        body.value,
        {
          sha256: bytesToHex(digest),
          httpMetadata: { contentType: "application/octet-stream" },
          customMetadata: { uploadedAt: String(now) },
          ...(ifMatch != null ? { onlyIf: { etagMatches: ifMatch } } : {}),
        },
      );
      // R2 answers null when `onlyIf` didn't hold.
      if (!written) return buddiesErrorResponse("precondition_failed");
      return c.json({ ok: true, uploadedAt: now, etag: written.etag }, 200, {
        ETag: `"${written.etag}"`,
      });
    },
    // A signed-out device's last token never writes over a backup
    // re-sealed under a new account key (ADR 0039).
    { requireLiveSession: true },
  );
});

const handleList = guarded("backup/list", async (c) =>
  backupCall(
    c,
    "inbox/sync",
    {
      bearer: async () => ({ fields: {} }),
      legacy: () => verifiedBody(c, "backup/list"),
    },
    async (bucket, accountId) =>
      c.json({ ok: true, slots: await listSlots(bucket, accountId) }),
  ),
);

/** Streams the slot's bytes back exactly as put. */
const handleGet = guarded("backup/get", async (c) =>
  backupCall(
    c,
    "inbox/sync",
    {
      bearer: jsonFields(c, "backup/get"),
      legacy: () => verifiedBody(c, "backup/get"),
    },
    async (bucket, accountId, { slotId }) => {
      const object = await bucket.get(backupObjectKey(accountId, slotId));
      if (!object) return buddiesErrorResponse("not_found");
      await recordBackupDownload(accountsDb(c.env.ACCOUNTS_DB!), {
        accountId,
        sessionId: callerSessionId(c),
        slotId,
      });
      return new Response(object.body, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(object.size),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          ETag: `"${object.etag}"`,
        },
      });
    },
  ),
);

/**
 * The bearer form of `backup/delete`: the envelope must verify and be signed
 * by the token's own account (`forbidden` otherwise), a web session needs a
 * passkey step-up in the last 5 minutes, and the envelope works once (409
 * `replay`): its nonce is recorded before anything is deleted, since R2
 * isn't in a D1 batch.
 */
const stepUp = async (
  c: AppContext,
  account: AccountAuth,
): Promise<BearerFields<"backup/delete">> => {
  const signed = await signedForToken(c, "backup/delete", account);
  if ("refusal" in signed) return signed;
  const db = accountsDb(c.env.ACCOUNTS_DB!);
  const stepUpRefusal = await refuseWithoutStepUp(db, account);
  if (stepUpRefusal) return { refusal: stepUpRefusal };
  return (await claimNonce(db, signed.nonce))
    ? { fields: signed.fields }
    : { refusal: buddiesErrorResponse("replay") };
};

/**
 * One slot, or every slot without `slotId`. Idempotent. A bearer caller whose
 * session has ended is 401 (`requireLiveSession`), even with the signature.
 */
const handleDelete = guarded("backup/delete", async (c) =>
  backupCall(
    c,
    "inbox/sync",
    {
      bearer: (account) => stepUp(c, account),
      legacy: () => verifiedBody(c, "backup/delete"),
    },
    async (bucket, accountId, { slotId }) => {
      const keys =
        slotId != null
          ? (await bucket.head(backupObjectKey(accountId, slotId)))
            ? [backupObjectKey(accountId, slotId)]
            : []
          : (await listSlots(bucket, accountId)).map((slot) =>
              backupObjectKey(accountId, slot.slotId),
            );
      if (keys.length === 0) return c.json({ ok: true });
      await recordActivity(accountsDb(c.env.ACCOUNTS_DB!), {
        accountId,
        kind: "backup.deleted",
        sessionId: callerSessionId(c),
        slotId: slotId ?? null,
      });
      // R2 deletes at most 1,000 keys a call.
      for (let start = 0; start < keys.length; start += 1_000)
        await bucket.delete(keys.slice(start, start + 1_000));
      return c.json({ ok: true });
    },
    { requireLiveSession: true },
  ),
);

export const backupHandlers = {
  put: handlePut,
  list: handleList,
  get: handleGet,
  delete: handleDelete,
};
