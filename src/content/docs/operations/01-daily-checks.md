---
title: "평소에 무엇을 보고 있어야 하는가"
description: health report API로 클러스터 상태를 한 번에 읽는 법, 공식 문서에 나온 임계값(heap 85%, parent breaker 95%, 디스크 85, 90, 95%, GC 기준)으로 알림을 거는 법, 매일, 매주, 매월 점검표와 모니터링 도구 선택을 정리합니다.
sidebar:
  label: 01. 평소 점검
  order: 1
---

장애 대부분은 갑자기 오지 않습니다. heap이 몇 주에 걸쳐 올라가고, 디스크가 매일 조금씩 차고, shard 수가 rollover마다 늘어납니다.
문제는 이런 징후를 아무도 보고 있지 않다는 점입니다. 장애가 난 뒤 모니터링 화면을 열어 보면 대개 몇 주 전부터 징후가 있었습니다.
평소에 무엇을, 어떤 기준으로, 얼마나 자주 봐야 하는지 정리했습니다.

:::note[기준]
- Elasticsearch 9.x 기준입니다. 공식 문서는 2026년 11월에 다시 확인했습니다.
- 명령 모음은 [`labs/operations/daily-checks.console`](https://github.com/Munsik/engineering-notes/blob/main/labs/operations/daily-checks.console)에 있습니다.
:::

## 한 번에 보기: health report

`GET _health_report`는 클러스터 상태를 indicator별로 나눠 green, yellow, red와 원인, 영향, 조치 방법을 함께 돌려줍니다. `_cluster/health`가 shard 할당 상태만 알려 주는 것과 달리, 디스크, shard 용량, master 안정성, ILM, SLM, repository 같은 항목을 함께 봅니다([Health report API](https://www.elastic.co/docs/api/elasticsearch/operation/operation-health-report)).

```console
GET _health_report?verbose=false
GET _health_report/disk
GET _health_report/shards_capacity
```

indicator 이름은 경로에 하나씩 넣습니다. `disk,shards_capacity`처럼 여러 개를 쉼표로 이으면 404가 납니다(로컬 9.5.5 확인).

- `verbose=false`는 원인 분석 없이 상태만 빨리 돌려줍니다. 자주 부르는 모니터링 스크립트에 씁니다.
- 상태가 green이 아닌 indicator만 상세 조회해 `diagnosis`의 조치 방법을 읽습니다.

## 지켜볼 지표와 임계값

공식 문서에 수치가 있는 것만 모았습니다.

| 지표 | 기준 | 근거 |
| --- | --- | --- |
| JVM heap 사용률 | 계속 85%를 넘으면 메모리 압박을 줄이는 조치 | [High JVM memory pressure](https://www.elastic.co/docs/troubleshoot/elasticsearch/high-jvm-memory-pressure) |
| parent circuit breaker | 실제 메모리 기준 사용 시 heap의 95%에서 요청 거부(429) | [Circuit breaker settings](https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/circuit-breaker-settings) |
| Young GC | 완료 50ms 미만, 대략 10초에 한 번 | High JVM memory pressure |
| Old GC | 완료 1초 미만, 10분에 한 번 이하 | 같은 문서 |
| 디스크 | 85% low, 90% high, 95% flood-stage. 큰 디스크는 남은 공간 상한(200GB, 150GB, 100GB)이 먼저 적용([04](../04-disk-full/#큰-디스크에서는-남은-공간이-기준이-된다)) | [Watermark errors](https://www.elastic.co/docs/troubleshoot/elasticsearch/fix-watermark-errors) |
| shard 크기 | 10GB에서 50GB, 2억 건 미만 | [Size your shards](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/size-shards) |
| 노드당 shard | `cluster.max_shards_per_node` 기본 1,000(frozen 3,000) | [Miscellaneous cluster settings](https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/miscellaneous-cluster-settings) |
| master heap | heap 1GB당 index 3,000개 미만 | Size your shards |

공식 수치가 없는 항목은 제 기준입니다.

| 지표 | 기준 |
| --- | --- |
| thread pool rejection(`write`, `search`) | 0이 아니면 원인 확인. 늘어나는 추세면 알림 |
| pending cluster tasks | 계속 쌓이면 master 과부하 의심 |
| 노드 수 | 기대 노드 수와 다르면 즉시 알림 |
| 노드 uptime | 의도하지 않은 재시작(uptime이 갑자기 0)을 알림 |
| snapshot | 마지막 성공 snapshot이 정책 주기의 두 배보다 오래됨 |

## 점검표

### 매일

```console
GET _health_report?verbose=false
GET _cat/nodes?v&h=name,node.role,heap.percent,ram.percent,cpu,load_1m,disk.used_percent,uptime&s=name
GET _cat/thread_pool/write,search?v&h=node_name,name,active,queue,rejected&s=node_name
GET _cat/allocation?v&s=disk.percent:desc
```

- 노드 수, heap, 디스크, rejection을 봅니다.
- `uptime`이 짧은 노드가 있으면 재시작 원인을 확인합니다([03](../03-node-failure-triage/)).

### 매주

```console
GET _cluster/stats?filter_path=indices.count,indices.shards.total,indices.mappings.total_field_count,nodes.count
GET _cat/shards?v&h=index,shard,prirep,store,docs&s=store:desc&bytes=gb
GET _slm/stats
GET */_ilm/explain?only_errors=true
```

- 전체 shard 수가 노드당 한도에 얼마나 가까운지, 50GB를 넘는 shard가 있는지 봅니다.
- ILM 오류가 있는 index를 찾습니다. ILM이 멈추면 rollover가 안 돼 shard가 커지고 디스크가 찹니다.
- snapshot 실패 횟수를 봅니다.

### 매월

- 디스크 증가 추세로 언제 85%에 닿을지 계산합니다.
- 사용 중인 버전의 known issue와 보안 공지를 확인합니다([Elasticsearch known issues](https://www.elastic.co/docs/release-notes/elasticsearch/known-issues)). 예를 들어 9.5.0에서 9.5.2에는 디스크와 recovery에 영향을 주는 known issue가 있어 9.5.3 이상으로 올리라고 권합니다([04](../04-disk-full/#디스크가-이유-없이-늘-때)).
- 인증서와 라이선스 만료일을 확인합니다. TLS 인증서가 만료되면 노드 사이 연결과 클라이언트 연결이 한꺼번에 끊깁니다. `GET _ssl/certificates`는 노드가 읽은 인증서마다 만료 시각(`expiry`)을 돌려주고([SSL certificate API](https://www.elastic.co/docs/api/elasticsearch/operation/operation-ssl-certificates)), `GET _license`는 라이선스 만료 시각을 돌려줍니다. 만료 한두 달 전에 교체 일정을 잡습니다.
- 복원 연습을 합니다. snapshot이 있어도 복원해 본 적이 없으면 장애 때 시간을 잃습니다.

## 모니터링 도구

| 도구 | 특징 |
| --- | --- |
| AutoOps | 클러스터 지표를 분석해 문제와 권장 조치를 보여 줌. ECH와 Serverless는 지원 region에서 자동으로 켜짐. self-managed, ECE, ECK는 Cloud Connect로 연결([AutoOps for self-managed clusters](https://www.elastic.co/docs/deploy-manage/monitor/autoops/cc-autoops-as-cloud-connected)) |
| Stack Monitoring | 별도 monitoring 클러스터로 지표를 모아 Kibana에서 봄. 알림 규칙 기본 제공 |
| health report + 자체 스크립트 | 외부 연결이 없는 환경에서 최소한의 상태 점검 |

운영 클러스터의 지표는 운영 클러스터가 아닌 곳에 모읍니다. 운영 클러스터가 죽으면 그 안의 모니터링 데이터도 볼 수 없기 때문입니다. 공식 Stack Monitoring 문서도 운영 클러스터와 monitoring 클러스터를 분리한 구성을 전형적인 구조로 제시합니다([Stack Monitoring](https://www.elastic.co/docs/deploy-manage/monitor/stack-monitoring)).

## 판단 기준

| 상황 | 권장 |
| --- | --- |
| 외부 연결 가능 | AutoOps를 켜고, 알림을 운영 채널에 연결 |
| 폐쇄망 | 별도 monitoring 클러스터 + health report 스크립트, 09의 수동 점검 |
| 알림이 너무 많음 | 노드 수, health red, 디스크 90%, heap 85% 지속, rejection 증가만 먼저 |

## 참고 문서

- [Health report API](https://www.elastic.co/docs/api/elasticsearch/operation/operation-health-report)
- [High JVM memory pressure](https://www.elastic.co/docs/troubleshoot/elasticsearch/high-jvm-memory-pressure)
- [Circuit breaker settings](https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/circuit-breaker-settings)
- [Watermark errors](https://www.elastic.co/docs/troubleshoot/elasticsearch/fix-watermark-errors)
- [Size your shards](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/size-shards)
- [Miscellaneous cluster settings](https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/miscellaneous-cluster-settings)
- [Elasticsearch known issues](https://www.elastic.co/docs/release-notes/elasticsearch/known-issues)
- [SSL certificate API](https://www.elastic.co/docs/api/elasticsearch/operation/operation-ssl-certificates)
- [AutoOps for self-managed clusters](https://www.elastic.co/docs/deploy-manage/monitor/autoops/cc-autoops-as-cloud-connected)
- [Stack Monitoring](https://www.elastic.co/docs/deploy-manage/monitor/stack-monitoring)
