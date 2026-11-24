---
title: 운영 체크리스트
description: anomaly detection 알림 rule과 job health rule 설계, 여러 job 묶어 보기, datafeed 운영 설정, 설정 변경 순서, 장애 대응, 제약사항, 도입 단계별 확인 항목을 다룹니다.
sidebar:
  label: 06. 운영 체크리스트
  order: 6
---

## 알림 설계

Kibana의 Stack Management → Rules에서 **Anomaly detection** rule과 **Anomaly detection jobs health** rule을 함께 만듭니다.
alert rule만 있으면 datafeed가 멈추거나 메모리 한도에 걸려도 "이상 없음"처럼 조용해 보이기 때문입니다.

### Anomaly detection rule

| 항목 | 권장 |
| --- | --- |
| 결과 유형 | 상위 알림은 bucket. 원인까지 알리려면 record나 influencer를 씁니다. |
| Anomaly filter(KQL) | record와 influencer 결과 유형에서 특정 partition 값이나 `actual` / `typical` 조건으로 범위를 좁힙니다. 예: `partition_field_value: "404"`. Elastic Stack 9.3부터 GA입니다. |
| severity 임계값 | 기본 75. 학습이 끝난 뒤 알림 건수를 보며 조정합니다. |
| check interval | job의 bucket span과 비슷하게 둡니다. |
| lookback interval | 기본값은 bucket span과 datafeed의 query delay로 계산됩니다. 기본보다 낮추면 이상을 놓칠 수 있습니다. |
| Alert delay | 연속 N회 일치한 뒤에 알립니다. 일회성 spike를 거르는 데 씁니다. |
| Flapping Detection | 자주 상태가 바뀌는 알림을 줄입니다. |
| Include interim results | 빠른 알림이 필요하면 켭니다. datafeed `frequency`가 bucket span보다 짧으면 마지막 bucket의 interim 결과가 먼저 나오고, 나중에 확정 결과로 바뀝니다. 확정된 결과로만 알리려면 끕니다. |
| 알림 문구 변수 | `context.topInfluencers`, `context.topRecords`, `context.anomalyExplorerUrl`을 넣어 받는 사람이 바로 조사를 시작할 수 있게 합니다. |

:::note[중복 알림 방지]
최근 버전의 rule은 결과에 `event.ingested`(결과가 기록된 시각)가 있으면 이전 실행 이후 새로 기록된 결과만 평가합니다.
그래서 check interval이 bucket span보다 짧아도 같은 결과로 알림이 여러 번 가지 않습니다.
이 field가 없는 예전 결과에는 계속 lookback interval이 적용됩니다.
:::

Rule을 저장하기 전에 Test 버튼으로 선택한 기간에 알림이 몇 건 나왔을지 미리 볼 수 있습니다.

### Anomaly detection jobs health rule

| 점검 | 알려 주는 상황 |
| --- | --- |
| Datafeed is not started | job은 열려 있는데 datafeed가 시작되지 않음 |
| Model memory limit reached | 메모리 상태가 `soft_limit`(한도의 60% 초과) 또는 `hard_limit`(한도 초과)에 도달 |
| Data delay has occurred | 누락된 문서 수가 설정한 임계값을 넘음 |
| Errors in job messages | job 메시지에 에러가 기록됨. rule을 만든 이후의 에러만 봅니다. |

대상은 job group이나 `*`로 지정할 수 있습니다. group을 지정하면 나중에 그 group에 추가한 job도 자동으로 포함됩니다.

## Job을 나눴을 때 묶어 보기

job을 여러 개로 나눴더라도 overall buckets API로 묶어 볼 수 있습니다.
job ID 목록이나 job group을 지정하면, 시간 구간마다 job별 최고 bucket 점수 중 상위 `top_n`개의 평균을 `overall_score`로 돌려줍니다.

- `top_n`이 1이면 하나라도 크게 이상하면 점수가 높습니다.
- `top_n`이 job 수와 같으면 모든 job이 동시에 이상할 때만 점수가 높습니다.

```json
GET _ml/anomaly_detectors/web-jobs/results/overall_buckets
{ "top_n": 2, "overall_score": 50, "exclude_interim": true }
```

- job에는 `groups`를 붙여 둡니다. calendar 연결, health rule 대상, overall buckets 조회를 그룹 단위로 할 수 있습니다.
- job과 detector에는 무엇을 왜 보는지 `description`을 자세히 적습니다. Elastic도 제공 job에 description, groups, `custom_settings`(생성 주체, 설정 개정 번호)를 함께 관리합니다.

## Datafeed 운영

| 설정 | 내용 |
| --- | --- |
| `query_delay` | 기본 60~120초 사이 임의 값. 같은 node의 여러 job이 동시에 조회하지 않게 분산합니다. 수집 지연이 길면 늘립니다. |
| `frequency` | 실시간 조회 주기. 기본은 bucket span(짧을 때) 또는 그 일부입니다. aggregation을 쓰면 interval로 나누어떨어져야 합니다. |
| `delayed_data_check_config` | 늦게 들어온 데이터 검사. 기본 `check_window`는 2시간과 bucket span 8배 중 큰 값입니다. |
| `max_empty_searches` | 데이터를 한 번도 보지 못한 실시간 datafeed를 빈 조회 N회 뒤 자동으로 멈춥니다. Elastic Security 제공 job은 10입니다. |
| `chunking_config` | 긴 기간을 나눠 조회합니다. aggregation이 없으면 `auto`, 있으면 `manual`을 권장합니다. |
| `runtime_mappings` | datafeed에서만 쓰는 계산 field. influencer용 field를 만들 때 유용합니다. |
| 권한 | datafeed는 만들거나 수정한 사용자의 role을 저장해 그 권한으로 조회합니다. role 이름이 바뀌어도 그대로 돌지만, role의 권한이 바뀌면 영향을 받습니다. API key로 만들었다면 그 key의 권한을 따릅니다. |

