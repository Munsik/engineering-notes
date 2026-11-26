#!/usr/bin/env bash
# 09. 폐쇄망 점검: support diagnostic 도구를 쓸 수 없을 때 같은 종류의 정보를 직접 모은다.
# 모든 호출은 GET(읽기 전용)이다. 결과는 OUT 디렉터리에 API 이름별 파일로 남는다.
#
# 사용:
#   ES_URL=https://localhost:9200 ES_API_KEY=<base64 key> ./offline-collect.sh
#   ES_URL=https://localhost:9200 ES_USER=elastic ./offline-collect.sh   # 비밀번호는 프롬프트로 입력
# 인증서 검증을 끄려면 CURL_INSECURE=1
set -u

ES_URL="${ES_URL:-https://localhost:9200}"
OUT="${OUT:-es-collect-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT"

CURL=(curl -sS --max-time 120)
[ "${CURL_INSECURE:-0}" = "1" ] && CURL+=(-k)
if [ -n "${ES_API_KEY:-}" ]; then
  CURL+=(-H "Authorization: ApiKey ${ES_API_KEY}")
elif [ -n "${ES_USER:-}" ]; then
  read -r -s -p "password for ${ES_USER}: " ES_PASS; echo
  CURL+=(-u "${ES_USER}:${ES_PASS}")
fi

# 파일 이름|경로
APIS=(
  "version|/"
  "health_report|/_health_report"
  "cluster_health|/_cluster/health"
  "cluster_settings|/_cluster/settings?flat_settings=true"
  "cluster_settings_defaults|/_cluster/settings?include_defaults=true&flat_settings=true"
  "cluster_stats|/_cluster/stats?human"
  "cluster_pending_tasks|/_cluster/pending_tasks"
  "allocation_explain|/_cluster/allocation/explain"
  "nodes|/_nodes?human"
  "nodes_stats|/_nodes/stats?human"
  "nodes_hot_threads|/_nodes/hot_threads?threads=10000"
  "cat_nodes|/_cat/nodes?v&h=name,node.role,master,version,heap.percent,ram.percent,cpu,load_1m,load_5m,disk.used_percent,uptime&s=name"
  "cat_master|/_cat/master?v"
  "cat_allocation|/_cat/allocation?v&s=node"
  "cat_thread_pool|/_cat/thread_pool?v&h=node_name,name,active,queue,rejected,completed&s=node_name,name"
  "cat_shards|/_cat/shards?v&h=index,shard,prirep,state,docs,store,node,unassigned.reason&s=index"
  "cat_indices|/_cat/indices?v&expand_wildcards=all&s=index"
  "cat_recovery|/_cat/recovery?v&active_only=true"
  "cat_pending_tasks|/_cat/pending_tasks?v"
  "cat_circuit_breaker|/_cat/circuit_breaker?v"
  "tasks|/_tasks?human&detailed=true"
  "indices_stats|/_stats?level=shards&human&expand_wildcards=all&ignore_unavailable=true"
  "settings|/_settings?human&expand_wildcards=all"
  "mapping|/_mapping?expand_wildcards=all"
  "index_templates|/_index_template"
  "component_templates|/_component_template"
  "data_stream|/_data_stream?expand_wildcards=all"
  "ilm_status|/_ilm/status"
  "ilm_explain_only_errors|/*/_ilm/explain?only_errors=true&human&expand_wildcards=all"
  "ilm_policies|/_ilm/policy"
  "slm_status|/_slm/status"
  "slm_stats|/_slm/stats"
  "slm_policies|/_slm/policy"
  "repositories|/_snapshot"
  "pipelines|/_ingest/pipeline"
  "license|/_license"
  "nodes_shutdown|/_nodes/shutdown"
)

for entry in "${APIS[@]}"; do
  name="${entry%%|*}"
  path="${entry#*|}"
  "${CURL[@]}" "${ES_URL}${path}" -o "${OUT}/${name}.txt" -w "${name} %{http_code}\n" \
    || echo "${name} failed" >&2
done | tee "${OUT}/_status.txt"

# OS 정보(Elasticsearch가 도는 호스트에서 실행할 때만 의미 있음)
{
  echo "## uname";   uname -a
  echo "## sysctl";  sysctl vm.max_map_count vm.swappiness net.ipv4.tcp_retries2 net.ipv4.tcp_keepalive_time 2>/dev/null
  echo "## swap";    swapon --show 2>/dev/null
  echo "## memory";  free -m 2>/dev/null
  echo "## disk";    df -h 2>/dev/null
  echo "## dmesg";   dmesg -T 2>/dev/null | grep -i -E 'killed process|out of memory|i/o error' | tail -50
} > "${OUT}/os.txt" 2>&1

echo "saved to ${OUT}"
