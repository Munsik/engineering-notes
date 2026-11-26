---
title: 안정성 운영
description: 평소 점검부터 RED와 YELLOW, 노드 장애, 디스크 부족, 느려짐, 비싼 query, 불안정한 클러스터, 복구 설계, 폐쇄망 점검, 장애 첫 30분까지 운영 중 실제로 겪는 문제를 단계별로 정리합니다.
draft: true
sidebar:
  label: 개요
  order: 0
---

운영 중인 클러스터에서 실제로 시간을 쓰는 곳은 대개 정해져 있습니다. 노드가 갑자기 재시작되고, 디스크가 차서 쓰기가 멈추고, 어느 날부터 검색이 느려지고, 노드가 클러스터에서 빠졌다 들어오기를 반복합니다.
이 컬렉션은 그런 상황을 만났을 때 따라 할 수 있도록 "평소 점검 → 징후 → 유형별 대응 → 복구 설계 → 장애 대응" 순서로 정리합니다.

:::note[기준]
- Elasticsearch 9.x, Linux, self-managed 기준입니다. Elastic Cloud Hosted와 다른 점은 글마다 적었습니다.
- 근거는 공식 troubleshooting 문서, production guidance, Elasticsearch 소스와 release notes입니다. 공식 문서로 확인하지 못한 내용에는 "확인 필요", 제 해석에는 "해석"이라고 표시했습니다.
- 진단 명령 모음은 저장소의 [`labs/operations/`](https://github.com/Munsik/engineering-notes/tree/main/labs/operations)에 있습니다.
:::

## 단계별 구성

| 단계 | 글 | 다루는 내용 |
| --- | --- | --- |
| 평소 | [01. 평소 점검](01-daily-checks/) | health report, 지켜볼 지표와 임계값, 매일과 매주 점검표 |
| 징후 | [02. RED와 YELLOW](02-red-yellow/) | 상태 읽기, unassigned shard 원인 찾기, 사본이 없을 때 |
| 장애 | [03. 노드 장애](03-node-failure-triage/) | heap, circuit breaker, OOM, OS가 죽인 경우, OS 설정 |
| 장애 | [04. 디스크 부족](04-disk-full/) | watermark, read-only 해제, 디스크가 이유 없이 늘 때 |
| 장애 | 05. 느려짐 (예정) | CPU, thread pool, task 적체, 특정 노드 쏠림 |
| 예방 | 06. 비싼 query (예정) | 위험한 query 유형, 보호 설정, 실행 중인 query 취소 |
| 장애 | 07. 불안정한 클러스터 (예정) | node-left 반복, master 교체, cluster state가 클 때 |
| 복구 설계 | 08. 복구 가능성 (예정) | replica, zone, snapshot, rolling restart |
| 점검 | 09. 폐쇄망 점검 (예정) | 진단 파일 없이 같은 정보를 모으는 방법 |
| 장애 대응 | 10. 첫 30분 (예정) | 정보 보존, 완화 조치 순서, 지원 요청 |

## 증상으로 찾기

| 증상 | 먼저 볼 글 |
| --- | --- |
| health가 RED, YELLOW | [02](02-red-yellow/) |
| 429 `circuit_breaking_exception` | [03](03-node-failure-triage/#circuit-breaker-429) |
| 노드가 갑자기 재시작됨 | [03](03-node-failure-triage/#어떻게-죽었나부터-가른다) |
| `index has read-only-allow-delete block` | [04](04-disk-full/#read-only-풀기) |
| `disk.used`가 `disk.indices`보다 훨씬 큼 | [04](04-disk-full/#디스크가-이유-없이-늘-때) |
