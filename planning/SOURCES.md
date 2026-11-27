# 출처 기준

이 사이트의 글은 회사의 공식 가이드가 아니라 개인 경험에 기반한 글입니다.
그렇지만 사실관계는 누구나 확인할 수 있는 공개 출처로 뒷받침해야 합니다. 독자가 링크를 눌러 직접 확인할 수 있어야 하기 때문입니다.

## 출처 등급

| 등급 | 출처 | 글에서 쓰는 방법 |
| --- | --- | --- |
| A | Elastic 공식 문서 `https://www.elastic.co/docs/...`, API reference, release notes, known issues | 사실의 1차 근거. 기본값, 제약, 기능 상태(GA, preview, planned)는 반드시 A로 확인 |
| B | Elastic 공식 블로그: Search Labs, Observability Labs, Security Labs, `https://www.elastic.co/blog/...` | 설계 의도, 사용 예, 벤치마크 맥락. 수치는 조건(baseline, 데이터, 버전)과 함께 인용 |
| C | 공개 소스 코드와 공개 이슈: `github.com/elastic/*` public 저장소 | 문서에 없는 동작의 근거. 커밋이나 파일 경로, 확인한 브랜치를 함께 적음 |
| D | 직접 실행한 결과: 이 저장소의 `labs/` | 측정값. 환경, 버전, 데이터, 설정을 함께 적고 재현 가능하게 둠 |
| E | 커뮤니티: discuss.elastic.co, 개인 블로그 등 | 단독 근거로 쓰지 않음. 쓰더라도 "확인 필요"를 붙이고 D로 재현을 시도 |

## 쓰면 안 되는 출처 (참고만 가능)

아래 자료는 주제를 고르거나 논리를 점검하는 데 참고만 하고, 글과 이 저장소에 직접 넣지 않습니다.
인용, 링크, 수치, 사례 묘사, 표현 차용 모두 해당합니다.

- 사내 메신저, 사내 위키, 사내 문서 저장소, 비공개 GitHub 저장소
- support 케이스, 내부 KB, 내부 에스컬레이션과 엔지니어링 이슈
- 내부 벤치마크, 내부 battlecard, 내부 교육 자료
- 발표 전 로드맵, 가격과 할인, 계약 정보
- 고객이나 파트너를 알아볼 수 있는 모든 정보(이름, 규모 조합, 고유한 구성)

참고한 내부 자료에서 얻은 아이디어를 글에 쓰고 싶다면, 같은 내용을 A~D 출처로 다시 확인할 수 있을 때만 씁니다.
다시 확인할 수 없으면 쓰지 않습니다.

## 현장 경험을 쓰는 방법

- 업종 수준으로만 씁니다. 예: "금융권 self-managed 환경", "대규모 제조 현장".
- 특정 환경을 알아볼 수 있는 조합(업종 + 규모 + 시기 + 구성)을 함께 쓰지 않습니다.
- 경험에서 나온 판단은 따로 표시하지 않습니다. 사실에는 출처를 달아 구분합니다(2026-11-27 결정).
- 경험담에 나오는 수치는 labs에서 재현한 값만 씁니다. 재현하지 않은 수치는 쓰지 않습니다.

## 글 안에서 출처를 적는 방법

- 문서 맨 위 `기준과 전제`에 기준 버전과 공식 문서를 확인한 날짜를 적습니다.
- 공식 문서의 내용은 본문에 링크를 겁니다. 수치는 그 수치가 나온 조건과 함께 적습니다.
- 소스 코드로 확인한 내용은 저장소, 브랜치, 파일 경로를 적습니다.
- labs 측정값은 `labs/` 경로를 링크하고 "실측"이라고 표시합니다. 설명을 위한 값은 "예시 값"이라고 표시합니다.
- 공식 문서로 확인하지 못한 내용에는 "확인 필요"를 붙입니다.

## 확인한 공식 URL

2026-11-25에 모두 HTTP 200을 확인했습니다. 존재하지 않는 경로는 404를 돌려주는 것도 함께 확인했습니다.
글을 쓸 때 내용과 기능 상태를 다시 읽고, 발행 직전에 링크를 한 번 더 확인합니다.

