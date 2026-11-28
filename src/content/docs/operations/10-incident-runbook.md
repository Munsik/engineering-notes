---
title: "장애가 났을 때 첫 30분에 무엇을 하는가"
description: 장애 알림을 받은 뒤 첫 30분 동안 영향 확인, 재시작 전 정보 보존, 증상별 분기, 완화 조치의 우선순위, 하지 말아야 할 조치, 로그인이 안 될 때의 file realm 사용자, 지원 요청에 붙일 정보, 사후 분석 양식을 순서대로 정리합니다.
sidebar:
  label: 10. 첫 30분
  order: 10
---

장애가 나면 가장 먼저 하고 싶은 일은 노드 재시작입니다. 실제로 재시작으로 증상이 사라지는 경우도 많습니다. 문제는 그 순간 원인을 알려 줄 정보도 함께 사라진다는 것입니다. hot threads, 실행 중인 task, 메모리 상태는 재시작 뒤에는 다시 볼 수 없고, 같은 장애는 다음 주에 또 납니다.
아래는 01에서 09까지의 진단 절차를 장애 시간 순서로 묶은 runbook입니다. 아래 순서와 시간 배분은 제가 쓰는 방법입니다.

:::note[기준]
- Elasticsearch 9.x, self-managed 기준입니다. 공식 문서는 2026년 11월에 다시 확인했습니다.
- 정보 보존용 명령은 [`labs/operations/incident-first-30min.console`](https://github.com/Munsik/engineering-notes/blob/main/labs/operations/incident-first-30min.console)과 [`offline-collect.sh`](https://github.com/Munsik/engineering-notes/blob/main/labs/operations/offline-collect.sh)에 있습니다.
:::

## 시간 순서

```mermaid
flowchart LR
    A["0에서 5분<br/>영향 확인<br/>기록 시작"] --> B["5에서 10분<br/>정보 보존<br/>재시작 전"]
    B --> C["10에서 20분<br/>증상별 분기<br/>원인 범위"]
    C --> D["20에서 30분<br/>완화 조치<br/>영향 줄이기"]
    D --> E["이후<br/>복구 확인<br/>지원 요청, 사후 분석"]
```

## 0에서 5분: 영향 확인

먼저 무엇이 안 되는지를 정합니다. 원인보다 영향이 먼저입니다. 영향에 따라 누구에게 알리고 무엇을 먼저 살릴지가 정해지기 때문입니다.

| 질문 | 확인 |
| --- | --- |
| 검색이 되나 | 대표 대시보드, 애플리케이션의 검색 요청 |
| 적재가 되나 | 소스별 마지막 수신 시각([수집 06](../../ingest/06-flow-dashboard/)), 수집기 queue |
| Kibana에 들어가지나 | 로그인, `.kibana`, `.security` 상태 |
| 범위는 | 클러스터 전체, 특정 index, 특정 사용자 |
| 언제부터 | 알림 시각, 모니터링 그래프가 꺾인 시각 |
| 최근에 바뀐 것은 | 배포, 설정 변경, 업그레이드, 인프라 작업 |

```console
GET _health_report?verbose=false
GET _cat/health?v
GET _cat/nodes?v&h=name,node.role,master,heap.percent,cpu,disk.used_percent,uptime&s=name
```

기록은 이때부터 남깁니다. 시각(UTC와 현지 시각 중 하나로 통일), 본 것, 한 조치를 한 줄씩 적습니다. 사후 분석과 지원 요청에서 가장 먼저 필요한 것이 이 기록입니다.

## 5에서 10분: 재시작 전에 남긴다

노드를 재시작하거나 설정을 바꾸기 전에 아래를 저장합니다. 클러스터가 응답하는 동안에만 모을 수 있는 정보입니다.

```console
GET _health_report
GET _nodes/hot_threads?threads=10
GET _tasks?detailed=true&human=true&group_by=parents
GET _cat/thread_pool?v&h=node_name,name,active,queue,rejected
GET _cluster/pending_tasks
GET _cluster/allocation/explain
GET _nodes/stats/jvm,breaker,indexing_pressure?human
GET _cluster/settings?flat_settings=true
```

- 시간이 있으면 [09의 수집 스크립트](../09-offline-diagnostics/#반출할-수-없다면-같은-정보를-직접-모은다)나 support diagnostic을 한 번 돌립니다. 증상이 계속되면 5분 뒤 한 번 더 돌립니다.
- 문제가 있는 노드의 로그와 GC 로그를 복사합니다. 노드가 불안정하면 elected master의 로그도 같이 복사합니다.
- heap이 높은 채로 멈춘 노드라면 재시작 전에 heap dump를 남길지 정합니다. 디스크와 시간이 드는 대신 원인을 확실히 알 수 있습니다([03](../03-node-failure-triage/#heap-압박의-원인-좁히기)).
- 이미 노드가 죽었다면 그 노드의 로그, `dmesg -T`, `journalctl -u elasticsearch`를 먼저 남깁니다.

## 10에서 20분: 증상별 분기

| 증상 | 먼저 볼 글 |
| --- | --- |
| health RED, YELLOW | [02. RED와 YELLOW](../02-red-yellow/) |
| 노드가 재시작됨, 429 `circuit_breaking_exception` | [03. 노드 장애](../03-node-failure-triage/) |
| 쓰기가 `read-only-allow-delete`로 실패 | [04. 디스크 부족](../04-disk-full/#read-only-풀기) |
| 검색, 적재가 느림, 429 `es_rejected_execution_exception` | [05. 성능 저하](../05-slow-cluster/) |
| 특정 사용자, 대시보드 때문에 느림 | [06. 무거운 query](../06-expensive-queries/) |
| node-left 반복, master 교체, 503 `master_not_discovered_exception` | [07. 불안정한 클러스터](../07-unstable-cluster/) |
| 클러스터는 정상인데 수집이 끊김 | [수집 컬렉션](../../ingest/), 특히 [03 무중단 수집](../../ingest/03-no-gap-ingest/)과 [05 건수 정합성](../../ingest/05-count-reconciliation/) |

증상이 여러 개면 노드 구성부터 봅니다. 노드가 빠졌다 들어오기를 반복하는 동안에는 RED, 성능 저하, 디스크 문제가 모두 따라 생기므로, 공식 문서도 master와 노드 구성이 안정된 뒤에 다른 문제를 풀라고 권합니다([Troubleshoot an unstable cluster](https://www.elastic.co/docs/troubleshoot/elasticsearch/troubleshooting-unstable-cluster)).

## 20에서 30분: 완화 조치

원인을 다 찾기 전이라도 영향을 줄이는 조치를 합니다. 되돌리기 쉬운 것부터 합니다.

| 순서 | 조치 | 되돌리기 |
| --- | --- | --- |
| 1 | 무거운 query 취소([06](../06-expensive-queries/#실행-중인-query를-찾아-취소하기)) | 필요 없음 |
| 2 | 적재 속도를 수집기 쪽에서 줄임. 수집기 queue, Kafka가 받아 둠([수집 03](../../ingest/03-no-gap-ingest/)) | 수집기 설정 복원 |
| 3 | 공간 확보(오래된 index 삭제, replica 임시 축소)([04](../04-disk-full/)) | replica 복원 |
| 4 | 문제 노드에서 shard를 빼기(`cluster.routing.allocation.exclude._name`) | exclude 해제 |
| 5 | 정보를 남긴 뒤 문제 노드 하나만 재시작 | 없음 |
| 6 | 설정 임시 변경(watermark 상향 등) | 원래 값으로. 바꾼 것을 기록 |

하지 말아야 할 조치입니다.

- 모든 노드를 한꺼번에 재시작하지 않습니다. 원인 정보가 모두 사라지고, 전체 재시작 절차를 따르지 않으면 recovery가 오래 걸립니다([08의 rolling restart](../08-recoverability/#rolling-restart)).
- circuit breaker 한도를 올리지 않습니다. 429 대신 OOM으로 노드가 죽습니다([03](../03-node-failure-triage/#circuit-breaker-429)).
- `allocate_empty_primary`, `allocate_stale_primary`를 서둘러 쓰지 않습니다. 데이터를 버리는 명령입니다. 노드를 복구할 가능성이 남아 있으면 쓰지 않습니다([02](../02-red-yellow/#남은-복사본이-없을-때)).
- data 디렉터리의 파일을 지우거나 옮기지 않습니다. 디스크를 비우는 것은 API로 합니다.
- 바꾼 설정을 기록하지 않은 채 넘어가지 않습니다. rolling restart 뒤 `cluster.routing.allocation.enable`을 되돌리지 않아 YELLOW가 계속되는 일이 흔합니다.

## 로그인이 안 될 때

`.security` index를 쓸 수 없으면 native 사용자로 로그인이 안 되고 API가 401을 돌려줍니다. 이때는 노드 로컬 파일에 저장되는 file realm 사용자를 만들어 그 노드에 직접 요청합니다. file realm은 기본으로 realm 목록의 맨 앞에 있고, 파일을 바꾸면 재시작 없이 읽습니다([File-based access recovery](https://www.elastic.co/docs/troubleshoot/elasticsearch/file-based-recovery)).

```bash
# 요청을 보낼 노드에서 실행. 다른 노드에는 적용되지 않음
bin/elasticsearch-users useradd recovery-admin -p '<임시 비밀번호>' -r superuser
curl -k -u recovery-admin https://<그 노드>:9200/_cluster/health
```

- file realm은 그 노드에만 적용됩니다. 부하 분산기 주소가 아니라 사용자를 만든 노드의 주소로 요청합니다.
- `.security` 자체를 복원해야 하면 system index를 다룰 권한(`allow_restricted_indices: true`)이 있는 역할이 필요합니다. 작업이 끝나면 그 역할과 사용자를 지웁니다(같은 문서).

## 지원 요청에 붙일 것

| 항목 | 내용 |
| --- | --- |
| 증상과 영향 | 무엇이 안 되는지, 범위, 시작 시각 |
| 버전과 구성 | Elasticsearch 버전, 노드 수와 역할, 배포 형태 |
| 최근 변경 | 장애 전 24시간의 배포, 설정 변경, 인프라 작업 |
| 진단 파일 | support diagnostic 결과. 반출이 어려우면 [09](../09-offline-diagnostics/)의 방법 |
| 로그 | 문제 노드와 elected master의 로그, GC 로그(장애 시각 앞뒤) |
| 지금까지 한 조치 | 기록의 시각순 목록 |

공식 문서도 지원 요청 전에 diagnostic을 먼저 만들어 두면 답을 받는 시간이 줄어든다고 설명합니다([Capture diagnostics](https://www.elastic.co/docs/troubleshoot/elasticsearch/diagnostic)). 시각은 진단 파일, 로그, 기록에서 같은 기준(UTC 권장)으로 맞춥니다.

## 사후 분석 양식

장애가 끝나면 일주일 안에 아래 양식으로 정리합니다. 누구의 잘못인지가 아니라 무엇이 그 일을 가능하게 했는지를 씁니다.

| 항목 | 쓸 것 |
| --- | --- |
| 요약 | 무엇이, 언제부터 언제까지, 얼마나 영향을 줬는지 세 문장 |
| 타임라인 | 징후, 알림, 인지, 조치, 복구 시각 |
| 직접 원인 | 노드 OOM, 디스크 95%, 무거운 query 같은 기술적 원인 |
| 근본 원인 | 그 상태가 되도록 둔 것. 보관 정책 없음, shard 과다, 보호 설정 없음 |
| 잘 된 것, 안 된 것 | 알림이 제때 왔는지, 정보를 남겼는지, runbook이 맞았는지 |
| 재발 방지 | 담당자와 기한이 있는 작업. [01의 점검표](../01-daily-checks/)나 알림 기준에 넣을 것 |

## 판단 기준

| 상황 | 권장 |
| --- | --- |
| 알림을 받음 | 영향부터 정하고 기록 시작 |
| 재시작하고 싶음 | 5분만 써서 hot threads, tasks, 로그를 먼저 남김 |
| 증상이 여럿 | 노드 구성과 master 안정이 먼저 |
| 원인을 모름 | 되돌리기 쉬운 완화 조치부터. 데이터를 버리는 명령은 마지막 |
| 로그인이 안 됨 | file realm 사용자로 노드에 직접 |
| 끝났음 | 바꾼 설정 복원 확인, 일주일 안에 사후 분석 |

## 참고 문서

- [Troubleshoot an unstable cluster](https://www.elastic.co/docs/troubleshoot/elasticsearch/troubleshooting-unstable-cluster)
- [File-based access recovery](https://www.elastic.co/docs/troubleshoot/elasticsearch/file-based-recovery)
- [Capture diagnostics](https://www.elastic.co/docs/troubleshoot/elasticsearch/diagnostic)
