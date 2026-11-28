#!/usr/bin/env bash
# 09. 구성 요소 버전 인벤토리. 결과를 날짜별 파일로 남긴다.
# 필요: curl, jq. 환경 변수: ES_URL, KIBANA_URL, API_KEY(읽기 권한)
set -euo pipefail
out="inventory-$(date +%F).md"
auth=(-H "Authorization: ApiKey ${API_KEY}")
{
  echo "# 버전 인벤토리 $(date '+%F %T %Z')"
  echo
  echo "## Elasticsearch 노드"
  echo "| node | version | jvm | bundled jdk | os |"
  echo "| --- | --- | --- | --- | --- |"
  curl -sf "${auth[@]}" "$ES_URL/_nodes?filter_path=nodes.*.name,nodes.*.version,nodes.*.jvm.version,nodes.*.jvm.using_bundled_jdk,nodes.*.os.pretty_name" \
    | jq -r '.nodes[] | "| \(.name) | \(.version) | \(.jvm.version) | \(.jvm.using_bundled_jdk) | \(.os.pretty_name) |"'
  echo
  echo "## Elasticsearch plugin"
  curl -sf "${auth[@]}" "$ES_URL/_cat/plugins?h=name,component,version" | sed 's/^/    /'
  echo
  echo "## Kibana"
  curl -sf "${auth[@]}" "$KIBANA_URL/api/status" | jq -r '"- version: \(.version.number), build: \(.version.build_hash // "-")"'
  echo
  echo "## Fleet Agent 버전 분포"
  page=1; tmp="$(mktemp)"
  while :; do
    r="$(curl -sf "${auth[@]}" "$KIBANA_URL/api/fleet/agents?perPage=1000&page=$page")"
    jq -r '.items[].local_metadata.elastic.agent.version' <<<"$r" >> "$tmp"
    [ "$(jq '.items | length' <<<"$r")" -lt 1000 ] && break
    page=$((page+1))
  done
  sort "$tmp" | uniq -c | awk '{print "- " $2 ": " $1 "대"}'
  rm -f "$tmp"
} > "$out"
echo "saved: $out"
