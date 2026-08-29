#!/usr/bin/env bash

set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "NAT008 Linux Secret Service proof requires Linux." >&2
  exit 1
fi

runtime_base="$(realpath -m "${RUNNER_TEMP:-/tmp}")"
runtime_root="$(mktemp -d "$runtime_base/coredrill-nat008-keyring.XXXXXX")"
runtime_root="$(realpath -m "$runtime_root")"
if [[ "$runtime_root" != "$runtime_base"/coredrill-nat008-keyring.* ]]; then
  echo "Refusing to create the Secret Service proof outside the scoped runtime directory." >&2
  exit 1
fi
chmod 700 "$runtime_root"
export XDG_RUNTIME_DIR="$runtime_root"

cleanup() {
  gnome-keyring-daemon --stop >/dev/null 2>&1 || true
  if [[ "$runtime_root" == "$runtime_base"/coredrill-nat008-keyring.* ]]; then
    for attempt in 1 2 3 4 5; do
      if rm -rf -- "$runtime_root" 2>/dev/null && [[ ! -e "$runtime_root" ]]; then
        return
      fi
      sleep 0.2
    done

    echo "Failed to remove the scoped Secret Service proof directory." >&2
    return 1
  fi
}
trap cleanup EXIT

daemon_environment="$(printf '\n' | gnome-keyring-daemon --unlock --components=secrets)"
while IFS='=' read -r key value; do
  case "$key" in
    GNOME_KEYRING_CONTROL | SSH_AUTH_SOCK)
      export "$key=$value"
      ;;
  esac
done <<<"$daemon_environment"

COREDRILL_SECRET_PROOF_REQUIRED=true pnpm test:secure-storage
