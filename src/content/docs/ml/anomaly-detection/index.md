---
title: Anomaly Detection in Production
description: Elasticsearch ML anomaly detection을 운영에 올릴 때 마주치는 결정을 job 설계부터 결과 해석, noise 처리, 운영까지 순서대로 정리했습니다.
sidebar:
  label: 개요
  order: 0
---

Anomaly detection job은 만드는 것보다 운영하는 게 훨씬 어렵습니다.
job을 만들 때 고르는 값 몇 개가 탐지 품질과 탐지 지연, 메모리 사용량을 한꺼번에 결정하는데, 잘못 고른 값은 운영을 시작하고 나서야 드러나는 경우가 많습니다. 게다가 상당수는 job을 만든 뒤에는 바꿀 수도 없습니다.

여기서는 이 문제에 anomaly detection이 맞는지부터 시작해서, job과 detector를 어떻게 나눌지, 결과 score를 어떻게 읽을지, noise와 예외를 어떻게 다룰지, alert를 켜기 전에 어떻게 검증하고 운영 중에 무엇을 지켜볼지를 차례로 다룹니다.
Elastic이 Kibana에 기본으로 넣어 둔 job들의 실제 설정을 뜯어본 시나리오와, Dev Tools에서 바로 돌려 볼 수 있는 실습도 같이 넣었습니다.

