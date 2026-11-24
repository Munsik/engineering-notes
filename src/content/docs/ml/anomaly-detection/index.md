---
title: Anomaly Detection in Production
description: Elasticsearch Machine Learning anomaly detection을 프로덕션에 올릴 때 내려야 하는 결정을 데이터 준비부터 운영까지 순서대로 다룹니다.
sidebar:
  label: 개요
  order: 0
---

Anomaly detection job은 만드는 것보다 운영하는 것이 어렵습니다.
job 생성 화면에서 고르는 값 몇 개가 탐지 품질, 탐지 지연, 메모리 사용량을 함께 결정합니다.
잘못 고른 값은 운영을 시작한 뒤에야 드러나는 경우가 많습니다.

이 컬렉션은 공식 문서의 목차가 아니라, 실제로 설계할 때 결정이 일어나는 순서를 따릅니다.

## 구성

| # | 주제 | 다루는 결정 | 상태 |
| --- | --- | --- | --- |
| 01 | Data & Use Case Design | 어떤 데이터가 적합한가, 정상 패턴을 배우려면 얼마나 긴 데이터가 필요한가 | 준비 중 |
| 02 | Detector Design | 어떤 function을 고르는가, `by` / `over` / `partition` 필드를 어떻게 나누는가, influencer를 무엇으로 두는가 | 준비 중 |
| 03 | Bucket Span | 탐지 정확도, 탐지 지연, 리소스 사용 사이에서 bucket span을 어떻게 정하는가 | 준비 중 |
| 04 | Model Memory & Scalability | cardinality가 메모리에 주는 영향, `model_memory_limit` 산정, ML node 구성 | 준비 중 |
| 05 | Detection Quality | anomaly score를 어떻게 읽는가, 정상 업무 이벤트와 실제 이상을 어떻게 구분하는가 | 준비 중 |
| 06 | Operationalization | job과 datafeed 모니터링, 알림 연결, model snapshot 관리 | 준비 중 |
| 07 | Troubleshooting | 탐지가 안 될 때, 메모리 한도에 닿을 때, datafeed가 밀릴 때 | 준비 중 |

## 읽는 방법

처음이라면 01부터 순서대로 읽기를 권합니다. 앞의 결정이 뒤의 결정에 영향을 주기 때문입니다.
특정 문제를 겪고 있다면 07 Troubleshooting에서 시작해 관련 장으로 이동해도 됩니다.

각 글의 실험에 쓴 데이터 생성 코드와 job 설정은 저장소의 [`labs/anomaly-detection`](https://github.com/Munsik/engineering-notes/tree/main/labs/anomaly-detection) 폴더에서 확인할 수 있습니다.
