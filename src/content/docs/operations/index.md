---
title: 안정성 운영
description: 평소 점검부터 RED와 YELLOW, 노드 장애, 디스크 부족, 성능 저하, 무거운 query, 불안정한 클러스터, 복구 설계, 폐쇄망 점검, 장애 첫 30분까지 운영 중 실제로 겪는 문제를 단계별로 정리합니다.
sidebar:
  label: 개요
  order: 0
---

운영 중인 클러스터에서 실제로 시간을 쓰는 곳은 대개 정해져 있습니다. 노드가 갑자기 재시작되고, 디스크가 차서 쓰기가 멈추고, 어느 날부터 검색이 느려지고, 노드가 클러스터에서 빠졌다 들어오기를 반복합니다.
그런 상황에서 바로 따라 할 수 있게 "평소 점검 → 징후 → 유형별 대응 → 복구 설계 → 장애 대응" 순서로 정리했습니다.

:::note[기준]
- Elasticsearch 9.x, Linux, self-managed 기준입니다. Elastic Cloud Hosted와 다른 점은 글마다 적었습니다.
- 근거는 공식 troubleshooting 문서, production guidance, Elasticsearch 소스와 release notes입니다. 출처가 없는 판단과 권장은 제 현장 경험에서 나온 것이고, 공식 문서로 확인하지 못한 내용에는 "확인 필요"라고 표시했습니다.
- 진단 명령 모음은 저장소의 [`labs/operations/`](https://github.com/Munsik/engineering-notes/tree/main/labs/operations)에 있습니다.
:::

## 단계별 구성

| 단계 | 글 | 다루는 내용 |
| --- | --- | --- |
| 평소 | [01. 평소 점검](01-daily-checks/) | health report, 지켜볼 지표와 임계값, 매일과 매주 점검표 |
| 징후 | [02. RED와 YELLOW](02-red-yellow/) | 상태 읽기, unassigned shard 원인 찾기, 복사본이 없을 때 |
| 장애 | [03. 노드 장애](03-node-failure-triage/) | heap, circuit breaker, OOM, OS가 죽인 경우, OS 설정 |
| 장애 | [04. 디스크 부족](04-disk-full/) | watermark, read-only 해제, 디스크가 이유 없이 늘 때 |
| 장애 | [05. 성능 저하](05-slow-cluster/) | CPU, thread pool, task 적체, 특정 노드 쏠림 |
| 예방 | [06. 무거운 query](06-expensive-queries/) | 위험한 query 유형, 보호 설정, 실행 중인 query 취소 |
| 장애 | [07. 불안정한 클러스터](07-unstable-cluster/) | node-left 반복, master 교체, cluster state가 클 때 |
| 복구 설계 | [08. 복구 가능성](08-recoverability/) | replica, zone, snapshot, rolling restart |
| 점검 | [09. 폐쇄망 점검](09-offline-diagnostics/) | 진단 파일 없이 같은 정보를 모으는 방법 |
| 장애 대응 | [10. 첫 30분](10-incident-runbook/) | 정보 보존, 완화 조치 순서, 지원 요청 |

## 증상으로 찾기

| 증상 | 먼저 볼 글 |
| --- | --- |
| health가 RED, YELLOW | [02](02-red-yellow/) |
| 429 `circuit_breaking_exception` | [03](03-node-failure-triage/#circuit-breaker-429) |
| 노드가 갑자기 재시작됨 | [03](03-node-failure-triage/#어떻게-죽었나부터-가른다) |
| `index has read-only-allow-delete block` | [04](04-disk-full/#read-only-풀기) |
| `disk.used`가 `disk.indices`보다 훨씬 큼 | [04](04-disk-full/#디스크가-이유-없이-늘-때) |
| 429 `es_rejected_execution_exception`, 검색이나 적재가 느림 | [05](05-slow-cluster/) |
| 노드 몇 대만 CPU, 디스크가 높음 | [05](05-slow-cluster/#일부-노드만-느릴-때-쏠림) |
| 한가한 시간대에만 클라이언트 연결 오류 | [05](05-slow-cluster/#클러스터는-정상인데-클라이언트만-느릴-때) |
| 특정 사용자의 대시보드, query 때문에 전체가 느림 | [06](06-expensive-queries/) |
| 로그에 `node-left`가 반복됨 | [07](07-unstable-cluster/#빠진-이유-세-가지) |
| 503 `master_not_discovered_exception`, master가 자주 바뀜 | [07](07-unstable-cluster/#master가-자주-바뀔-때) |
| pending tasks에 `put-mapping`이 쌓임 | [07](07-unstable-cluster/#cluster-state가-클-때) |
| rolling restart가 오래 걸림 | [08](08-recoverability/#rolling-restart) |
| 진단 파일을 밖으로 낼 수 없음 | [09](09-offline-diagnostics/) |
| 장애가 났는데 무엇부터 할지 모름 | [10](10-incident-runbook/) |
| 로그인이 안 됨, API가 401 | [10](10-incident-runbook/#로그인이-안-될-때) |
