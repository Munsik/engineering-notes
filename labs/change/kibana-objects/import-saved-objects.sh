#!/usr/bin/env bash
# 사용: import-saved-objects.sh <file.ndjson>
set -euo pipefail
r="$(curl -sf -X POST "$KIBANA_URL/s/${SPACE:-default}/api/saved_objects/_import?overwrite=true" \
  -H "Authorization: ApiKey $KIBANA_API_KEY" -H 'kbn-xsrf: true' -F file=@"$1")"
jq '{success, successCount, errors: [.errors[]? | {id, type, error: .error.type}]}' <<<"$r"
[ "$(jq -r '.success' <<<"$r")" = "true" ]
