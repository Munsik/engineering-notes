#!/usr/bin/env bash
# 사용: deploy.sh <env>   environments/<env>.env 를 읽는다
set -euo pipefail
source "environments/$1.env"
fail=0
for f in dashboards/*.json; do
  id="$(basename "$f" .json)"
  resp="$(curl -s -w '\n%{http_code}' -X PUT "$KIBANA_URL/s/$SPACE/api/dashboards/$id" \
    -H "Authorization: ApiKey $KIBANA_API_KEY" -H 'kbn-xsrf: true' \
    -H 'Content-Type: application/json' --data-binary @"$f")"
  code="$(tail -n1 <<<"$resp")"; body="$(sed '$d' <<<"$resp")"
  if [[ "$code" != 200 && "$code" != 201 ]]; then
    echo "FAIL $id HTTP $code: $body"; fail=1; continue
  fi
  if [[ "$(jq '.warnings // [] | length' <<<"$body")" != 0 ]]; then
    echo "WARN $id (검증에 실패해 빠진 패널이나 속성)"; jq '.warnings' <<<"$body"; fail=1
  fi
  echo "OK   $id ($code)"
done
exit $fail