:::note[기준]
- Elasticsearch, Kibana 9.x 기준입니다. 버전이나 배포 형태(Elastic Cloud Serverless 등)에 따라 다른 부분은 본문에 따로 적었습니다.
- 공식 문서와 API reference는 2026년 11월에 다시 확인했습니다. Kibana 제공 job 설정은 GitHub [elastic/kibana](https://github.com/elastic/kibana/tree/main/x-pack/platform/plugins/shared/ml/server/models/data_recognizer/modules) 저장소의 main 브랜치를 봤습니다.
- 공식 문서로 확인한 내용에는 출처를 달았습니다. 출처가 없는 판단과 권장은 제 현장 경험에서 나온 것이고, 아직 확인하지 못한 내용에는 "확인 필요"라고 표시했습니다. 소스 코드나 직접 실행한 결과로 확인한 내용은 그 근거를 같이 적었습니다.
- 각 장 맨 위에도 그 장의 기준을 적어 두었습니다.
:::

## 구성

| # | 주제 | 다루는 내용 |
| --- | --- | --- |
| 01 | [Job 설계](01-job-design/) | anomaly detection이 맞는 문제와 맞지 않는 문제, job 구성 요소, wizard별 차이, detector를 하나로 둘지 여러 개로 둘지, `partition` / `by` / `over`, influencer |
| 02 | [Bucket span과 데이터 준비](02-bucket-span-and-data/) | bucket span 고르기, 학습에 필요한 데이터 양, datafeed 필터, 늦게 들어오는 데이터, aggregation 입력 |
| 03 | [메모리와 규모](03-memory-and-scale/) | `model_memory_limit`, 결과와 snapshot retention, ML node 구성 |
| 04 | [결과 읽는 법](04-reading-results/) | bucket / record / influencer score, score 계산 방식과 renormalization, detector가 여러 개인 job 읽기 |
| 05 | [Noise와 예외 처리](05-noise-and-exceptions/) | noise 유형별 대응, custom rule, calendar, DST, 모델 복구 |
| 06 | [운영 체크리스트](06-operations/) | alert를 켜기 전 과거 데이터로 검증하기, alert rule과 job health rule, 여러 job 묶어 보기, datafeed 운영, 장애 대응, 제약사항 |
| 07 | [실무 시나리오 12가지](07-scenarios/) | Elastic 제공 job으로 보는 detector 구성과 noise 처리 |
| 08 | [실습](08-hands-on-lab/) | Kibana 샘플 데이터로 job 3개와 advanced job 1개를 만들어 비교 |
| 09 | [Use case: 공장 생산망 AIOps](09-manufacturing-aiops/) | MES 로그, APM, 호스트 metrics에 job 13개 설계, trace.id influencer, alert에서 Workflow를 호출해 AI 분석과 사람의 승인까지 |

## 자주 받는 질문

| 질문 | 짧은 답 | 자세히 |
| --- | --- | --- |
| 임계값 alert 대신 anomaly detection을 써야 하나 | 정상 범위를 숫자로 정할 수 있거나 규정상 고정 기준이 있다면 임계값 rule이 낫습니다. 시간대마다 정상 값이 다르거나, entity가 너무 많거나, 무엇이 이상인지 미리 정의할 수 없을 때 anomaly detection이 맞습니다. 둘을 같이 쓰는 경우가 많습니다. | [01](01-job-design/#이-문제에-맞는-도구인가) |
| detector를 1개 둘까, 여러 개 둘까 | 같은 데이터를 같은 bucket span으로 보고, 같은 entity와 influencer로 조사하는 지표라면 한 job에 묶으면 됩니다. bucket span, datafeed, aggregation, forecast, alert 정책 중 하나라도 달라야 하면 job을 나눕니다. | [01](01-job-design/#detector를-1개-둘까-여러-개-둘까) |
| advanced job과 multi-metric job은 뭐가 다른가 | 둘 다 detector를 여러 개 둘 수 있습니다. 다만 multi-metric wizard는 split field 하나를 모든 detector에 똑같이 적용하고, advanced는 detector마다 `by`, `over`, `partition`을 따로 정합니다. | [01](01-job-design/#job-유형과-wizard) |
| `partition`, `by`, `over`는 뭐가 다른가 | `partition`은 값마다 완전히 따로 만든 baseline, `by`는 값마다 자기 과거와 비교, `over`는 같은 시점의 다른 entity들과 비교(population)입니다. | [01](01-job-design/#partition-by-over) |
| bucket, record, influencer score는 각각 뭔가 | bucket은 그 시간대 job 전체를 요약한 값, record는 detector와 entity 하나하나의 이상, influencer는 detector를 가로질러 entity별로 모은 기여도입니다. 셋 다 0~100입니다. | [04](04-reading-results/) |
| noise가 섞이면 어떻게 하나 | 원인부터 나눕니다. datafeed query에서 아예 빼는 것, custom rule로 결과만 지우는 것, 모델 학습에서 빼는 것은 서로 다른 방법입니다. | [05](05-noise-and-exceptions/) |
| 운영 중에 예외를 둘 수 있나 | custom rule, filter list, calendar는 운영 중에도 바꿀 수 있습니다. detector 구성은 바꿀 수 없어서 clone으로 새 job을 만들어야 합니다. | [05](05-noise-and-exceptions/) |
| alert를 언제 켜나 | 학습 기간이 지난 뒤, 과거 데이터로 돌려서 알려진 사건을 잡는지와 알림 양이 감당할 만한지 확인하고 켭니다. | [06](06-operations/#alert를-켜기-전에-검증하기) |
| alert 이후 조사와 판단까지 자동화할 수 있나 | alert rule에서 Workflow를 호출해 근거를 모으고, AI로 1차 분류한 뒤 담당자 판단을 받아 후속 조치까지 이을 수 있습니다. | [09](09-manufacturing-aiops/#alert에서-workflow로-ai-분석과-사람의-판단) |
| 운영에서 꼭 챙길 것 | 학습 기간, model memory, 늦게 들어오는 데이터, alert rule과 job health rule 한 쌍, 이벤트와 DST calendar, 결과와 snapshot retention입니다. | [06](06-operations/) |

## 읽는 순서

처음 보신다면 01부터 차례로 읽는 걸 권합니다. 앞에서 정한 것이 뒤의 선택을 좁히기 때문입니다.
이미 운영 중인 job의 noise나 장애 때문에 오셨다면 05와 06부터 보고, 필요한 부분만 앞 장으로 돌아가셔도 됩니다.
실제 환경에 어떻게 적용하는지부터 보고 싶다면 09를 먼저 읽고, 거기서 링크한 앞 장으로 돌아가는 순서도 괜찮습니다.
