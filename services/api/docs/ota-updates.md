# Hot Updater

The update services are independent of the ww-proxy API Worker. Each has its
own private R2 bucket, D1 database, client credential and app signing key:

| Environment | Worker / bucket / database | App channel |
| --- | --- | --- |
| Development | `ww-updates-dev` | `dev` |
| Beta | `ww-updates-beta` | `beta` |
| Production | `ww-updates-prod` | `production` |

Their URLs are `https://<worker>.levi-wilkerson.workers.dev`. The database IDs
and resource bindings are in `wrangler-updates.json`. Plain `wrangler deploy`
still deploys only ww-proxy; update commands always select their own config and
an explicit environment.

## Deploy

From `services/api`, for each of `dev`, `beta` and `prod`:

```sh
pnpm updates:migrate:dev
pnpm updates:deploy:dev
```

Apply migrations before deploying the runtime. `0001_hot-updater_1.0.0.sql` is
the unmodified Cloudflare schema supplied by Hot Updater 1.0.2, including API
keys, Insights and Remote Config. Only `handlers.client` is mounted; the admin
protocol and console are not exposed publicly. CLI writes use Cloudflare D1
and R2 credentials in the app's own env, at the repo root.

The API deploy workflow (`.github/workflows/api-deploy.yml`, at the repo root)
also migrates and deploys these Workers, retaining their existing secrets:
`ww-updates-prod` with a production deploy, and `ww-updates-beta` and
`ww-updates-dev` with each Beta deploy (the API has no deployed dev tier, but
the dev update channel stays for development-channel builds). This changes
update infrastructure, not installed app code; publishing an OTA is a separate
operation, run from the repo root.

## Credentials

Each Worker needs `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` secrets to sign
download URLs. Use an R2 Object Read & Write token scoped to that Worker's
bucket. Save it in the 1Password Agents vault and upload the two values with
`wrangler secret put --config wrangler-updates.json --env <environment>` via
stdin. Do not commit credentials or put them in command arguments or logs.

The app's CLI also needs a D1 Edit API token for this account. A Wrangler OAuth
session can migrate D1 and register client keys, but cannot mint API tokens or
supply persistent R2 S3 credentials.

Register client keys through the `apiKeys()` plugin's provisioning API or
`hot-updater api-key create` in a matching server/config context. Only the
SHA-256 digest is stored in D1. A client key can read updates and submit
operational reports; it cannot deploy or administer updates. Each environment
has a separate client key. Rotation must ship a new client credential before
revoking the old one.

## Verify

Use the official CLI's scoped scaffold and infrastructure doctor checks against
the version-matched generated scaffold. For both iOS and Android, the exact
catalog route must reject an absent/wrong key with 401 and accept the matching
key with 200, or 404 with `x-hot-updater-catalog: none` for an empty catalog.
Keys from another environment must fail. `/version` alone does not prove OTA.

Separately verify D1 migrations, bound bucket identities, a bounded R2 S3 list
with the CLI's credentials, signed artifact downloads, and a native Release
app's application/rollback and Insights reports. See the app's
[`docs/ota-updates.md`](../../../docs/ota-updates.md), at the repo root. Keep all generated scaffolds, credentials and evidence
under ignored `.verify/` folders.

## Rollout

Before enabling an environment, create its resources, apply the schema,
register its distinct client key and install its bucket-scoped R2 secrets.
Save credentials in Agents as `WitnessWork OTA R2 (<channel>)`; the app's
publisher also needs a persistent account-scoped D1 Edit token. Confirm that
the CI account token can migrate D1 and deploy each configured Worker.

Use development and Beta Release apps on both platforms to verify signed
artifact downloads, activation, disabled-release rollback, invalid-signature
rejection and Insights reports. Record the current setup and proof in the
PR or release record. Preparing production infrastructure does not
release an app bundle; production app rollout follows its separate typed
release gate in WitnessWork.
