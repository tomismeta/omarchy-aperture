#!/bin/bash

set -euo pipefail

root=$(mktemp -d)
trap '/bin/rm -rf "$root"' EXIT

launcher=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/aperture-attention-engine
payload="$root/payload"
empty_path="$root/empty-path"
fake_path="$root/fake-path"
fake_home="$root/home"
mkdir -p "$payload/lib" "$empty_path" "$fake_path" "$fake_home"
: >"$payload/lib/aperture-attention-engine.cjs"

pass() {
  printf 'ok - %s\n' "$1"
}

expect_status() {
  local expected="$1" label="$2"
  shift 2
  set +e
  "$@" >"$root/stdout" 2>"$root/stderr"
  local actual=$?
  set -e
  [[ $actual == "$expected" ]] || {
    printf 'not ok - %s: expected %s, got %s\n' "$label" "$expected" "$actual" >&2
    /bin/cat "$root/stderr" >&2
    exit 1
  }
  pass "$label"
}

expect_status 78 "launcher rejects missing Node" \
  /usr/bin/env APERTURE_ATTENTION_DEV_PAYLOAD_DIR="$payload" PATH="$empty_path" HOME="$fake_home" "$launcher"
[[ $(wc -l <"$root/stderr") == 1 && $(wc -c <"$root/stderr") -le 512 ]]
pass "launcher missing-Node error is one bounded line"

cat >"$fake_path/node" <<'NODE'
#!/bin/bash
if [[ ${1:-} == "--version" ]]; then
  printf 'v21.9.0\n'
  exit 0
fi
exit 99
NODE
chmod +x "$fake_path/node"
expect_status 78 "launcher rejects Node below 22" \
  /usr/bin/env APERTURE_ATTENTION_DEV_PAYLOAD_DIR="$payload" PATH="$fake_path" HOME="$fake_home" "$launcher"

cat >"$fake_path/node" <<'NODE'
#!/bin/bash
if [[ ${1:-} == "--version" ]]; then
  printf 'v22.23.2\n'
  exit 0
fi
printf '%s\n' "$$" >"$FAKE_NODE_PID_FILE"
printf '%s\0' "$@" >"$FAKE_NODE_ARGS_FILE"
NODE
chmod +x "$fake_path/node"

args_file="$root/args"
pid_file="$root/pid"
/usr/bin/env \
  APERTURE_ATTENTION_DEV_PAYLOAD_DIR="$payload" \
  FAKE_NODE_ARGS_FILE="$args_file" \
  FAKE_NODE_PID_FILE="$pid_file" \
  PATH="$fake_path" \
  HOME="$fake_home" \
  "$launcher" "alpha beta" "--flag=value" "" &
launcher_pid=$!
wait "$launcher_pid"
[[ $(<"$pid_file") == "$launcher_pid" ]]
pass "launcher exec replaces the wrapper process"

printf '%s\0' \
  "$payload/lib/aperture-attention-engine.cjs" \
  "alpha beta" \
  "--flag=value" \
  "" >"$root/expected-args"
cmp "$root/expected-args" "$args_file"
pass "launcher preserves every argument exactly"

mkdir -p "$fake_home/.local/share/mise/shims"
cp "$fake_path/node" "$fake_home/.local/share/mise/shims/node"
/usr/bin/env \
  APERTURE_ATTENTION_DEV_PAYLOAD_DIR="$payload" \
  FAKE_NODE_ARGS_FILE="$args_file" \
  FAKE_NODE_PID_FILE="$pid_file" \
  PATH="$empty_path" \
  HOME="$fake_home" \
  "$launcher"
pass "launcher falls back to the standard mise shim"

missing_payload="$root/missing-payload"
mkdir -p "$missing_payload"
expect_status 66 "launcher distinguishes a missing bundle" \
  /usr/bin/env APERTURE_ATTENTION_DEV_PAYLOAD_DIR="$missing_payload" PATH="$fake_path" HOME="$fake_home" "$launcher"
