---
title: Anomaly Detection in Production
description: Elasticsearch Machine Learning anomaly detection을 운영에 올릴 때 내려야 하는 결정을 job 설계부터 결과 해석, 노이즈 처리, 운영까지 순서대로 다룹니다.
sidebar:
  label: 개요
  order: 0
---

Anomaly detection job은 만드는 것보다 운영하는 것이 어렵습니다.
job 생성 화면에서 고르는 값 몇 개가 탐지 품질, 탐지 지연, 메모리 사용량을 함께 결정합니다.
잘못 고른 값은 운영을 시작한 뒤에야 드러나는 경우가 많고, 상당수는 job을 만든 뒤에 바꿀 수 없습니다.

이 컬렉션은 job과 detector를 어떻게 나눌지, 결과 score를 어떻게 읽을지, 노이즈와 예외를 어떻게 다룰지, 운영 중 무엇을 감시할지를 순서대로 정리합니다.
Elastic이 Kibana에 기본 제공하는 job의 실제 설정을 바탕으로 한 실무 시나리오와, Kibana Dev Tools에서 바로 실행할 수 있는 실습도 함께 있습니다.

:::note[기준]
- Elasticsearch / Kibana 9.x 기준입니다. 버전이나 배포 형태(Elastic Cloud Serverless 등)에 따라 다른 항목은 본문에 따로 표시했습니다.
- 공식 문서와 API reference는 2026년 11월 기준으로 확인했습니다. Kibana 제공 job 설정은 GitHub [elastic/kibana](https://github.com/elastic/kibana/tree/main/x-pack/platform/plugins/shared/ml/server/models/data_recognizer/modules) 저장소의 main 브랜치를 참고했습니다.
- 공식 문서에서 확인하지 못한 내용은 "확인 필요" 또는 "해석"으로 구분해 표시했습니다.
:::

## 구성

| # | 주제 | 다루는 결정 |
| --- | --- | --- |
| 01 | [Job 설계](01-job-design/) | job 구성 요소, wizard별 차이, detector를 하나로 둘지 여러 개로 둘지, `partition` / `by` / `over`, influencer |
| 02 | [Bucket span과 데이터 준비](02-bucket-span-and-data/) | bucket span 선택, 학습에 필요한 데이터량, datafeed 필터, 지연 도착 데이터, aggregation 입력 |
| 03 | [메모리와 규모](03-memory-and-scale/) | `model_memory_limit`, 결과와 snapshot 보존, ML node 구성 |
| 04 | [결과 읽는 법](04-reading-results/) | bucket / record / influencer score, score 계산 방식과 renormalization, 여러 detector job 읽기 |
| 05 | [노이즈와 예외 처리](05-noise-and-exceptions/) | 노이즈 유형별 대응, custom rule, calendar, 서머타임, 모델 복구 |
| 06 | [운영 체크리스트](06-operations/) | 알림 rule과 job health rule, job 묶어 보기, datafeed 운영, 장애 대응, 제약사항 |
| 07 | [실무 시나리오 12가지](07-scenarios/) | Elastic 제공 job으로 본 detector 구성의 이유와 노이즈 처리 |
| 08 | [실습](08-hands-on-lab/) | Kibana 샘플 데이터로 job 3개와 advanced job 1개를 만들어 비교 |

## 한 페이지 요약

| 질문 | 짧은 답 | 상세 |
| --- | --- | --- |
| detector를 1개 둘까, 여러 개 둘까 | 같은 데이터를 같은 bucket span으로 보고, 같은 entity와 influencer로 조사하는 지표라면 한 job에 여러 detector로 묶습니다. bucket span, datafeed, aggregation, forecast 필요 여부, 알림 정책이 다르면 job을 나눕니다. | [01](01-job-design/#detector를-1개-둘까-여러-개-둘까) |
| advanced job과 multi-metric job은 무엇이 다른가 | 둘 다 detector를 여러 개 둘 수 있습니다. multi-metric wizard는 split field 하나를 모든 detector에 같은 방식으로 적용하고, advanced는 detector마다 `by`, `over`, `partition`을 따로 정합니다. | [01](01-job-design/#job-유형과-wizard) |
| `partition`, `by`, `over`는 무엇이 다른가 | `partition`은 값마다 완전히 독립된 baseline, `by`는 값마다 자기 이력과 비교, `over`는 같은 시점의 다른 entity 전체와 비교(population)입니다. | [01](01-job-design/#partition-by-over) |
| bucket, record, influencer score는 무엇인가 | bucket은 그 시간대 job 전체 요약, record는 detector와 entity별 개별 이상, influencer는 detector를 가로질러 entity별로 모은 기여도입니다. 모두 0~100입니다. | [04](04-reading-results/) |
| 노이즈가 섞이면 어떻게 하나 | 원인을 먼저 나눕니다. datafeed query로 아예 빼는 것, custom rule로 결과만 빼는 것, 모델 학습에서 빼는 것은 서로 다른 수단입니다. | [05](05-noise-and-exceptions/) |
| 운영 중에 예외를 둘 수 있나 | custom rule, filter list, calendar는 운영 중에 바꿀 수 있습니다. detector 구성 자체는 바꿀 수 없어 clone으로 새 job을 만들어야 합니다. | [05](05-noise-and-exceptions/) |
| 운영에서 꼭 챙길 것 | 학습 기간, model memory, 지연 데이터, alert rule과 job health rule 한 쌍, 이벤트와 서머타임 calendar, 결과와 snapshot 보존 기간입니다. | [06](06-operations/) |

## 읽는 순서

처음이라면 01부터 순서대로 읽기를 권합니다. 앞의 결정이 뒤의 결정에 영향을 주기 때문입니다.
이미 운영 중인 job의 노이즈나 장애를 다루고 있다면 05와 06부터 보고, 필요한 부분만 앞 장으로 돌아가도 됩니다.
