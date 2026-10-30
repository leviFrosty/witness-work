---
status: accepted
---

# The Help Center lives on the website

> Amended by [ADR 0042](./0042-witnesswork-app-domain.md): the Help Center moves to `witnesswork.app/help`, built from `services/marketing` in this repo and deployed by CI.
>
> Search (decision 4) was built without Cloudflare AI Search: the `help-search` Worker (`services/help-search`) embeds answers with Workers AI and keeps them, with its own BM25 keyword index, in KV.

## Context

The Help Center's questions and answers lived in the app: their order and
platforms in `faqs.ts`, their text as `faq_<id>_q` / `faq_<id>_a` keys in every
locale file. Nothing outside the app could read them, so a web search for a
WitnessWork question found no answer of ours, and AI search summaries made up
screens that don't exist. A corrected or new answer also waited for an app
release, and the text added about 3 MB of strings to the JavaScript bundle.

## Decision

1. **The website is the source of truth.** Each question is one MDX file per
   locale in portfolio-v2 (`content/help/`). The site publishes them as indexed
   pages at `leviwilkerson.com/witness-work/help-center`, as `llms.txt`, and as
   one JSON bundle per locale with a manifest of their hashes. Its
   `docs/help-center.md` is the contract.
2. **The app renders the bundle natively, not in a WebView.** Answers arrive as
   the Rich Notes document format (`RichTextDoc`) and show in `RichTextView`,
   so they follow the app's theme, type size, direction and layouts, and keep
   Copy and Share. A WebView would have needed its own offline cache and lost
   all of that.
3. **Offline first.** The app ships a snapshot of every locale
   (`src/assets/help-center/`, refreshed by `pnpm sync:help` during release
   prep). Opening the Help Center shows the newer of the last downloaded
   bundle and the snapshot, and checks the manifest in the background (ETag);
   a changed hash downloads the locale's bundle, which is validated, then saved
   and shown (if saving fails it's still shown, and the next open downloads it
   again). Other failures keep what's on screen.
4. **Search is Cloudflare AI Search with an on-device fallback.** The
   `help-search.leviwilkerson.com` Worker keeps an AI Search index (keyword +
   meaning, per locale) in step with the bundles and answers
   `GET /v1/search`. The app shows Fuse.js results from the bundle at once and
   switches to the service's order when it answers within 8 s for the same
   query; offline, a timeout or an error leaves the Fuse.js results.
5. **Entries carry `platforms` and an optional `minAppVersion`.** The app hides
   an answer meant for the other platform or a newer app version, so the site
   can publish answers before a release and keep answers for older versions.

## Consequences

- FAQ text is no longer an app string. Feature work adds Help Center answers in
  portfolio-v2 (English), and translation happens there, separately from the
  app's release cut.
- Content updates reach users without an app release, the next time they open
  the Help Center online.
- Search queries leave the device when online. They carry the query, language,
  platform and app version, no account or device identifier, and analytics
  never record the query.
- The bundle format is a contract with shipped apps: a breaking change needs a
  new `schemaVersion`, and the site keeps serving version 1 until the app
  versions that read it are gone.
