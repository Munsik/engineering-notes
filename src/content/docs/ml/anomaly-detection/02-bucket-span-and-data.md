---
title: Bucket span과 데이터 준비
description: bucket span 선택 기준, 학습에 필요한 데이터량, datafeed에서 미리 걸러내기, 지연 도착 데이터, 희소 데이터와 aggregation 입력을 다룹니다.
sidebar:
  label: 02. Bucket span과 데이터 준비
  order: 2
---

## Bucket span

bucket span은 분석 해상도이면서 알림 지연의 하한입니다.
API 기본값은 `5m`이고 보통 5분~1시간을 씁니다. 하루를 정수 개의 bucket으로 나누는 값이어야 합니다.
분석하려는 해상도, 데이터 입력 빈도, 이상이 보통 지속되는 시간, 알림이 필요한 속도를 함께 보고 정합니다.

Elastic이 제공하는 job의 bucket span은 용도에 따라 이렇게 다릅니다.

| 용도 | bucket span | 제공 job |
| --- | --- | --- |
| 호스트 인증 시도 급증 | 5m | `suspicious_login_activity_ea` |
| CPU iowait, 수집 중단 | 10m | `high_mean_cpu_iowait_ecs`, `metricbeat_outages_ecs` |
| 웹 응답코드, APM 지표, 로그 건수 | 15m | `status_code_rate_ecs`, `apm_tx_metrics`, `log-entry-rate` |
| 호스트별 드문 process | 45m | `v3_rare_process_by_host_linux_ea` |
| URL 스캐닝 IP(population) | 1h | `source_ip_url_count_ecs`, `url_scanning` |

- **rare 계열은 짧게 잡습니다.** rare function은 bucket 안에 한 번이라도 나타났는지를 모델링합니다. bucket이 길면 무엇이든 한 번쯤 나타나 덜 드물어 보입니다. 공식 문서도 1시간보다 짧게, 보통 분 단위를 권장합니다.
- **짧을수록 자원을 많이 씁니다.** cardinality가 높을수록 더 그렇습니다.
- **aggregation datafeed를 쓰면** bucket span이 date histogram의 interval로 나누어떨어져야 합니다.
- **긴 bucket span은 짧은 spike를 묻습니다.** 짧은 이상을 잡아야 한다면 bucket span을 줄이는 것이 먼저입니다.

## 학습에 필요한 데이터량

| function 종류 | 최소 데이터 |
| --- | --- |
| `mean`, `min`, `max`, `median` 같은 sampled metric | 비어 있지 않은 bucket 8개 또는 2시간 중 큰 쪽 |
| 그 외 non-zero, non-null 값과 count 기반 값 | 비어 있지 않은 bucket 4개 또는 2시간 중 큰 쪽 |
| `count`, `sum` (빈 bucket도 의미가 있는 function) | bucket 8개 또는 2시간 |
| `rare` | 보통 약 20개 bucket. population이면 더 빠를 수 있음 |

위 값은 결과가 나오기 시작하는 최소 조건일 뿐입니다.
공식 문서가 안내하는 경험칙은 주기성이 있는 데이터라면 3주 이상, 주기성이 없다면 수백 개 bucket입니다. 주간 패턴을 배우려면 최소 3주는 지나야 한다는 뜻입니다.
forecast를 쓸 계획이면 예측하려는 기간만큼의 과거 데이터도 필요합니다.
학습 초기의 결과는 신뢰도가 낮으므로 알림은 학습 기간이 지난 뒤에 켭니다.

## Datafeed에서 미리 걸러내기

분석할 필요가 없는 데이터는 datafeed query 단계에서 빼는 것이 가장 확실합니다.
모델에 아예 들어가지 않으므로 메모리도 줄고 노이즈도 생기지 않습니다.

Elastic Security의 인증 job이 좋은 예입니다.
query에서 Elastic Agent, Beats 같은 수집기 자체의 process를 `must_not`으로 빼고, 성공한 인증 이벤트만 `filter`로 고릅니다.
query는 `match`보다 `term` filter처럼 단순하고 빠른 조건으로 씁니다.
형태는 아래와 같습니다. 값은 설명용이며, 실제 제공 job의 조건과 같지 않습니다.

```json
"query": {
  "bool": {
    "filter": [ { "term": { "event.outcome": "success" } } ],
    "must_not": [ { "terms": { "process.name": ["elastic-agent", "metricbeat", "filebeat"] } } ]
  }
}
```

## 지연 도착 데이터

datafeed가 이미 처리한 시간대에 뒤늦게 색인된 문서는 분석되지 않습니다.

- `query_delay`를 늘리면 늦게 색인되는 데이터를 기다렸다가 조회합니다. 기본값은 60~120초 사이의 임의 값입니다. 같은 노드의 여러 job이 동시에 조회하지 않게 분산하려는 것입니다.
- 지연이 일정하게 반복되면 `low_count` 같은 function에서 오탐이 생길 수 있습니다. 데이터가 덜 들어온 bucket을 "건수가 줄었다"로 보기 때문입니다.
- delayed data check는 기본적으로 2시간과 bucket span의 8배 중 큰 범위를 다시 검사합니다. 누락이 있으면 annotation과 `Datafeed missed XXXX documents due to ingest latency` 메시지를 남깁니다.
- 이 메시지가 보이면 `query_delay`를 먼저 늘립니다. 그래도 계속되면 수집 지연의 원인(트래픽 burst, ingest pipeline 설정, 시스템 시계 불일치)을 확인합니다.

:::tip
`query_delay`는 실제 수집 지연의 상위 백분위(예: P95)에 여유를 더한 값으로 잡는 것이 무난합니다. 지연 분포는 문서의 시간 field와 `event.ingested`의 차이로 확인할 수 있습니다.
:::

## 희소 데이터와 aggregation 입력

- **빈 bucket을 어떻게 볼지 정합니다.** `count`와 `sum`은 빈 bucket을 0으로 보고 학습합니다. 빈 구간을 무시하려면 `non_zero_count`, `non_null_sum`을 씁니다.
- **한쪽 방향만 필요하면 one-sided function을 씁니다.** 기본 function은 높은 쪽과 낮은 쪽을 모두 봅니다. `high_count`, `low_count`, `high_mean`처럼 방향을 지정하면 원하지 않는 방향의 결과가 나오지 않습니다.
- **aggregation datafeed는 data node가 먼저 요약해 ML node 부담을 줄입니다.** 다음 조건을 지켜야 합니다.
  - `date_histogram` 또는 `composite` aggregation과, 그 안에 시간 field의 `max` aggregation이 필요합니다.
  - `time_zone`은 UTC여야 합니다.
  - aggregation 이름과 field 이름이 같아야 하고, job에 `summary_count_field_name`을 설정합니다.
- **interval 권장값**: metric과 sum 계열은 bucket span의 1/10, count와 rare는 bucket span과 같게 둡니다. field cardinality가 1,000을 넘으면 `composite` aggregation을 씁니다.
- **chunking**: aggregation을 쓰는 datafeed는 `chunking_config.mode`를 `manual`로 두는 것이 권장됩니다. aggregation이 없으면 `auto`가 권장값입니다.

## 참고 문서

- [Run a job](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-ad-run-jobs)
- [Handling delayed data](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-delayed-data-detection)
- [Aggregating data for faster performance](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-configuring-aggregation)
- [Function reference](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-functions)
- [Rare functions](https://www.elastic.co/docs/reference/machine-learning/ml-rare-functions)
- [Troubleshooting and FAQ](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-ad-troubleshooting)
