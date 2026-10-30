# ww-help-search

Search API for the [WitnessWork Help Center](../../docs/help-center.md): hybrid (semantic + keyword) search over the published answers, served from memory in about 130 ms. The contract (endpoints, bundle schema) is in `docs/help-center.md`; this Worker implements its Search API and keeps its indexes in step with the bundles the website ([`services/marketing`](../marketing/README.md)) publishes.

It moved here from the portfolio repo (`workers/help-search`) with the website (ADR 0042) and behaves the same. Search is Workers AI embeddings plus this Worker's own BM25 keyword index in KV; it doesn't use Cloudflare AI Search, whatever ADR 0033 says.

| Environment | Worker               | Hosts                                                                                          | Indexes                       |
| ----------- | -------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------- |
| production  | `ww-help-search`     | `help-search.witnesswork.app`, `help-search.leviwilkerson.com` (kept for shipped app versions) | `https://witnesswork.app`     |
| `dev`       | `ww-help-search-dev` | `help-search-dev.witnesswork.app`                                                              | `https://dev.witnesswork.app` |

- `GET https://help-search.witnesswork.app/v1/search?q=…&locale=…&platform=…&appVersion=…&limit=…` → `{ results: { slug, score }[] }`
- `GET /v1/health`
- `POST /v1/admin/sync` (bearer `ADMIN_TOKEN`): sync now. Optional JSON body: `{ "origin": "https://preview.example", "bundles": [HelpBundle…], "force": true, "budget": 5000 }`.
- `POST /v1/admin/explain?q=…&locale=…` (bearer): a search's results plus every answer's raw vector and keyword scores, for tuning (`pnpm eval` uses it).

## How it works

- **Index**: one per locale in KV (`SYNC_STATE`, key `index:<locale>`, about 1 MB): each answer's platforms, minimum app version, keyword counts, and embedding (`@cf/google/embeddinggemma-300m` on Workers AI, 768 dimensions, multilingual). Shape and loading in `src/searchIndex.ts`.
- **Sync** runs every 15 minutes (cron) and on `POST /v1/admin/sync`. It reads `<HELP_CENTER_ORIGIN>/help/bundle/manifest.json`, follows each locale's bundle URL (absolute; a relative one resolves on the origin), skips locales whose bundle hash is unchanged, and rebuilds the rest. An answer keeps its embedding while its text is unchanged, and untranslated (fallback) answers share English's, so a content change embeds only what changed. A full rebuild of every locale embeds about 2,500 answers in under a minute. A failed build keeps the previous index.
- **Search** checks the edge cache (5 min, keyed on normalized params), rate-limits per IP (60/min), then embeds the query (Workers AI, about 125 ms) while it loads the locale's index (kept in the isolate's memory, refreshed from KV every 5 minutes). It scores every answer the platform and app-version filters allow, by cosine similarity and by BM25 over answers containing every query token, and merges the two rankings (reciprocal rank fusion). Answers below the relevance floors in `src/search.ts` are dropped, so an unrelated query returns nothing. If the embedding misses its 400 ms deadline or fails, the search answers from keywords alone and isn't cached.
- **Tokens** (`src/text.ts`): lowercased words without accents or Arabic diacritics, Porter-stemmed when ASCII; Chinese, Japanese and Korean as overlapping character pairs.

New answers are searchable within about 20 minutes of the site deploying: the next cron run indexes them, and each isolate picks up the new index within 5 minutes.

## Tuning

`eval/queries.json` holds labeled queries (paraphrases in several languages, plus unrelated ones that should return nothing). `pnpm eval` runs them against a Worker and reports top-1, top-3, MRR, and how many unrelated queries came back empty. Run it after changing the floors, the tokenizer, or the model; `--scores <file>` also saves every answer's raw scores.

```sh
HELP_SEARCH_URL=https://help-search.witnesswork.app ADMIN_TOKEN=$TOKEN pnpm eval
```

October 2026: top-3 100%, top-1 93%, every unrelated query empty.

## Commands

Run from `services/` (`pnpm install` there installs the whole services workspace) or from this folder:

```sh
pnpm test                          # vitest
pnpm typecheck
pnpm build                         # wrangler deploy --dry-run (bundles into dist/)
pnpm dev                           # local Worker (ADMIN_TOKEN in .dev.vars); Workers AI is remote, KV local, so sync first

# CI deploys on merge to main (production) and from branches (dev); see
# ../README.md. By hand, with a token that can edit Workers, Workers AI and KV:
pnpm exec wrangler deploy               # production
pnpm exec wrangler deploy --env dev     # dev

# Sync now (token: 1Password Agents → "ww-help-search admin token", or "… (dev)")
curl -X POST -H "Authorization: Bearer $TOKEN" https://help-search.witnesswork.app/v1/admin/sync

# Index another build of the site instead of the configured origin
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"origin":"https://dev.witnesswork.app"}' https://help-search.witnesswork.app/v1/admin/sync
```

The admin secret is the Worker secret `ADMIN_TOKEN` (one per environment); rotate with `wrangler secret put ADMIN_TOKEN [--env dev]` and update the 1Password item.

## Costs

Effectively free. A query embedding is about 0.02 Workers AI neurons (10,000 a day are included, about 500,000 searches), and a full rebuild about 2,000. KV storage is under 20 MB, with one read per locale per isolate every 5 minutes. Repeats are served from the edge cache.
