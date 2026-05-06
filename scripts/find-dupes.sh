#!/usr/bin/env bash

find-dupes() {
  local root="${1:-.}"
  local lang="${2:-typescript}"
  local min_tokens="${3:-100}"

  local filelist
  filelist="$(mktemp)"
  trap 'rm -f "'"$filelist"'"' RETURN

  git -C "$root" ls-files -z --cached --others --exclude-standard |
    rg --null-data -v '/node_modules/' |
    perl -0pe "s|^|$root/|" |
    xargs -0 -I{} sh -c '[ -f "{}" ] && printf "%s\n" "{}"' \
      >"$filelist"

  if [ ! -s "$filelist" ]; then
    echo "cpd: no files found in $root for language $lang" >&2
    return 1
  fi

  pmd cpd --minimum-tokens "$min_tokens" --language "$lang" --file-list "$filelist"
}

export -f find-dupes
 