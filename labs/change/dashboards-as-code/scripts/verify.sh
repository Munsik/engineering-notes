#!/usr/bin/env bash
# 사용: verify.sh <env>   배포 뒤 되읽어 Git 정의와 비교
set -euo pipefail
source "environments/$1.env"
rc=0
for f in dashboards/*.json; do
  id="$(basename "$f" .json)"
  if ! diff <(jq -S . "$f") \
       <(curl -sf "$KIBANA_URL/s/$SPACE/api/dashboards/$id" -H "Authorization: ApiKey $KIBANA_API_KEY" | jq -S '.data'); then
    echo "MISMATCH $id"; rc=1
  else
    echo "MATCH    $id"
  fi
done
exit $rc
