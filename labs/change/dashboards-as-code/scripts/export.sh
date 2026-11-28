#!/usr/bin/env bash
# 사용: export.sh <dashboard-id> [space]
set -euo pipefail
ID="$1"; SPACE="${2:-${SPACE:-default}}"
curl -sf "$KIBANA_URL/s/$SPACE/api/dashboards/$ID" -H "Authorization: ApiKey $KIBANA_API_KEY" \
  | jq -S '.data' > "dashboards/$ID.json"
echo "saved dashboards/$ID.json"
