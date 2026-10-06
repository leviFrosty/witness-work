---
name: translate-locales
description: Translate WitnessWork's app strings from `src/locales/en-US.json` into the other locale files using established Jehovah's Witness terminology. Builds a worklist of missing, changed and broken keys, translates them (in parallel per locale when large), applies them, lints placeholders, plurals and Siri phrases, and re-syncs the native string catalogs. Use during /cut-release, when the user asks for translations, when a change can't ship in English only, or when translating store release notes.
---

# Translate locales

You're WitnessWork's translator; there's no separate approval step. `src/locales/en-US.json` is the source of truth.

- **Feature work:** add and change strings in `en-US.json` only. Other Languages fall back to English for any key they lack (`enableFallback` in `src/lib/locales.ts`), so untranslated keys still render.
- **Release cut:** `/cut-release` uses this skill to translate every missing, changed or broken key into every locale.
- **Earlier** only when the user asks or a change can't ship in English only.

## Where strings go

- `src/lib/locales.ts` loads the 17 target files through i18n-js. `bem-ZM` is Bemba, `rw-RW` Kinyarwanda and `sw-KE` Swahili. Interpolation is `{{name}}` or `%{name}`, and plural objects use `zero`/`one`/`other`.
- `pnpm sync:widget-shared` copies the keys listed in `src/app/watch/watchStringKeys.json` from every locale into the Apple Watch and Siri string catalogs (`targets/**/*.xcstrings`). The pre-commit hook fails until you re-run it after changing a locale file, or while a Siri phrase breaks the rules below. A Language missing a catalog string gets the English text, but Siri phrases have no English fallback: until a Language has its own, Siri can't run the actions by voice in it, though they still appear in the Shortcuts app.
- Locale files don't drive iOS permission prompts (`app.config.ts` reads English), store release notes (below) or ww-api's shared-contact page (`~/dev/ww-api/src/contactLinkLocales.ts`).
- Crowdin (`crowdin.yml`, linked from Settings → Support) lets volunteers proofread. Its bot opens "translation: New Translations" PRs from `l10n_development`; check those with `lint` and the terminology below like your own output.
- `i18n-auto-translation` (a devDependency) and the old Azure `pnpm translate` script are no longer used. The script was removed in favor of agent translation; don't bring it back.

## Workflow

`locales.mjs` beside this file does the bookkeeping. Run it from the repo root as `node .agents/skills/translate-locales/locales.mjs <command>`.

1. **Worklist.** `todo --since <ref>` writes `.asc/translations/<locale>.todo.json` (git-ignored) for each locale. Each key has its English and a reason:
   - `missing`: absent or empty.
   - `changed`: English changed since `<ref>` but the translation didn't. `was` holds the old English and `current` the stale translation.
   - `lint`: the current translation fails a check (`problems`).

   At a release cut `<ref>` is the last released tag. Without `--since` you only get `missing` and `lint`. `--locale ru-RU` (repeatable) limits the run; `--chunk 300` splits big worklists into `-01`, `-02`, … files.

2. **Glossary.** `terms <locale> publisher pioneer "return visit" "Bible study" ministry` shows how existing strings render each term, shortest first. Settle on one term per concept before translating (see Terminology).
3. **Translate** every key into `.asc/translations/<locale>.done.json`, using the same `-NN` suffix as its todo file: a flat object of `"dotted.key": "translation"`.
4. **Apply.** `apply <locale> <done file>` checks every key first and writes nothing if any fails. New keys go beside their English neighbors and changed ones are replaced in place. `--dry-run` only checks.
5. **Verify.** Run `lint` (every locale; exits nonzero on any problem) and `pnpm check:locales`. Then run `pnpm sync:widget-shared` and stage the catalogs it rewrites along with the locale files.
6. **Report** per locale: key counts by reason, your term choices, and any strings you're unsure of. Delete `.asc/translations/` once the locale files are committed.

## Parallel translation

A release cut can cover thousands of strings, so fan out: one subagent per locale, or per chunk for big worklists. Locale files are independent and can run at the same time, but apply each locale's chunks one after another. Brief each subagent with:

> Translate WitnessWork strings into `<locale>`. Read `.agents/skills/translate-locales/SKILL.md` (Translation rules and Terminology) and `CONTEXT.md`. Your input is `.asc/translations/<locale>.todo[-NN].json`. Build a glossary with `terms` first. Write `.asc/translations/<locale>.done[-NN].json` covering every key, then run `node .agents/skills/translate-locales/locales.mjs apply <locale> <done file> --dry-run` until it passes. Don't edit `src/locales` or any other file. Report the key count, your term choices and any strings you're unsure of.

