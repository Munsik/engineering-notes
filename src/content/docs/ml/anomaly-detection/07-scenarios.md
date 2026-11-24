---
title: 실무 시나리오 12가지
description: Elastic이 Kibana에 기본 제공하는 anomaly detection job의 실제 설정을 바탕으로, detector와 split을 왜 그렇게 골랐는지와 노이즈 처리 방법을 시나리오별로 정리합니다.
sidebar:
  label: 07. 실무 시나리오 12가지
  order: 7
---

아래 시나리오는 Elastic이 Kibana에 기본 제공하는 job(supplied configuration)의 실제 설정을 GitHub에서 확인해 정리한 것입니다.
각 시나리오는 무엇을 보려는지, detector와 split을 왜 그렇게 골랐는지, 노이즈를 어떻게 다루는지를 함께 적었습니다.
field 이름과 수치는 각자의 환경에 맞게 바꿔야 합니다.

| # | 시나리오 | 핵심 구성 |
| --- | --- | --- |
| 1 | [서비스 전체 요청 급감](#서비스-전체-요청-급감) | detector 1개, split 없음, `low_count` |
| 2 | [응답코드별 이상](#응답코드별-이상) | `count`, `partition` |
| 3 | [APM 서비스 핵심 지표 4종](#apm-서비스-핵심-지표-4종) | detector 4개, `by`와 `partition` 함께, aggregation |
| 4 | [URL을 훑는 스캐닝 IP](#url을-훑는-스캐닝-ip) | population(`over`), `high_distinct_count` |
| 5 | [수집 중단 감시](#수집-중단-감시) | `low_count`, `partition`, `use_null` |
| 6 | [호스트 자원 지표와 내장 노이즈 rule](#호스트-자원-지표와-내장-노이즈-rule) | `high_mean`, `partition`, custom rule |
| 7 | [호스트별 드문 process](#호스트별-드문-process) | `rare`, `by`와 `partition` 함께 |
| 8 | [평소와 다른 시각의 로그인](#평소와-다른-시각의-로그인) | `time_of_day`, `by`와 `over` 함께 |
| 9 | [DNS tunneling 의심](#dns-tunneling-의심) | `high_info_content`, population, custom rule |
| 10 | [로그 메시지 패턴 급증](#로그-메시지-패턴-급증) | categorization, per-partition categorization |
| 11 | [용량 추세 예측](#용량-추세-예측) | forecast |
| 12 | [같은 목적, job 3개와 advanced job 1개](#같은-목적-job-3개와-advanced-job-1개) | detector 구성 판단 사례 |

## 서비스 전체 요청 급감

웹 서비스 전체 요청이 평소보다 크게 줄면 장애, 배포 실패, 앞단 네트워크 문제일 가능성이 큽니다. 가장 먼저 만드는 KPI job입니다.

| 항목 | 내용 |
| --- | --- |
| 목표 | 전체 요청 수가 평소 패턴보다 낮아지는 순간만 감지 |
| detector | `low_count` 1개, split 없음 |
| bucket span 등 | Kibana 샘플 job은 1h, Nginx 제공 job은 15m. 둘 다 `summary_count_field_name`을 `doc_count`로 둔 aggregation 입력 |
| 이렇게 구성한 이유 | 증가는 관심 없고 감소만 문제이므로 한쪽 방향만 보는 `low` function을 씁니다. 시계열이 하나라 메모리가 작고(제공 job은 10mb) 해석이 단순합니다. |
| 노이즈와 주의 | 수집 지연이 일정하게 생기면 `low_count`가 오탐을 냅니다. `query_delay`와 delayed data check를 먼저 확인합니다. 계획된 점검은 calendar로 등록합니다. |
| 참고한 제공 job | `low_request_rate`(Kibana 샘플 웹 로그), `low_request_rate_ecs`(Nginx, Apache) |

```json
{ "function": "low_count" }
// analysis_config.summary_count_field_name: "doc_count"
```

## 응답코드별 이상

200, 404, 500 같은 응답코드는 평소 건수 규모가 전혀 다릅니다. 하나로 합쳐 보면 작은 코드의 급증이 묻힙니다.

| 항목 | 내용 |
| --- | --- |
| 목표 | 응답코드별로 평소와 다른 증가나 감소를 감지하고, 원인 client를 함께 확인 |
| detector | `count` 1개, `partition_field_name`: 응답코드 |
| influencer | client IP, 응답코드 |
| bucket span 등 | 샘플 job 1h(memory 10mb), Nginx 제공 job 15m(memory 100mb) |
| 이렇게 구성한 이유 | 코드마다 규모가 다르므로 `partition`으로 완전히 독립된 baseline을 둡니다. `count`는 양방향이라 200의 감소와 404의 증가를 모두 잡습니다. |
| 노이즈와 주의 | 건수가 아주 적은 코드는 작은 변화에도 점수가 납니다. `actual`이 N보다 작으면 `skip_result`하는 condition rule을 둡니다. 증가만 보려면 `high_count`를 씁니다. |
| 조사 흐름 | 404가 급증한 구간을 누르면 influencer에 특정 client IP가 보여, 스캐닝인지 판단할 수 있습니다(Kibana 튜토리얼의 예). |
| 참고한 제공 job | `response_code_rates`(샘플), `status_code_rate_ecs`(Nginx, Apache) |

```json
{ "function": "count", "partition_field_name": "response.keyword" }
```

## APM 서비스 핵심 지표 4종

한 서비스의 지연, 처리량, 실패율, 트랜잭션 수는 같은 장애의 서로 다른 증상입니다. Elastic APM이 제공하는 job은 이 네 지표를 detector 4개로 한 job에 묶습니다.

| 항목 | 내용 |
| --- | --- |
| 목표 | 서비스와 트랜잭션 유형별로 네 가지 증상을 한 번에 보고, 같은 시각의 증상을 하나의 overall score로 요약 |
| detector | `high_mean`(지연), `mean`(처리량), `high_mean`(실패율), `low_count`(트랜잭션 수). 모두 `by: transaction.type`, `partition: service.name` |
| influencer | `transaction.type`, `service.name` |
| datafeed | composite aggregation(60초 date_histogram + `transaction.type` + `service.name` terms)으로 요약해 읽음. `summary_count_field_name: doc_count`, chunking off |
| bucket span 등 | 15m, memory 32mb, model plot 켬, 결과 index `custom-apm` |
| 이렇게 구성한 이유 | 네 지표가 같은 entity 키, 같은 bucket span, 같은 aggregation 입력을 공유하므로 한 job이 자연스럽습니다. 처리량은 급증과 급감이 모두 의미 있어 양방향 `mean`을, 지연과 실패율은 높아지는 쪽만 봅니다. |
| 노이즈와 주의 | 서비스 수가 늘면 partition 수만큼 메모리가 늘어납니다. detector를 하나 더 넣고 싶어도 기존 job에는 추가할 수 없어 새 job을 만들어야 합니다. |
| 참고한 제공 job | `apm_tx_metrics`(apm_transaction module) |

```json
"detectors": [
  { "function": "high_mean", "field_name": "transaction_latency",
    "by_field_name": "transaction.type", "partition_field_name": "service.name" },
  { "function": "mean", "field_name": "transaction_throughput",
    "by_field_name": "transaction.type", "partition_field_name": "service.name" },
  { "function": "high_mean", "field_name": "failed_transaction_rate",
    "by_field_name": "transaction.type", "partition_field_name": "service.name" },
  { "function": "low_count",
    "by_field_name": "transaction.type", "partition_field_name": "service.name" }
]
```

## URL을 훑는 스캐닝 IP

외부 IP는 수가 많고 대부분 이력이 짧아 IP마다 baseline을 만들기 어렵습니다. 같은 시간대의 다른 IP와 비교하는 편이 효과적입니다.

| 항목 | 내용 |
| --- | --- |
| 목표 | 다른 client보다 서로 다른 URL을 유독 많이 요청하는 IP 찾기 |
| detector | `high_distinct_count(url)`, `over_field_name`: client IP |
| influencer | client IP |
| bucket span 등 | 1h |
| 이렇게 구성한 이유 | population 분석은 entity가 많아도 개별 분석보다 자원을 적게 쓰고, 이력이 짧은 IP도 같은 시간대의 다른 IP와 비교할 수 있습니다. |
| 노이즈와 주의 | 검색 엔진 crawler나 사내 모니터링 봇은 정상적으로 URL을 많이 훑습니다. datafeed query로 빼거나, filter list를 `over` field(client IP) scope에 연결합니다. 이 job은 forecast를 만들 수 없습니다. |
| 참고한 제공 job | `url_scanning`(샘플), `source_ip_url_count_ecs`(Nginx, Apache) |

```json
{ "function": "high_distinct_count", "field_name": "url.keyword", "over_field_name": "clientip" }
```

## 수집 중단 감시

로그나 메트릭 수집이 조용히 멈추면 다른 모든 감시가 무력해집니다. dataset별로 건수가 평소보다 줄었는지 봅니다.

| 항목 | 내용 |
| --- | --- |
| 목표 | 데이터 소스(dataset)별 수집량 감소 감지 |
| detector | Metricbeat job은 `low_count` partition `event.dataset`. 로그 job은 `count` partition `event.dataset`에 `use_null: true` |
| bucket span 등 | Metricbeat job 10m(memory 15mb). 로그 job 15m, `results_retention_days` 120 |
| 이렇게 구성한 이유 | dataset마다 수집 주기와 양이 달라 독립 baseline이 필요합니다. `use_null`은 dataset 값이 없는 문서도 따로 감시하게 합니다. |
| 노이즈와 주의 | Agent 업그레이드나 점검 시간은 calendar로 등록합니다. 수집 지연이 잦으면 `query_delay`를 늘립니다. |
| 참고한 제공 job | `metricbeat_outages_ecs`, `log-entry-rate`(logs_ui_analysis) |

```json
{ "function": "count", "partition_field_name": "event.dataset", "use_null": true }
```

## 호스트 자원 지표와 내장 노이즈 rule

CPU iowait처럼 값이 아주 작을 때는 통계적으로는 큰 변화여도 실제 영향이 없는 경우가 많습니다. Elastic 제공 job은 이 노이즈를 custom rule로 기본 차단합니다.

| 항목 | 내용 |
| --- | --- |
| 목표 | 호스트별 iowait가 평소보다 높아지는 구간 감지 |
| detector | `high_mean(system.cpu.iowait.pct)`, partition `host.name` |
| custom rule | `actual`이 0.25보다 작으면 `skip_result` |
| bucket span 등 | 10m, memory 25mb, influencer `host.name` |
| 이렇게 구성한 이유 | 호스트마다 부하 수준이 달라 `partition`을 씁니다. rule은 의미 있는 절대 수준 아래의 결과만 지우고, 모델 학습에는 그대로 반영합니다(`skip_result`만 지정했기 때문). |
| 노이즈와 주의 | 임계값은 각 환경의 실제 운영 기준으로 다시 정합니다. |
| 참고한 제공 job | `high_mean_cpu_iowait_ecs`(metricbeat_system_ecs) |

```json
{
  "function": "high_mean",
  "field_name": "system.cpu.iowait.pct",
  "partition_field_name": "host.name",
  "custom_rules": [
    { "actions": ["skip_result"],
      "conditions": [ { "applies_to": "actual", "operator": "lt", "value": 0.25 } ] }
  ]
}
```

## 호스트별 드문 process

서버마다 평소 실행되는 process 목록이 다릅니다. 다른 서버에서는 흔한 process라도 이 서버에서는 처음 보는 것이라면 조사 대상입니다.

| 항목 | 내용 |
| --- | --- |
| 목표 | 각 호스트에서 드물게 실행된 process 찾기 |
| detector | `rare` by `process.name`, partition `host.name` |
| influencer | `host.name`, `host.id`, `process.name`, `user.name`, `event.module`, `process.executable`, `process.args` (7개) |
| bucket span 등 | 45m, memory 256mb |
| 이렇게 구성한 이유 | `partition`으로 호스트마다 독립된 분석을 하고, 그 안에서 `by`로 process별 출현 이력을 봅니다. 조사에 필요한 실행 경로와 인자를 influencer로 함께 남깁니다. |
| rare 계열 제약 | `exclude_frequent`와 함께 쓰지 않습니다. condition rule 대신 scope rule을 씁니다. forecast를 만들 수 없습니다. 학습에 최소 20개 bucket이 필요하고, 짧은 bucket span이 권장됩니다. |
| 노이즈와 주의 | 배포와 패치 시간은 calendar로 등록합니다. 승인된 관리 도구는 filter list를 `by` field(`process.name`) scope에 연결합니다. |
| 참고한 제공 job | `v3_rare_process_by_host_linux_ea`, `v3_rare_process_by_host_windows_ea` |

```json
{ "function": "rare", "by_field_name": "process.name", "partition_field_name": "host.name" }
```

## 평소와 다른 시각의 로그인

탈취된 계정은 실제 사용자와 다른 시간대에 쓰이는 경우가 많습니다. 사용자별 평소 로그인 시각과 다른 로그인을 찾습니다.

| 항목 | 내용 |
| --- | --- |
| 목표 | 사용자별로 평소와 다른 시각에 성공한 로그인 감지 |
| detector | `time_of_day` by `user.name`, over `source.geo.region_iso_code` |
| influencer | `source.ip`, `source.geo.region_iso_code`, `host.name`, `user.name`, `user.id`, `host.id`, `event.module` |
| bucket span 등 | 15m, memory 128mb |
| 주의 | `time_of_day`는 forecast를 만들 수 없고 Kibana 차트에 표시되지 않습니다(목록과 표로 확인). 시각 자체를 보는 분석이라 서머타임 전환의 영향을 직접 받을 수 있습니다(해석). 해외 데이터가 섞이면 DST calendar를 검토합니다. |
| 노이즈와 주의 | 교대 근무자, 출장자는 filter list를 `by` field(`user.name`) scope에 연결합니다. |
| 참고한 제공 job | `auth_rare_hour_for_a_user_ea`(security_auth) |

```json
{ "function": "time_of_day", "by_field_name": "user.name", "over_field_name": "source.geo.region_iso_code" }
```

## DNS tunneling 의심

DNS 질의 이름에 데이터를 실어 내보내면 질의 문자열의 정보량(무작위성)이 평소보다 커집니다.

| 항목 | 내용 |
| --- | --- |
| 목표 | 도메인(eTLD)별로 다른 도메인보다 정보량이 높은 DNS 질의 찾기 |
| detector | `high_info_content(dns.question.name)`, over `dns_question_etld` |
| custom rule | `actual`이 350보다 작으면 `skip_result` |
| influencer | `destination.ip`, `host.name`, `host.id`, `dns_question_etld`, `dns.question.type`, `dns.question.name`, `source.ip` |
| bucket span 등 | 15m, memory 256mb |
| 이렇게 구성한 이유 | population 분석으로 도메인끼리 비교하고, 정보량이 일정 수준 미만인 결과는 rule로 지웁니다. Elastic Security 문서도 이 job의 임계값 조정을 노이즈를 줄이는 예로 듭니다. |
| 참고한 제공 job | `dns_tunneling_ea`(security_network) |

## 로그 메시지 패턴 급증

같은 에러라도 메시지 문자열은 ID, 시각, 숫자 때문에 매번 다릅니다. categorization은 메시지의 고정된 부분을 기준으로 category를 만들어 category별 건수를 분석합니다.

| 항목 | 내용 |
| --- | --- |
| 목표 | dataset별로 특정 메시지 유형이 평소보다 많이 나오는 구간 감지 |
| 설정 | `categorization_field_name: message`. detector는 `count` by `mlcategory`, partition `event.dataset`, `use_null: true` |
| per-partition categorization | `enabled: true`, `stop_on_warn: true`. `mlcategory`를 쓰는 모든 detector가 같은 partition field를 써야 합니다. |
| bucket span 등 | 15m, memory 100mb, `results_retention_days` 120, influencer `event.dataset`와 `mlcategory` |
| 이렇게 구성한 이유 | dataset마다 메시지 종류가 달라 category도 dataset별로 따로 만듭니다. `stop_on_warn`은 categorization이 잘 안 되는 dataset만 분석을 멈춰, 그 비용을 계속 치르지 않게 합니다. |
| 한국어 로그 | 기본 tokenizer(`ml_standard`)는 영어 로그 기준입니다. 한국어 메시지는 `categorization_analyzer`를 따로 정의하고 결과 품질을 확인합니다. |
| 참고한 제공 job | `log-entry-categories-count`(logs_ui_categories) |

```json
"categorization_field_name": "message",
"per_partition_categorization": { "enabled": true, "stop_on_warn": true },
"detectors": [
  { "function": "count", "by_field_name": "mlcategory",
    "partition_field_name": "event.dataset", "use_null": true }
]
```

## 용량 추세 예측

디스크 사용률, 트래픽처럼 꾸준히 늘어나는 지표는 이상 감지와 함께 앞으로의 추세도 보고 싶어집니다. forecast는 학습된 모델로 미래 값과 범위를 계산합니다.

| 항목 | 내용 |
| --- | --- |
| 목표 | 호스트나 서비스별 지표의 다음 1~4주 추세 확인 |
| 구성 | forecast가 가능한 function(`count`, `mean`, `max` 등)과 `partition` 또는 `by` split. population, `rare`, `freq_rare`, `lat_long`, `time_of_day`, `time_of_week` detector가 하나라도 있으면 job 전체에서 forecast 불가 |
| 실행 | 열려 있는 job에 forecast API 호출. `duration` 기본 1d, 결과 보존 `expires_in` 기본 14d, `max_model_memory` 기본 20mb(최대 500mb) |
| 주의 | job당 동시에 3개까지 실행됩니다. 메모리 상태가 정상일 때만 실행되며, 학습 초기의 forecast는 정확도가 낮습니다. 예측하려는 기간만큼의 과거 데이터가 있어야 합니다. |
| 설계 시사점 | forecast가 필요한 지표는 population detector와 같은 job에 넣지 않습니다. |

```json
POST _ml/anomaly_detectors/<job_id>/_forecast
{ "duration": "14d", "expires_in": "30d" }
```

## 같은 목적, job 3개와 advanced job 1개

Kibana 샘플 웹 로그 module은 세 가지 관점을 job 3개로 나눠 만듭니다. 같은 세 detector를 advanced job 하나에 넣을 수도 있습니다([실습 Lab 2](../08-hands-on-lab/#lab-2-advanced-job-하나에-detector-3개)).
어느 쪽이 맞는지는 무엇을 공유해도 되는지에 달려 있습니다.

| 관점 | job 3개 (Kibana 샘플 module) | advanced job 1개 (detector 3개) |
| --- | --- | --- |
| 구성 | `low_request_rate`(`low_count`), `response_code_rates`(`count` partition 응답코드), `url_scanning`(`high_distinct_count` over client IP). 모두 1h | 같은 세 detector를 한 job에. bucket span 1h 공유 |
| 결과 보기 | job마다 swim lane이 따로입니다. | overall score 하나와 detector를 가로지르는 top influencer(client IP, 응답코드)를 봅니다. |
| aggregation | `low_request_rate`만 aggregation 입력(`summary_count_field_name: doc_count`)을 씁니다. | `summary_count_field_name`은 모든 detector에 적용돼 그대로 옮길 수 없습니다. 원본 문서를 읽습니다. |
| forecast | `low_request_rate`와 `response_code_rates`는 forecast를 만들 수 있습니다. | `over` detector가 있어 job 전체에서 forecast를 만들 수 없습니다. |
| model plot | job마다 켜고 끌 수 있습니다. | job 단위로 한 번에 정합니다. |
| 알림 | rule 3개 또는 job group 하나로 관리합니다. | rule 하나로 전체를 봅니다. detector별로 다르게 알리려면 record 결과와 KQL filter를 씁니다. |
| 변경 | 한 job만 다시 만들면 됩니다. | detector 하나를 바꿔도 job 전체를 다시 만들고 학습시켜야 합니다. |

:::tip[정리]
같은 화면에서 증상을 함께 보는 것이 목적이면 detector를 묶습니다. forecast, aggregation, bucket span, 알림 정책 중 하나라도 다르게 가져가야 하면 job을 나눕니다.
Elastic이 샘플 module을 job 3개로 나눈 것도, 각 job에 맞는 입력 방식(aggregation)과 forecast 가능성을 유지하려는 선택으로 볼 수 있습니다(해석).
:::

## 참고 문서

- [Kibana anomaly detection job wizards (제공 구성 목록)](https://www.elastic.co/docs/reference/machine-learning/supplied-anomaly-detection-configurations)
- [Kibana 제공 job 설정 (data_recognizer modules)](https://github.com/elastic/kibana/tree/main/x-pack/platform/plugins/shared/ml/server/models/data_recognizer/modules)
- [Tutorial: Getting started with anomaly detection](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-getting-started)
- [Optimizing anomaly results (Elastic Security)](https://www.elastic.co/docs/solutions/security/advanced-entity-analytics/optimizing-anomaly-results)
- [Predict future behavior of a time series (forecast API)](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-ml-forecast)
