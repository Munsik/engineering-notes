---
title: Elastic Stack
description: Elasticsearch, Kibana, Elastic Agent와 Fleet, Logstash로 검색, 로그와 지표 분석, 보안 탐지 시스템을 프로덕션에 올리고 운영할 때 필요한 판단을 업무 문제별 컬렉션으로 정리합니다.
---

이 영역의 글은 Elastic Stack으로 만든 검색, 로그와 지표 분석, 보안 탐지 시스템을 프로덕션에서 설계하고 운영하는 문제를 다룹니다.
기능과 설정 방법은 공식 문서에 맡깁니다. 여기서는 데이터를 얼마나, 어떤 모양으로 둘지, 원본을 빠짐없이 들여왔다고 어떻게 증명할지, 장애와 변경을 어떻게 견딜지 같은 결정을 컬렉션 단위로 정리합니다.

:::note[기준]
- Elastic Stack 9.x 기준입니다. 공식 문서는 2026년 11월에 다시 확인했습니다. 컬렉션과 글마다 기준 버전과 GA 상태를 따로 적었습니다.
- 배포 형태(self-managed, Elastic Cloud Hosted 등)에 따라 달라지는 점은 글마다 적었습니다.
:::

## 다루는 구성 요소

Elastic Stack은 데이터를 수집하고, 저장하고, 검색하고, 시각화하는 제품들의 묶음입니다. 모든 배포에는 Elasticsearch와 Kibana가 들어가고, 용도에 따라 Elastic Agent, Logstash 같은 수집 제품을 더합니다([The Elastic Stack](https://www.elastic.co/docs/get-started/the-stack)). 이 영역의 컬렉션은 아래 구성 요소를 다룹니다.

| 구성 요소 | 하는 일 | 주로 다루는 컬렉션 |
| --- | --- | --- |
| Elasticsearch | 데이터 저장, 검색, 분석. 클러스터 하나가 여러 노드로 이뤄지고, index는 shard로 나뉘어 노드에 흩어짐 | [데이터 설계](../data/), [안정성 운영](../operations/), [Anomaly Detection in Production](../ml/anomaly-detection/) |
| Kibana | 화면, dashboard, alert, Stack 관리 도구 | [변화 관리](../change/), [Anomaly Detection in Production](../ml/anomaly-detection/) |
| Elastic Agent와 Fleet | 호스트에서 로그, 지표, 보안 데이터를 모으는 수집기와 그 중앙 관리 | [수집](../ingest/), [변화 관리](../change/) |
| Logstash | 수집한 데이터를 변환하고 중계하는 pipeline | [수집](../ingest/) |

## 컬렉션 지도

데이터가 흐르는 순서대로 구성 요소를 놓고, 괄호 안에 그 구성 요소를 주로 다루는 컬렉션을 적었습니다. 변화 관리는 특정 구간이 아니라 모든 구성 요소의 변경을 다룹니다.

```mermaid
flowchart LR
  S["원천<br/>서버, 장비, 애플리케이션"] --> C
  subgraph X["변화 관리: 모든 구성 요소의 변경"]
    direction LR
    C["Elastic Agent, Fleet, Logstash<br/>(수집)"] --> E["Elasticsearch<br/>(데이터 설계, 안정성 운영,<br/>Anomaly Detection)"]
    E --> K["Kibana<br/>(Anomaly Detection)"]
  end
```

## 컬렉션

| 컬렉션 | 다루는 문제 |
| --- | --- |
| [데이터 설계](../data/) | shard 내부 구조부터 저장 용량, shard 수와 bulk, 데이터 tier와 보관까지, 데이터를 어디에 어떤 모양으로 둘지 |
| [수집](../ingest/) | 수집기 선택, 파싱 위치, 무중단 구성, UDP syslog, 건수 정합성, 수집 계층 산정, 대규모 Fleet 운영 |
| [안정성 운영](../operations/) | 평소 점검, RED와 YELLOW, 노드 장애, 디스크 부족, 느려짐, 복구 설계, 폐쇄망 점검, 장애 첫 30분 |
| [변화 관리](../change/) | 업그레이드, 구성 변경, template과 pipeline, Kibana 객체를 되돌릴 수 있게 바꾸고 코드로 관리하는 방법 |
| [Anomaly Detection in Production](../ml/anomaly-detection/) | ML anomaly detection을 job 설계부터 결과 해석, noise 처리, 운영까지 프로덕션에 올리는 방법 |

## 어디서부터 읽을까

아래 순서는 제가 권하는 방법입니다(해석).

- 새로 구축한다면 [데이터 설계](../data/), [수집](../ingest/), [안정성 운영](../operations/) 순서로 읽습니다. 앞에서 정한 shard와 tier 구성이 뒤의 수집 산정과 운영 기준이 됩니다.
- 이미 운영 중인 클러스터를 맡았다면 [안정성 운영의 평소 점검](../operations/01-daily-checks/)과 [장애 첫 30분](../operations/10-incident-runbook/)부터 읽습니다.
- 업그레이드나 큰 변경을 앞두고 있다면 [변화 관리의 바뀌는 것의 지도](../change/01-change-map/)부터 읽습니다.
- 이상 탐지를 도입하려면 [Anomaly Detection in Production](../ml/anomaly-detection/)을 처음부터 읽습니다.