Then apply the done files and spot-check each locale: the same term for the same concept across chunks, and quoted labels that match their keys.

## Translation rules

- **Values only.** Keep English's keys and nesting; don't add, rename or delete keys. Leave keys that aren't in `en-US.json` alone.
- **Placeholders** stay exactly as written: `{{count}}`, `%{name}`, `${applicationName}`. Keep the same names and the same number of each, and translate nothing inside the braces. Move them wherever the grammar needs. Keep `**bold**` markers around the matching words.
- **Plurals.** Keep English's forms (`zero`/`one`/`other`); don't add `two`, `few` or `many`. i18n-js applies English plural rules to every Language (no pluralizer is registered), so `one` means exactly 1 and `other` covers 2, 5, 21 and the rest. For Russian, Ukrainian and other languages with more forms, write `other` so it reads right for any number. Use count-neutral wording (`Контакты: {{count}}`) or an abbreviation (`{{count}} дн.`), as the existing strings do. Take the same care with any string that has `{{count}}`.
- **Meaning over words.** Translate what the UI does, naturally, and keep labels and buttons about as short as English. When a string quotes a UI label (a FAQ answer, "turn on Log my hours"), use that label's translation from the same locale.
- **Register.** Match the file's form of address, such as German `du` or French `vous`. Check a few existing strings first.
- **Names.** Keep WitnessWork and Scribe AI. Use Apple's and Google's localized names for their products and settings (Shortcuts, Settings, Google Play).
- **Platform variants.** A key ending in `Android` is the Android wording of the same key without the suffix. Keep iPhone, iOS and App Store out of Android variants and Google Play out of the iOS ones. Shared strings stay platform-neutral.
- **No "magic"** wording or imagery in any Language.
- **Siri phrases** are the `shortcutPhrases` keys in `src/app/watch/watchStringKeys.json`. Each is a spoken command: natural and short in that language, with `${applicationName}` exactly once and no digits (spell numbers out). It must also differ from every other phrase in that Language. `faq_siri_a` quotes these phrases with "WitnessWork" in place of `${applicationName}`, so its quotes must match the translated phrases exactly. `lint` checks the mechanical rules, but whether a phrase sounds natural is up to you.
- **FAQ answers** (`faq_<id>_a`) stay self-contained and searchable. Translate the whole answer.
- **Bemba, Kinyarwanda and Swahili** have less reference material. Lean on the existing file and JW publications in that language, and list the strings you're unsure of instead of guessing silently.

## Terminology

Use the words Jehovah's Witnesses use in that language. jw.org and the Watchtower Online Library in that language, plus congregation forms such as the monthly service report, are the reference. `CONTEXT.md` defines each concept.

Existing strings are evidence, not authority. Earlier machine translations left literal errors: Russian "Издатель" (a book publisher) and "министерство" (a government ministry), Russian "Отчет об обслуживании" and Japanese "サービスレポート" for Service Report, and Russian "Следовать за" for Follow Up. Don't copy errors like these. When the official term differs from the file's, use the official term in the strings you translate and list the keys that still use the wrong one in your report.

Concepts to get right:

- **publisher**: anyone who shares in the preaching work. **Kingdom Publisher** is the role name for a publisher who isn't a pioneer (the `publisher` key).
- **Roles**: Regular Pioneer, Regular Auxiliary (an auxiliary pioneer serving continuously), Special Pioneer, Circuit Overseer.
- **ministry**, **field service**, **preaching**: the preaching work, never a government department or clergy.
- **return visit**, **Bible study**, **Service Report**, **Service Year** (September through August), **Credit Time** (such as LDC or Bethel), **Kingdom Hall**, **congregation**.
- App concepts from `CONTEXT.md` (**Follow-up**, **Visit**, **Contact**, **Plan**, **Not at Home**) each get one consistent translation per locale.

## Store release notes

The App Store's "What's New" and Google Play's release notes share one text per language (see `../app-store-release/SKILL.md` and `docs/build.md`). Follow the rules above and keep every language within Play's 500 characters (count with `[...text].length`; the App Store allows 4,000). Say which platform a feature is for. App Store Connect's locale codes differ from the app's (`ja`, not `ja-JP`). The in-app `updates.<version>.c<n>` strings are separate and go through the locale files like any other key.
