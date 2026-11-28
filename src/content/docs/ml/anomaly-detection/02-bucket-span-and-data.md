---
title: Bucket span과 데이터 준비
description: bucket span을 고르는 기준, 학습에 필요한 데이터 양, datafeed에서 미리 걸러 내기, 늦게 들어오는 데이터, sparse 데이터와 aggregation 입력을 다룹니다.
sidebar:
  label: 02. Bucket span과 데이터 준비
  order: 2
---

bucket span은 탐지 해상도와 alert가 올 수 있는 가장 빠른 시점을 함께 정하고, job을 만든 뒤에는 바꿀 수 없습니다.
데이터 준비가 덜 된 채 시작하면 학습 초반의 결과와 늦게 들어온 데이터 때문에 오탐이 쌓이고, 운영팀이 alert를 믿지 않게 됩니다.
bucket span을 고르는 기준과 학습을 시작하기 전에 데이터 쪽에서 해 둘 일을 봅니다.

:::note[기준]
Elasticsearch, Kibana 9.x 기준입니다. 공식 문서는 2026년 11월에 다시 확인했습니다. 제공 job의 bucket span은 GitHub elastic/kibana main 브랜치의 설정을 봤습니다.
:::

## Bucket span

bucket span은 분석 해상도이자, alert가 아무리 빨라도 그보다 빨리 올 수는 없는 하한선입니다.
API 기본값은 `5m`이고 보통 5분에서 1시간 사이를 씁니다. 하루를 정수 개의 bucket으로 나눌 수 있는 값이어야 합니다.
어느 정도 해상도로 보고 싶은지, 데이터가 얼마나 자주 들어오는지, 이상이 보통 얼마나 이어지는지, alert가 얼마나 빨리 필요한지를 같이 놓고 정합니다.

Elastic이 제공하는 job들은 용도에 따라 bucket span을 꽤 다르게 잡습니다.

| 용도 | bucket span | 제공 job |
| --- | --- | --- |
| 호스트 인증 시도 급증 | 5m | `suspicious_login_activity_ea` |
| CPU iowait, 수집 중단 | 10m | `high_mean_cpu_iowait_ecs`, `metricbeat_outages_ecs` |
| 웹 응답코드, APM 지표, 로그 건수 | 15m | `status_code_rate_ecs`, `apm_tx_metrics`, `log-entry-rate` |
| 호스트별 드문 process | 45m | `v3_rare_process_by_host_linux_ea` |
| URL 스캐닝 IP(population) | 1h | `source_ip_url_count_ecs`, `url_scanning` |

rare 계열 function은 bucket 안에 한 번이라도 나타났는지를 봅니다. bucket이 길면 웬만한 값은 한 번쯤 나타나기 때문에 덜 드물어 보입니다.
그래서 공식 문서도 rare는 1시간보다 짧게, 보통 분 단위로 잡으라고 합니다.

반대로 bucket span이 길면 짧은 spike가 묻힙니다. 몇 분짜리 이상을 잡아야 한다면 bucket span부터 줄여야 합니다.
다만 짧을수록, 그리고 cardinality가 높을수록 자원을 많이 씁니다.

aggregation datafeed를 쓴다면 bucket span이 date histogram의 interval로 나누어떨어져야 합니다.

## 학습에 필요한 데이터 양

| function 종류 | 최소 데이터 |
| --- | --- |
| `mean`, `min`, `max`, `median` 같은 sampled metric | 비어 있지 않은 bucket 8개 또는 2시간 중 큰 쪽 |
| 그 외 non-zero, non-null 값과 count 기반 값 | 비어 있지 않은 bucket 4개 또는 2시간 중 큰 쪽 |
| `count`, `sum` (빈 bucket도 의미가 있는 function) | bucket 8개 또는 2시간 |
| `rare` | 보통 bucket 20개 정도. population이면 더 빨리 될 수 있음 |

이건 결과가 나오기 시작하는 최소 조건일 뿐입니다.
공식 문서가 말하는 경험칙은 주기성이 있는 데이터라면 3주 이상, 없다면 bucket 수백 개입니다. 주간 패턴을 배우려면 적어도 3주는 지나야 한다는 얘기입니다.
forecast까지 쓸 생각이라면 예측하려는 기간만큼의 과거 데이터도 있어야 합니다.

