#!/usr/bin/env bash
# 사용: drift.sh <env>   Git과 다른 dashboard와 마지막 수정 정보
set -euo pipefail
source "environments/$1.env"
found=0
for f in dashboards/*.json; do
  id="$(basename "$f" .json)"
  live="$(curl -sf "$KIBANA_URL/s/$SPACE/api/dashboards/$id" -H "Authorization: ApiKey $KIBANA_API_KEY")"
  if ! diff -q <(jq -S . "$f") <(jq -S '.data' <<<"$live") > /dev/null; then
    echo "DRIFT $id updated_at=$(jq -r '.meta.updated_at' <<<"$live") updated_by=$(jq -r '.meta.updated_by' <<<"$live")"
    found=1
  fi
done
exit $found
