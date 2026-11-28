#!/usr/bin/env bash
# 사용: export-saved-objects.sh <type>[,<type>...] [out.ndjson]
set -euo pipefail
types="$(jq -Rc 'split(",")' <<<"$1")"; out="${2:-export.ndjson}"
curl -sf -X POST "$KIBANA_URL/s/${SPACE:-default}/api/saved_objects/_export" \
  -H "Authorization: ApiKey $KIBANA_API_KEY" -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  -d "{\"type\": $types, \"includeReferencesDeep\": true, \"excludeExportDetails\": true}" > "$out"
echo "exported $(wc -l < "$out") objects to $out"
