# Uploading PR screenshots from a headless agent

Reviewed October 6, 2026. Scope: how an agent with an authenticated `gh` CLI on
macOS can put PNG screenshots into a pull request body or comment so they render
inline, for the `| Before | After |` tables that `agents.md` asks for. Research
only: nothing was uploaded, pushed, or posted. The local `gh` is 2.102.0, logged
in with an OAuth (`gho_`) token whose `viewerPermission` on
`leviFrosty/witness-work` is `ADMIN`. The repo is public.

**Bottom line:** the line in `agents.md` that says "`gh` can't upload images into
a PR body" is out of date. Since
[gh v2.99.0](https://github.com/cli/cli/releases/tag/v2.99.0) (September 1,
2026), `gh pr create|edit|comment --attach` uploads images to
`github.com/user-attachments/assets/…`, the same store that drag-and-drop in the
browser uses. It authenticates with the normal `gh` token.

## 1. First-party support

### `gh --attach` (shipped)

- **History.** The request was refused for years because no public API existed:
  [#1895](https://github.com/cli/cli/issues/1895) (closed as not planned, 2020),
  [#4228](https://github.com/cli/cli/issues/4228),
  [#4465](https://github.com/cli/cli/issues/4465),
  [#12960](https://github.com/cli/cli/issues/12960) and
  [#13637](https://github.com/cli/cli/issues/13637) (both closed as duplicates).
  In April 2026 a maintainer wrote on
  [#13256](https://github.com/cli/cli/issues/13256) that "there is no
  public/stable API that we can use to achieve this." The work then moved to
  [github/roadmap#1324](https://github.com/github/roadmap/issues/1324), a preview
  build came out on August 18, and #13256 closed as completed on August 25 after
  the twelve-PR stack listed in [#14186](https://github.com/cli/cli/issues/14186)
  merged.
- **Released** in [v2.99.0](https://github.com/cli/cli/releases/tag/v2.99.0) for
  `gh issue create|edit|comment` and `gh pr create|edit|comment`. The
  [changelog](https://github.blog/changelog/2026-09-01-github-cli-media-in-issues-pull-requests-and-comments/)
  says it is GA on all plans, and that GitHub Enterprise Server is not supported.
- **Documentation:**
  [Attaching files with GitHub CLI](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli).
  It says you "need push access to the repository to attach files." You can
  repeat the flag, but not for the same file. Alt text goes after `#`. If the
  Markdown already references a local file that you also pass to `--attach`,
  that reference is rewritten in place. Files the body doesn't reference are
  appended at the end.
- **Auth and endpoint (source).**
  [`internal/attachments/client.go`](https://github.com/cli/cli/blob/trunk/internal/attachments/client.go)
  sends `POST https://uploads.github.com/user-attachments/assets?name=…&content_type=…&repository_id=…`
  with the raw bytes, through gh's normal authenticated API client. It accepts
  these token types: OAuth, classic PAT, fine-grained PAT, and (since
  [#14516](https://github.com/cli/cli/pull/14516), in
  [v2.102.0](https://github.com/cli/cli/releases/tag/v2.102.0)) `ghu_`. It
  requires `viewerPermission` of `ADMIN`, `MAINTAIN` or `WRITE`, because "READ
  and TRIAGE get a 404."
- **Limits (source).**
  [`userasset.go`](https://github.com/cli/cli/blob/trunk/internal/attachments/userasset.go)
  accepts `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.mp4`, `.mov` and
  `.webm`, up to 10 MB per image and 100 MB per video.
- **How references are rewritten (source).**
  [`references.go`](https://github.com/cli/cli/blob/trunk/internal/attachments/references.go)
  parses the body with goldmark and rewrites Markdown `Image` and `Link` nodes
  whose destination resolves, through `filepath.Abs` (that is, against the
  current working directory), to an attached file. Raw HTML such as
  `<img src="./x.png">` is not rewritten. The tests don't cover a Markdown table
  with images in its cells. Rewriting them is inferred from the parser, not
  verified. If a reference isn't matched, the file is appended instead, so the
  failure shows up.
- **Open gaps:**
  [#14309](https://github.com/cli/cli/issues/14309) (GitHub App installation
  tokens `ghs_`, including Actions `GITHUB_TOKEN`, get a 404; a maintainer
  called this "intended behavior for now");
  [#14302](https://github.com/cli/cli/issues/14302) (needs write access, so
  outside reporters can't attach);
  [#14335](https://github.com/cli/cli/issues/14335) (GHES support; a maintainer
  said it is "blocked on backend support",
  [#14328](https://github.com/cli/cli/issues/14328)). A comment on
  [#14495](https://github.com/cli/cli/issues/14495) reports that some third-party
  `ghu_` tokens still get a 404 from the server. There is no standalone "upload
  and print the URL" command. The open
  [RFC #14529](https://github.com/cli/cli/issues/14529) for `gh issue artifact`
  proposes resolving `--body-file` references against the file's own directory,
  but this isn't in trunk yet.

### REST/GraphQL

The `uploads.github.com/user-attachments/assets` endpoint is not in the
published OpenAPI description: a code search of
[github/rest-api-description](https://github.com/github/rest-api-description)
returns no hits for `user-attachments`. A maintainer said on
[#13256](https://github.com/cli/cli/issues/13256) that the issue "is **not** about
an API for any app other than `gh`." Calling it directly with `curl` works
according to reporters on [#14309](https://github.com/cli/cli/issues/14309) and
[#14495](https://github.com/cli/cli/issues/14495), but it is undocumented and
can change. #14495 says `Authorization: Bearer` gets a 404 and `token` is
required, while gh-image sends `Bearer` and says it works (unverified).

## 2. Unofficial tools and endpoints

| Tool / endpoint                                                                               | How it authenticates (from source)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web UI flow: `POST github.com/upload/policies/assets`, then an S3 form, then a finalize `PUT` | Browser `user_session` and `__Host-user_session_same_site` cookies plus an `authenticity_token` scraped from the repo page ([gh-image `upload.go`](https://github.com/drogers0/gh-image/blob/main/internal/upload/upload.go)). A PAT gets a 422 ([#13256](https://github.com/cli/cli/issues/13256)). On GHES a token gets a 302 to login ([#14328](https://github.com/cli/cli/issues/14328)).                                                                                                              | Needs a browser session, which is not headless-safe. Undocumented and stable only by accident.                                                                                                                                                                                                                                                                                                                                                                                  |
| [drogers0/gh-image](https://github.com/drogers0/gh-image) (MIT, gh extension)                 | Tries `uploads.github.com/user-attachments/assets` first, with `gh auth token` as a Bearer token ([`bearer.go`](https://github.com/drogers0/gh-image/blob/main/internal/upload/bearer.go), [`route.go`](https://github.com/drogers0/gh-image/blob/main/internal/upload/route.go)). It falls back to reading `user_session` from Chrome, Firefox, Safari and other browser stores, or from `GH_SESSION_TOKEN` ([`cookies.go`](https://github.com/drogers0/gh-image/blob/main/internal/cookies/cookies.go)). | Its token path does what `gh --attach` now does. The cookie path pulls a full-account session credential from the keychain or browser stores. GitHub's [Terms §B](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) make you "responsible for keeping your Account secure", and the [Acceptable Use Policies §5](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies) cover unauthorized access. Avoid it. |
| [enthus-appdev/gh-attach](https://github.com/enthus-appdev/gh-attach) (gh extension)          | `gh auth token` against the Git Data API. It pushes blobs to a hidden ref `refs/uploads/issues/<N>` and prints `https://github.com/<repo>/blob/<sha>/<file>?raw=true` ([`gitdata.go`](https://github.com/enthus-appdev/gh-attach/blob/main/internal/gh/gitdata.go), [README](https://github.com/enthus-appdev/gh-attach/blob/main/README.md)).                                                                                                                                                             | Uses only documented APIs, and repo visibility gates who can see the images. #13256 described an older cookie-based version; the current source has no cookie code. It is a third-party binary with 8 stars.                                                                                                                                                                                                                                                                    |

## 3. Repo-hosted options

- **Orphan branch with `raw.githubusercontent.com` (the current `agents.md`
  approach).** This works for public repos. `raw.githubusercontent.com` served
  `cache-control: max-age=300` (observed with `curl -I`), so overwriting a file
  at a branch URL can show a stale image for about 5 minutes. Pinning to the
  commit SHA avoids that. GitHub proxies images through Camo, and "if an image
  is being served … from a server that requires authentication, it can't be
  viewed by GitHub"
  ([anonymized URLs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-anonymized-urls)),
  so raw URLs break in private repos (also reported on
  [#13256](https://github.com/cli/cli/issues/13256)). The images last as long
  as the branch; if it's deleted, branch-name URLs return 404. The branch
  lives under `refs/heads/*`, so every full `git clone` downloads it
  ([git-clone](https://git-scm.com/docs/git-clone)), and it grows the repo
  forever. GitHub recommends keeping repos "ideally less than 1 GB"
  ([large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)).
  In this repo, `git push` also runs `.husky/pre-push` (`deps`, `lint`,
  `testFinal`) even for screenshot-only pushes.
- **Blob `?raw=true` URLs.** GitHub Docs recommend
  `../blob/main/…/x.png?raw=true` for images "in issues, pull requests and
  comments of the repository". For a private repo these work "only if the viewer
  has at least read access"
  ([basic formatting syntax, Images](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#images)).
  This is the only repo-hosted URL form documented to work in private repos.
  `blob/…?raw=true` redirected with a 302 to `/raw/refs/heads/…` (observed). A
  ref outside `refs/heads` (as gh-attach uses) is accepted by
  [Create a reference](https://docs.github.com/en/rest/git/refs#create-a-reference)
  as long as the name starts with `refs` and has two slashes, and it isn't
  fetched by a default clone.
- **Committing into the PR branch.** This puts binaries into `main` on merge,
  unless the PR is squashed and the images are removed first. Commits stay
  reachable by SHA, and through PR refs, after the images are deleted
  ([removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)).
  It also conflicts with this repo's one-commit-per-PR workflow. Not
  recommended.
- **Release assets.**
  [Upload a release asset](https://docs.github.com/en/rest/releases/assets#upload-a-release-asset)
  needs a release (and therefore a tag), rejects duplicate filenames, and the
  assets disappear when the release or asset is deleted. Releases here are app
  versions, so this would clutter the Releases page. Private assets need auth,
  so Camo can't render them.
- **Gists.** In the API, a file's `content` is a string
  ([Gists API](https://docs.github.com/en/rest/gists/gists#create-a-gist)), and
  `gh gist create` refuses binaries with "binary file not supported"
  ([`create.go`](https://github.com/cli/cli/blob/trunk/pkg/cmd/gist/create/create.go)).
  Binaries can only get in by `git push` to the gist repository ("Every gist is a
  Git repository"). Secret gists "aren't private"
  ([creating gists](https://docs.github.com/en/get-started/writing-on-github/editing-and-sharing-content-with-gists/creating-gists)).
  Not suitable.

## 4. Third-party image hosts

Public S3/R2 buckets or imgur can be read by anyone with the URL and sit outside
GitHub's permission model. S3 presigned URLs last at most 7 days, and expire
earlier with temporary credentials
([AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)),
so images in a PR break within a week. These hosts also add another credential
and another retention policy to manage. Imgur's 2023 removal of "old, unused,
and inactive content that is not tied to a user account" is _unverified_:
imgur's help page couldn't be fetched, and the claim comes from news coverage.
Not recommended for this repo.

## 5. Comparison

| Option                                  | Auth needed                  | Headless | Renders inline           | Permanence                                 | Private repo                                                                                                                                   | Risk                                          |
| --------------------------------------- | ---------------------------- | -------- | ------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `gh … --attach` (≥ 2.99.0)              | `gh` OAuth/PAT, write access | Yes      | Yes (`user-attachments`) | No documented deletion or expiry           | Only repo members can view ([docs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)) | Low; first-party. No `ghs_` tokens or GHES    |
| Direct `uploads.github.com` `curl`      | Same token                   | Yes      | Yes                      | Same                                       | Same                                                                                                                                           | Medium; undocumented endpoint                 |
| Browser-cookie tools                    | `user_session` cookie        | Fragile  | Yes                      | Same                                       | Same                                                                                                                                           | High; session theft, against Terms/AUP spirit |
| Orphan branch, raw URL                  | Push access                  | Yes      | Yes (public)             | Until branch deleted; SHA URLs last longer | Broken (Camo can't authenticate)                                                                                                               | Low; repo bloat, pre-push hook                |
| Blob `?raw=true` (branch or hidden ref) | Push access                  | Yes      | Yes                      | Until ref deleted / objects pruned         | Works for viewers with read access                                                                                                             | Low; repo bloat                               |
| PR-branch commit                        | Push access                  | Yes      | Yes                      | Permanent in history                       | Same as above                                                                                                                                  | Medium; pollutes `main`                       |
| Release assets                          | Push access                  | Yes      | Public only              | Until release deleted                      | Broken                                                                                                                                         | Low; clutters Releases                        |
| Gist                                    | `gist` scope                 | Git only | Public-ish               | Until gist deleted                         | Not private                                                                                                                                    | Medium; exposure                              |
| S3/R2/imgur                             | Separate credentials         | Yes      | Yes                      | Host policy; presigned ≤ 7 days            | Public URL                                                                                                                                     | Medium; privacy, link rot                     |

## 6. Recommendation

Use `gh --attach`. It is first-party, works headless with the existing `gho_`
token and admin access, renders inline, keeps images out of git history, and
would still work if the repo became private. Update `agents.md` to say this.
Keep the orphan-branch method only as a fallback, for when `gh` is older than
2.99.0 or the token is a GitHub App installation token.

**Main flow.** Write the body with absolute local paths and pass the same paths
to `--attach`. Absolute paths avoid relying on the working directory, which is
what references are resolved against.

```sh
SHOTS=/tmp/ww-shots            # before-*.png / after-*.png, sips -Z 1000
cat > "$SHOTS/body.md" <<EOF
## Screenshots

| Before | After |
| --- | --- |
| ![Buddy detail before]($SHOTS/before-buddy-detail.png) | ![Buddy detail after]($SHOTS/after-buddy-detail.png) |
EOF

gh pr create --title "…" --body-file "$SHOTS/body.md" \
  --attach "$SHOTS/before-buddy-detail.png" \
  --attach "$SHOTS/after-buddy-detail.png"
# For an existing PR, swap in: gh pr edit <N> --body-file … --attach …
# (--body-file replaces the whole body).

# Check: no local paths left, and every image is now a user-attachments URL.
gh pr view <N> --json body -q .body | grep -E "$SHOTS|user-attachments"
```

Caveats: give each file a unique name, because the same file can't be passed
twice. Run `gh --version` first and require 2.99.0 or later. Don't use HTML
`<img>` with local paths, since only Markdown references are rewritten. If the
table cells aren't rewritten, the images are appended below the body; then
rewrite the body using the URLs `gh` printed. Delete `$SHOTS` when done.

**Fallback (no worktree checkout).** Publish to `pr-screenshots` with git
plumbing and a temporary index. This was tested locally up to `commit-tree`;
the agent's worktree status didn't change. Nothing was pushed.

```sh
DIR=$(git branch --show-current)            # e.g. feat/buddy-detail-screen-redesign
git fetch origin pr-screenshots 2>/dev/null || true
PARENT=$(git rev-parse -q --verify refs/remotes/origin/pr-screenshots || true)
export GIT_INDEX_FILE="$(mktemp -d)/index"
if [ -n "$PARENT" ]; then git read-tree "$PARENT"; else git read-tree --empty; fi
for f in /tmp/ww-shots/*.png; do
  git update-index --add --cacheinfo "100644,$(git hash-object -w "$f"),$DIR/$(basename "$f")"
done
TREE=$(git write-tree)
if [ -n "$PARENT" ]; then COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "Screenshots for $DIR")
else COMMIT=$(git commit-tree "$TREE" -m "Screenshots for $DIR"); fi
unset GIT_INDEX_FILE
git push origin "$COMMIT:refs/heads/pr-screenshots"   # runs .husky/pre-push; retry from fetch if rejected
echo "https://raw.githubusercontent.com/leviFrosty/witness-work/$COMMIT/$DIR/<file>.png"
```

Link with the commit SHA rather than `pr-screenshots`, so the image doesn't
change when files are overwritten and isn't cached stale. If the repo ever goes
private, use `https://github.com/leviFrosty/witness-work/blob/$COMMIT/$DIR/<file>.png?raw=true`
instead of the raw URL.

## Observations and unverified points

- Rendering sample Markdown with `POST /markdown` (no side effects) returned
  `user-attachments` images as `private-user-images.githubusercontent.com` URLs
  carrying a JWT valid for 300 seconds. It left `raw.githubusercontent.com` URLs
  unproxied. The web UI may render differently; this was not checked in a
  browser.
- No GitHub documentation says whether `user-attachments` assets can be deleted
  or how long they are kept.
- Rewriting inside table cells and the exact auth header for direct `curl`
  uploads were not tested, because that would mean uploading.
