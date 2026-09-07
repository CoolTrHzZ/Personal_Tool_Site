#!/usr/bin/env bash
set -euo pipefail

command -v node >/dev/null || { echo '请先安装 Node.js 22+（含 npm）和 Git。' >&2; exit 1; }
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]:-.}")" && pwd)"
if [[ -f "${BASH_SOURCE[0]:-}" && -f "$script_dir/deploy.mjs" ]]; then
  exec node "$script_dir/deploy.mjs" "$@"
fi

command -v curl >/dev/null || { echo '请先安装 curl。' >&2; exit 1; }
deploy_tmp="$(mktemp -d)"
trap 'rm -rf -- "$deploy_tmp"' EXIT
curl --fail --location --silent --show-error --retry 2 --connect-timeout 15 \
  'https://raw.githubusercontent.com/CoolTrHzZ/Personal_Tool_Site/main/deploy.mjs' -o "$deploy_tmp/deploy.mjs"
node "$deploy_tmp/deploy.mjs" "$@"