### 데이터 설계와 저장

- [Logs data streams](https://www.elastic.co/docs/manage-data/data-store/data-streams/logs-data-stream)
- [Configure a logs data stream](https://www.elastic.co/docs/manage-data/data-store/data-streams/logs-data-stream-configure)
- [Enable logsdb for integrations](https://www.elastic.co/docs/manage-data/data-store/data-streams/logs-data-stream-integrations)
- [_source field](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/mapping-source-field)
- [Columnar index mode](https://www.elastic.co/docs/reference/elasticsearch/columnar)
- [Analyze the index disk usage API](https://www.elastic.co/docs/api/elasticsearch/operation/operation-indices-disk-usage)
- [Size your shards](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/size-shards)
- [Tune for indexing speed](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/indexing-speed)
- [Hot spotting](https://www.elastic.co/docs/troubleshoot/elasticsearch/hotspotting)
- [Total number of shards for an index on a single node exceeded](https://www.elastic.co/docs/troubleshoot/elasticsearch/increase-shard-limit)
- [Data tiers](https://www.elastic.co/docs/manage-data/lifecycle/data-tiers)
- [ILM searchable snapshot action](https://www.elastic.co/docs/reference/elasticsearch/index-lifecycle-actions/ilm-searchable-snapshot)
- [Snapshot and restore](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore)
- [Searchable snapshots](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/searchable-snapshots)
- [Restore searchable snapshot data to a regular index](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/restore-searchable-snapshot-to-regular-index)
- [Security: Set rule data sources (cold, frozen 제외)](https://www.elastic.co/docs/solutions/security/detect-and-alert/set-rule-data-sources)
- Search Labs: [LogsDB index mode](https://www.elastic.co/search-labs/blog/elasticsearch-logsdb-index-mode)
- Search Labs: [Columnar storage](https://www.elastic.co/search-labs/blog/elasticsearch-columnar-storage)
- Search Labs: [S3 Glacier archiving with Deepfreeze](https://www.elastic.co/search-labs/blog/s3-glacier-archiving-elasticsearch-deepfreeze)

### 수집

- [Ingest pipelines](https://www.elastic.co/docs/manage-data/ingest/transform-enrich/ingest-pipelines)
- [Failure store](https://www.elastic.co/docs/manage-data/data-store/data-streams/failure-store)
- [Using Logstash with Elastic integrations](https://www.elastic.co/docs/reference/logstash/using-logstash-with-elastic-integrations)
- [Reference architecture: Logstash to Elasticsearch](https://www.elastic.co/docs/manage-data/ingest/ingest-reference-architectures/ls-for-input)
- [Rotate SSL/TLS CA certificates (Fleet)](https://www.elastic.co/docs/reference/fleet/certificates-rotation)
- [Upgrade Elastic Agents](https://www.elastic.co/docs/reference/fleet/upgrade-elastic-agent)
- [Configure SSL/TLS for self-managed Fleet Servers](https://www.elastic.co/docs/reference/fleet/secure-connections)
- [Deploy on-premises and self-managed Fleet Server](https://www.elastic.co/docs/reference/fleet/add-fleet-server-on-prem)
- [Elasticsearch output (Elastic Agent)](https://www.elastic.co/docs/reference/fleet/elasticsearch-output)
- [Fleet Server known issues](https://www.elastic.co/docs/release-notes/fleet-server/known-issues)

### 클러스터 안정성

- [High JVM memory pressure](https://www.elastic.co/docs/troubleshoot/elasticsearch/high-jvm-memory-pressure)
- [Circuit breaker errors](https://www.elastic.co/docs/troubleshoot/elasticsearch/circuit-breaker-errors)
- [Rejected requests](https://www.elastic.co/docs/troubleshoot/elasticsearch/rejected-requests)
- [Important settings configuration](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/important-settings-configuration)
- [Important system configuration](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/important-system-configuration)
- [Design for resilience](https://www.elastic.co/docs/deploy-manage/production-guidance/availability-and-resilience)
- [Red or yellow cluster health status](https://www.elastic.co/docs/troubleshoot/elasticsearch/red-yellow-cluster-status)
- [Diagnose unassigned shards](https://www.elastic.co/docs/troubleshoot/elasticsearch/diagnose-unassigned-shards)
- [Using the cluster allocation API for troubleshooting](https://www.elastic.co/docs/troubleshoot/elasticsearch/cluster-allocation-api-examples)
- [Query DSL (search.allow_expensive_queries)](https://www.elastic.co/docs/reference/query-languages/querydsl)
- [Search shard routing (action.search.shard_count.limit)](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/search-shard-routing)
- [Query logging](https://www.elastic.co/docs/deploy-manage/monitor/logging-configuration/query-logs)
- [Slow query and index logging](https://www.elastic.co/docs/deploy-manage/monitor/logging-configuration/slow-logs)
- [ES|QL limitations](https://www.elastic.co/docs/reference/query-languages/esql/limitations)
- [Capture diagnostics](https://www.elastic.co/docs/troubleshoot/elasticsearch/diagnostic)
- [Health report API](https://www.elastic.co/docs/api/elasticsearch/operation/operation-health-report)
- GitHub: [elastic/support-diagnostics](https://github.com/elastic/support-diagnostics)

### 변화 관리

- [Prepare to upgrade](https://www.elastic.co/docs/deploy-manage/upgrade/prepare-to-upgrade)
- [Upgrade from 7.17](https://www.elastic.co/docs/deploy-manage/upgrade/deployment-or-cluster/upgrade-717)
- [Upgrade your deployment on ECE](https://www.elastic.co/docs/deploy-manage/upgrade/deployment-or-cluster/upgrade-on-ece)
- [Reindex data stream API](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reindex-data-stream)
- [Reindex indices examples (remote 포함)](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reindex-indices)
- [Reindex from a self-managed cluster using a private CA](https://www.elastic.co/docs/manage-data/migrate/migrate-from-a-self-managed-cluster-with-a-self-signed-certificate-using-remote-reindex)
- [Elasticsearch release notes](https://www.elastic.co/docs/release-notes/elasticsearch)
- [Elasticsearch known issues](https://www.elastic.co/docs/release-notes/elasticsearch/known-issues)
- [Product security (security advisories)](https://www.elastic.co/product-security)

### 탐지와 알림

- [Anomaly detection](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection)
- [Generating alerts for anomaly detection jobs](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-configuring-alerts)
- [Kibana Universal Alerting overview](https://www.elastic.co/docs/explore-analyze/alerting/esql/system-overview)
- [Configure a rule in Kibana Universal Alerting](https://www.elastic.co/docs/explore-analyze/alerting/esql/rules/configure-a-rule)
- [Create a rule and observe the alert lifecycle](https://www.elastic.co/docs/explore-analyze/alerting/esql/get-started/create-your-first-rule)
- Observability Labs: [Kibana Universal Alerting](https://www.elastic.co/observability-labs/blog/kibana-universal-alerting)
- Observability Labs: [Using anomaly detection to identify fraud](https://www.elastic.co/observability-labs/blog/anomaly-detection-to-identify-fraud)
- Observability Labs: [AI-driven incident response with logs](https://www.elastic.co/observability-labs/blog/ai-driven-incident-response-with-logs)

### 검색

- [Ranking evaluation](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/search-rank-eval)
- [Korean (nori) analysis plugin](https://www.elastic.co/docs/reference/elasticsearch/plugins/analysis-nori)
- [nori_readingform token filter](https://www.elastic.co/docs/reference/elasticsearch/plugins/analysis-nori-readingform)
- [Semantic search with the inference API](https://www.elastic.co/docs/solutions/search/semantic-search/semantic-search-inference)
- [Dense vector field type](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/dense-vector)
- [Dense vector search](https://www.elastic.co/docs/solutions/search/vector/dense-vector)
- Search Labs: [When hybrid search truly shines](https://www.elastic.co/search-labs/blog/elasticsearch-hybrid-search)
- Search Labs: [Search relevance tuning: balancing keyword and semantic search](https://www.elastic.co/search-labs/blog/search-relevance-tuning-in-semantic-search)
- Search Labs: [Search analytics with OpenTelemetry (series)](https://www.elastic.co/search-labs/blog/series/search-analytics-opentelemetry)
