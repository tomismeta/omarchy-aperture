#!/bin/bash

set -euo pipefail

plugin_id="@tomismeta/aperture-omp"
payload_dir="${APERTURE_ATTENTION_DEV_PAYLOAD_DIR:-}"

fail() {
  printf 'aperture-omp-remove (development): %s\n' "$1" >&2
  exit 1
}

[[ $payload_dir == /* ]] ||
  fail "set APERTURE_ATTENTION_DEV_PAYLOAD_DIR to an absolute development payload"

expected_target=$(realpath -e "$payload_dir/integrations/omp") ||
  fail "development OMP integration directory is missing"

found_root=""
for candidate in "${XDG_DATA_HOME:+$XDG_DATA_HOME/omp/plugins}" "$HOME/.omp/plugins"; do
  [[ -n $candidate ]] || continue
  [[ $candidate != "$found_root" ]] || continue
  link="$candidate/node_modules/@tomismeta/aperture-omp"
  if [[ -L $link ]]; then
    [[ -z $found_root ]] || fail "OMP integration link exists in more than one plugin root"
    found_root="$candidate"
  fi
done

[[ -n $found_root ]] || fail "managed OMP integration symlink was not found"
plugin_link="$found_root/node_modules/@tomismeta/aperture-omp"
actual_target=$(readlink -f "$plugin_link") || fail "could not resolve OMP integration symlink"
[[ $actual_target == "$expected_target" ]] ||
  fail "refusing to remove OMP integration link with unexpected target: $actual_target"

lock_file="$found_root/omp-plugins.lock.json"
[[ -f $lock_file && ! -L $lock_file ]] || fail "OMP plugin lock file is missing or unsafe"

omp plugin disable "$plugin_id" >/dev/null

lock_mode=$(stat -c '%a' "$lock_file")
lock_tmp=$(mktemp "$found_root/.omp-plugins.lock.json.XXXXXX")
cleanup() {
  rm -f "$lock_tmp"
}
trap cleanup EXIT

jq --arg id "$plugin_id" '
  del(.plugins[$id])
  | del(.settings[$id])
' "$lock_file" >"$lock_tmp"
jq -e 'type == "object" and (.plugins | type == "object") and (.settings | type == "object")' \
  "$lock_tmp" >/dev/null
chmod "$lock_mode" "$lock_tmp"

rm -- "$plugin_link"
if ! mv -f -- "$lock_tmp" "$lock_file"; then
  ln -s -- "$expected_target" "$plugin_link"
  fail "lock update failed; restored verified integration symlink"
fi
trap - EXIT

if omp plugin list --json | jq -e --arg id "$plugin_id" \
  'any(.npm[]?; .name == $id)' >/dev/null; then
  fail "OMP still reports the removed integration"
fi

printf 'Removed development OMP integration: %s\n' "$expected_target"