학습 초반의 결과는 믿기 어렵습니다. alert는 학습 기간이 충분히 지난 뒤, [과거 데이터로 검증](../06-operations/#alert를-켜기-전에-검증하기)을 마치고 켜세요.

## Datafeed에서 미리 걸러 내기

분석할 필요가 없는 데이터는 datafeed query에서 빼는 게 가장 깔끔합니다.
모델에 아예 들어가지 않으니 메모리도 아끼고 noise도 안 생깁니다.

Elastic Security의 인증 job이 이렇게 합니다. query에서 Elastic Agent나 Beats 같은 수집기 자신의 process는 `must_not`으로 빼고, 성공한 인증 이벤트만 `filter`로 고릅니다.
조건은 `match`보다 `term` filter처럼 단순하고 빠른 것으로 씁니다.

대략 아래와 같은 형태입니다. 값은 설명하려고 넣은 것이고, 실제 제공 job의 조건과는 다릅니다.

```json
"query": {
  "bool": {
    "filter": [ { "term": { "event.outcome": "success" } } ],
    "must_not": [ { "terms": { "process.name": ["elastic-agent", "metricbeat", "filebeat"] } } ]
  }
}
```

비율(0~1) 값을 정수 %로 바꾸는 것처럼 계산이 필요한 field는 datafeed의 `runtime_mappings`로 만들 수 있습니다. 원본 index를 건드리지 않아도 됩니다. [09장 사용률 변환](../09-manufacturing-aiops/#사용률-변환)이 이렇게 해서 custom rule 임계값을 읽기 쉽게 만듭니다.

## 늦게 들어오는 데이터

datafeed가 이미 지나간 시간대에 뒤늦게 색인된 문서는 분석되지 않습니다.

`query_delay`를 늘리면 늦게 색인되는 데이터를 기다렸다가 읽습니다. 기본값은 60~120초 사이의 임의 값인데, 같은 node의 여러 job이 한꺼번에 조회하지 않도록 일부러 흩어 놓은 것입니다.

ingest 지연이 일정하게 반복되면 `low_count` 같은 function에서 오탐이 생길 수 있습니다. 데이터가 덜 들어온 bucket을 "건수가 줄었다"고 보기 때문입니다.

delayed data check는 기본적으로 2시간과 bucket span 8배 중 더 긴 범위를 다시 훑어봅니다. 빠진 문서가 있으면 annotation을 남기고 `Datafeed missed XXXX documents due to ingest latency`라는 메시지를 기록합니다.
이 메시지가 보이면 `query_delay`부터 늘려 보세요. 그래도 계속 나온다면 ingest 지연의 원인을 찾아야 합니다. 현장에서는 트래픽 burst, 무거운 ingest pipeline, 서버 시계 차이가 흔한 원인이었습니다. 실시간성이 꼭 필요하지 않다면 공식 문서는 그대로 두는 것도 흔한 선택이라고 설명합니다.

:::tip
`query_delay`는 실제 ingest 지연의 상위 백분위(예: P95)에 여유를 조금 더한 값으로 잡으면 무난하다고 봅니다. 지연 분포는 문서의 시간 field와 `event.ingested`의 차이로 볼 수 있습니다.
:::

## Sparse 데이터와 aggregation 입력

`count`와 `sum`은 빈 bucket의 영향을 크게 받습니다. 데이터가 없는 구간도 "0건"이라는 의미가 있는 값으로 학습하기 때문입니다. 데이터가 원래 띄엄띄엄 들어와서 빈 구간이 중요하지 않다면 `non_zero_count`, `non_null_sum`을 씁니다. 다만 이 둘은 population 분석을 지원하지 않습니다.

기본 function은 높아지는 쪽과 낮아지는 쪽을 모두 봅니다. 한쪽만 궁금하다면 `high_count`, `low_count`, `high_mean`처럼 방향을 정한 function을 쓰세요. 원하지 않는 방향의 결과가 아예 나오지 않습니다.

aggregation datafeed를 쓰면 data node가 데이터를 먼저 요약해서 넘기기 때문에 ML node의 부담이 줄어듭니다. 대신 지켜야 할 조건이 있습니다.

- `date_histogram` 또는 `composite` aggregation이 있어야 하고, 그 안에 시간 field의 `max` aggregation이 들어가야 합니다.
- `time_zone`은 UTC여야 합니다.
- aggregation 이름과 field 이름을 맞추고, job에 `summary_count_field_name`을 설정합니다.
- interval은 metric과 sum 계열이면 bucket span의 1/10, count와 rare면 bucket span과 같게 두는 것이 권장값입니다.
- field cardinality가 1,000을 넘으면 `composite` aggregation을 씁니다.
- `chunking_config.mode`는 aggregation이 있으면 `manual`, 없으면 `auto`가 권장값입니다.

APM metric index를 `composite` aggregation으로 읽는 실제 예는 [09장 A2 핵심 MES 트랜잭션](../09-manufacturing-aiops/#a2-핵심-mes-트랜잭션-mes-apm-key-tx)에 있습니다.

## 참고 문서

- [Run a job](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-ad-run-jobs)
- [Handling delayed data](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-delayed-data-detection)
- [Aggregating data for faster performance](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-configuring-aggregation)
- [Function reference](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-functions)
- [Rare functions](https://www.elastic.co/docs/reference/machine-learning/ml-rare-functions)
- [Troubleshooting and FAQ](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-ad-troubleshooting)