## 설정을 바꾸는 순서

메모리 한도나 datafeed 설정을 바꿀 때는 아래 순서를 따르는 것이 안전합니다. 열려 있는 job에 바로 적용되지 않거나 거부되는 설정이 있기 때문입니다.

```json
POST _ml/datafeeds/datafeed-<job_id>/_stop
POST _ml/anomaly_detectors/<job_id>/_close

POST _ml/anomaly_detectors/<job_id>/_update
{ "analysis_limits": { "model_memory_limit": "2gb" } }

POST _ml/datafeeds/datafeed-<job_id>/_preview   // 바꾼 datafeed가 원하는 데이터를 읽는지 먼저 확인

POST _ml/anomaly_detectors/<job_id>/_open
POST _ml/datafeeds/datafeed-<job_id>/_start
```

## 장애와 복구

- **메모리부터 봅니다.** `memory_status`가 `hard_limit`이면 그 뒤의 증상(datafeed 정지, 데이터 누락 경고)은 대부분 결과입니다. 한도 조정이나 cardinality 축소를 먼저 하고, 그다음에 `query_delay` 같은 설정을 봅니다. [메모리와 규모](../03-memory-and-scale/#메모리-상태-읽기) 참고.
- **job이 failed 상태가 되면** datafeed를 force 옵션으로 멈추고, job을 force close한 뒤 다시 시작합니다.
- **재시작 직후 다시 실패하면** 일시적인 문제가 아닙니다. job stats에서 job이 할당된 node를 확인하고, 그 node 로그에서 job ID가 들어간 예외를 찾습니다. job 메시지는 `.ml-notifications-*`에서도 볼 수 있습니다.
- **오염된 모델은** snapshot을 되돌리거나(revert) job을 reset합니다. [모델 복구와 재실행](../05-noise-and-exceptions/#모델-복구와-재실행) 참고.
- **정확도는** 실제 인시던트와 anomaly 결과가 얼마나 겹치는지로 평가합니다. record 결과의 score, 95% 신뢰 구간, actual 값을 집계해 정량 평가할 수도 있습니다.

## 알아둘 제약사항

| 구분 | 내용 |
| --- | --- |
| split field 이름 | `by`, `count`, `over`라는 이름의 field는 split에 쓸 수 없습니다. |
| 배열 field | 분석할 때 정렬되고 중복이 제거된 쉼표 구분 문자열로 바뀝니다. |
| 시간 field | runtime field면 성능이 크게 떨어집니다. 색인된 field를 씁니다. |
| forecast | job당 동시 3개까지. population job, `lat_long`, `rare`, `freq_rare`, `time_of_day`, `time_of_week`가 있는 job은 만들 수 없습니다. |
| Kibana 차트 | `freq_rare`, `time_of_day`, `time_of_week`, `lat_long` 등은 Single Metric Viewer와 Anomaly Explorer에 차트가 없습니다. 목록과 표로 봅니다. |
| frozen tier, rollup | Kibana wizard로는 frozen tier 데이터에 job을 만들 수 없어 API를 씁니다. rollup index는 지원하지 않습니다. |
| categorization | 기본 tokenizer(`ml_standard`)와 사전은 영어 로그를 기준으로 만들어졌습니다. 한국어 로그는 `categorization_analyzer`를 따로 정의하고 결과 품질을 확인합니다. |
| `multivariate_by_fields` | API 문서에 내부 전용 기능으로 적혀 있습니다. 공식 지원 대상이 아니므로 쓰지 않습니다. |

## 도입 단계별 확인 항목

| 단계 | 확인 항목 |
| --- | --- |
| 1. 데이터 | 시간 field 색인 여부, 수집 지연 분포, split field cardinality, 학습에 쓸 기간, datafeed에서 뺄 데이터 |
| 2. Job 설계 | job과 detector 분리 기준([01](../01-job-design/#판단-기준)), function과 split, bucket span, influencer, estimate API로 메모리 추정 |
| 3. 학습 | 최소 데이터량 충족, 주기성이 있으면 3주 이상, 학습 중에는 알림 끄기 |
| 4. 결과 검토 | 임계값 이상 건수(신호 대비 노이즈), 상위 이상과 실제 인시던트 대조, 최대 메모리 사용량, 노이즈 유형 분류 |
| 5. 튜닝 | datafeed query, filter list, custom rule, calendar, one-sided function, `exclude_frequent` 적용 후 재평가. detector를 바꿔야 하면 clone |
| 6. 알림 | severity, Alert delay, check interval, job health rule을 함께 설정 |
| 7. 운영 | 메모리 상태 점검, 결과와 snapshot 보존 기간, 이벤트와 서머타임 calendar 갱신, 설정 변경 이력 관리 |

:::note
Elastic Cloud Serverless에서는 Elastic Agent Builder와 대화하며 anomaly detection job을 만드는 기능이 experimental로 제공됩니다. Elastic Stack은 planned로 표기되어 있습니다.
:::

## 참고 문서

- [Generating alerts for anomaly detection jobs](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-configuring-alerts)
- [Get overall bucket results (API)](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-ml-get-overall-buckets)
- [Create an anomaly detection job (API)](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-ml-put-job)
- [Troubleshooting and FAQ](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-ad-troubleshooting)
- [Anomaly detection limitations](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-limitations)
