---
title: 실습
description: Kibana 샘플 웹 로그로 Elastic 제공 job 3개와, 같은 세 관점을 담은 advanced job 1개를 만들어 결과, 노이즈 rule, calendar, 알림, forecast, snapshot 복구를 직접 확인합니다.
sidebar:
  label: 08. 실습
  order: 8
---

## 준비

- Kibana Dev Tools Console에서 실행합니다. Machine Learning 권한(`machine_learning_admin` 등)이 필요합니다.
- 데이터는 Kibana 샘플 Web logs(`kibana_sample_data_logs`)입니다. Kibana 홈의 샘플 데이터 화면에서 추가합니다. 아래에 쓰는 field 이름(`timestamp`, `clientip`, `url.keyword`, `response.keyword`, `event.dataset`)은 Kibana가 제공하는 샘플 job 설정과 같습니다.
- 샘플 데이터의 시각은 추가한 시점 기준이고 일부는 미래 시각입니다. datafeed를 시작할 때 실시간(No end time)으로 두지 말고 `end`를 지정합니다.
- 실습 순서는 Kibana 샘플 job 3개를 만들고(Lab 1), 같은 세 관점을 advanced job 하나로 만든 뒤(Lab 2), 둘을 비교하는 흐름입니다(Lab 3).

:::note[Elastic Cloud Serverless]
Lab 3의 결과 조회 API 대신 [ES|QL의 `.ml-anomalies` view](../04-reading-results/#esql로-결과-조회하기)를 쓸 수 있습니다.
:::

## Lab 0. 데이터 확인

```json
GET kibana_sample_data_logs/_search
{
  "size": 0,
  "aggs": {
    "min_t": { "min": { "field": "timestamp" } },
    "max_t": { "max": { "field": "timestamp" } },
    "codes": { "cardinality": { "field": "response.keyword" } },
    "ips":   { "cardinality": { "field": "clientip" } },
    "urls":  { "cardinality": { "field": "url.keyword" } }
  }
}
```

`min_t`와 `max_t`가 분석할 시간 범위이고, cardinality 값은 Lab 2의 메모리 추정에 씁니다.

## Lab 1. Kibana 샘플 job 3개 만들기

1. Machine Learning → Data Visualizer에서 `kibana_sample_data_logs`를 고르면 "Kibana sample data web logs" 구성을 추천합니다. 또는 샘플 데이터 화면의 View data → ML jobs를 누릅니다.
2. 기본값으로 Create Jobs를 누르면 job 3개와 datafeed 3개가 만들어집니다.
   - `low_request_rate`: `low_count`
   - `response_code_rates`: `count`, partition `response.keyword`
   - `url_scanning`: `high_distinct_count` over `clientip`
   - 모두 bucket span 1h입니다.
3. Jobs 목록에서 세 job을 펼쳐 JSON 탭을 열고 detector와 datafeed 설정을 확인합니다. `low_request_rate`만 aggregation 입력(`summary_count_field_name: doc_count`)을 쓰는 것을 확인합니다.

## Lab 2. Advanced job 하나에 detector 3개

샘플 job 3개와 같은 세 관점을 detector 3개로 한 job에 넣습니다.
detector마다 split 방식이 달라(`partition`, `over`, 없음) multi-metric wizard로는 만들 수 없는 구성입니다.

**먼저 메모리를 추정합니다.** `<codes>`, `<ips>`는 Lab 0 결과로 바꿉니다.
`max_bucket_cardinality`는 한 bucket 안의 최대 개수인데, 모르면 전체 값으로 넣어 넉넉하게 봅니다.

```json
POST _ml/anomaly_detectors/_estimate_model_memory
{
  "analysis_config": {
    "bucket_span": "1h",
    "detectors": [
      { "function": "count", "partition_field_name": "response.keyword" },
      { "function": "high_distinct_count", "field_name": "url.keyword", "over_field_name": "clientip" },
      { "function": "low_count" }
    ],
    "influencers": ["clientip", "response.keyword"]
  },
  "overall_cardinality":    { "response.keyword": <codes>, "clientip": <ips> },
  "max_bucket_cardinality": { "response.keyword": <codes>, "clientip": <ips> }
}
```

**job과 datafeed를 만듭니다.** `model_memory_limit`은 위 추정값보다 여유 있게 잡습니다.

```json
PUT _ml/anomaly_detectors/lab-weblogs-advanced
{
  "description": "실습: 샘플 module의 세 관점을 detector 3개로 묶은 advanced job",
  "groups": ["lab"],
  "analysis_config": {
    "bucket_span": "1h",
    "detectors": [
      { "detector_description": "응답코드별 요청 수",
        "function": "count", "partition_field_name": "response.keyword" },
      { "detector_description": "client IP별 URL 다양성 (population)",
        "function": "high_distinct_count", "field_name": "url.keyword", "over_field_name": "clientip" },
      { "detector_description": "전체 요청 급감",
        "function": "low_count" }
    ],
    "influencers": ["clientip", "response.keyword"]
  },
  "analysis_limits": { "model_memory_limit": "64mb" },
  "data_description": { "time_field": "timestamp" },
  "model_plot_config": { "enabled": false },
  "results_index_name": "lab-weblogs-advanced"
}

PUT _ml/datafeeds/datafeed-lab-weblogs-advanced
{
  "job_id": "lab-weblogs-advanced",
  "indices": ["kibana_sample_data_logs"],
  "query": { "bool": { "filter": [ { "term": { "event.dataset": "sample_web_logs" } } ] } }
}

POST _ml/anomaly_detectors/lab-weblogs-advanced/_open

POST _ml/datafeeds/datafeed-lab-weblogs-advanced/_start
{ "start": "<Lab 0의 min_t>", "end": "<Lab 0의 max_t>" }
```

`end`까지 분석하면 datafeed가 멈춥니다. Kibana 샘플 job과 같은 데이터, 같은 bucket span이므로 결과를 직접 비교할 수 있습니다.
Jobs 목록에서 `lab-weblogs-advanced`를 펼쳐 detector 3개와 각각의 split 설정을 확인합니다.

## Lab 3. 결과 조회와 비교

```json
# job 상태와 model memory
GET _ml/anomaly_detectors/lab-weblogs-advanced/_stats

# record: detector_index로 어느 detector의 이상인지 구분 (0, 1, 2)
GET _ml/anomaly_detectors/lab-weblogs-advanced/results/records
{ "record_score": 50, "exclude_interim": true, "sort": "record_score", "desc": true, "page": { "size": 10 } }

# influencer: detector를 가로질러 집계된 원인 entity
GET _ml/anomaly_detectors/lab-weblogs-advanced/results/influencers
{ "influencer_score": 50, "sort": "influencer_score", "desc": true, "page": { "size": 10 } }

# 비교 1: advanced job 하나의 bucket 점수
GET _ml/anomaly_detectors/lab-weblogs-advanced/results/buckets
{ "anomaly_score": 50, "exclude_interim": true, "sort": "anomaly_score", "desc": true, "page": { "size": 5 } }

# 비교 2: 샘플 job 3개를 overall buckets로 묶어 보기
GET _ml/anomaly_detectors/low_request_rate,response_code_rates,url_scanning/results/overall_buckets
{ "top_n": 1, "overall_score": 50, "exclude_interim": true }
```

- `_stats`에서 `model_size_stats.memory_status`가 `ok`인지, `data_counts.processed_record_count`가 예상과 맞는지 먼저 봅니다.
- record 결과의 `detector_index`로 어느 detector가 잡았는지 확인하고, 같은 시각에 샘플 job 쪽 결과가 어떻게 나왔는지 비교합니다.
- overall buckets에서 `top_n`을 1, 2, 3으로 바꿔 보며 "여러 job이 동시에 이상할 때만" 점수가 높아지는 효과를 확인합니다.
- Kibana Anomaly Explorer에서 `lab-weblogs-advanced`와 샘플 job들을 함께 선택해 swim lane과 top influencers를 비교합니다.

## Lab 4. 노이즈 대응: filter와 custom rule

```json
# 알려진 정상 client를 filter list로 등록
PUT _ml/filters/lab-trusted-clients
{ "description": "알려진 정상 client", "items": ["<정상 IP 1>", "<정상 IP 2>"] }

# 안전한 절차: datafeed 중지, job close 후 수정
POST _ml/datafeeds/datafeed-lab-weblogs-advanced/_stop
POST _ml/anomaly_detectors/lab-weblogs-advanced/_close

# detector 0(응답코드별 count): 건수 20 미만은 결과 생략
# detector 1(population): 정상 client는 결과 생략 (over field scope)
POST _ml/anomaly_detectors/lab-weblogs-advanced/_update
{
  "detectors": [
    { "detector_index": 0,
      "custom_rules": [ { "actions": ["skip_result"],
        "conditions": [ { "applies_to": "actual", "operator": "lt", "value": 20 } ] } ] },
    { "detector_index": 1,
      "custom_rules": [ { "actions": ["skip_result"],
        "scope": { "clientip": { "filter_id": "lab-trusted-clients", "filter_type": "include" } } } ] }
  ]
}

POST _ml/anomaly_detectors/lab-weblogs-advanced/_open
```

rule이 detector마다 따로 붙는다는 점을 확인합니다.
rule은 이후 결과에만 적용되므로, 효과를 비교하려면 job을 reset하고 다시 돌립니다(Lab 8).

## Lab 5. Calendar

```json
PUT _ml/calendars/lab-maintenance
{ "description": "실습: 계획된 점검", "job_ids": ["lab"] }

POST _ml/calendars/lab-maintenance/events
{
  "events": [
    { "description": "planned maintenance",
      "start_time": "2026-12-01T01:00:00Z", "end_time": "2026-12-01T03:00:00Z" }
  ]
}

GET _ml/calendars/lab-maintenance/events
```

`job_ids`에 job group(`lab`)을 넣으면 그룹의 모든 job에 적용됩니다.
event는 분석 전에 등록해야 하므로, 실제 운영에서는 일정이 확정되는 대로 등록합니다.

## Lab 6. 알림 rule (Kibana UI)

1. Stack Management → Rules → Create rule에서 Anomaly detection을 고릅니다. job은 `lab-weblogs-advanced`, 결과 유형은 Bucket, severity는 75로 시작합니다.
2. check interval은 bucket span과 같은 1시간, Alert delay는 2, Flapping Detection은 켭니다. Test로 선택 기간의 알림 건수를 미리 봅니다.
3. 결과 유형을 Record로 한 rule을 하나 더 만들고, Anomaly filter(KQL)에 `partition_field_value: "404"`를 넣어 특정 응답코드만 알리도록 해 봅니다.
4. Anomaly detection jobs health rule도 만들고 대상은 job group `lab`으로 지정합니다. action은 Index connector처럼 부담 없는 것으로 시작합니다.

## Lab 7. Forecast 가능 여부 확인

```json
# 샘플 job: forecast 가능
POST _ml/anomaly_detectors/low_request_rate/_open
POST _ml/anomaly_detectors/low_request_rate/_forecast
{ "duration": "7d" }

# advanced job: over detector가 있어 에러가 나는 것이 정상
POST _ml/anomaly_detectors/lab-weblogs-advanced/_forecast
{ "duration": "7d" }
```

두 번째 요청의 에러로 "population detector가 하나라도 있으면 job 전체에서 forecast를 만들 수 없다"는 점을 직접 확인합니다.
forecast 결과는 Single Metric Viewer의 Forecast 버튼으로 봅니다.

## Lab 8. Snapshot 복구와 reset

```json
GET _ml/anomaly_detectors/lab-weblogs-advanced/model_snapshots

POST _ml/datafeeds/datafeed-lab-weblogs-advanced/_stop
POST _ml/anomaly_detectors/lab-weblogs-advanced/_close

POST _ml/anomaly_detectors/lab-weblogs-advanced/model_snapshots/<snapshot_id>/_revert
{ "delete_intervening_results": true }

# 설정은 그대로 두고 결과와 모델을 지운 뒤 처음부터 다시 학습
POST _ml/anomaly_detectors/lab-weblogs-advanced/_reset
```

## Lab 9. 정리

```json
POST _ml/datafeeds/datafeed-lab-weblogs-advanced/_stop
POST _ml/anomaly_detectors/lab-weblogs-advanced/_close
DELETE _ml/datafeeds/datafeed-lab-weblogs-advanced
DELETE _ml/anomaly_detectors/lab-weblogs-advanced
DELETE _ml/calendars/lab-maintenance
DELETE _ml/filters/lab-trusted-clients
```

샘플 job 3개는 Jobs 목록에서 삭제합니다. filter는 job이 쓰는 동안 지워지지 않을 수 있으니 job을 먼저 지웁니다.
만든 rule도 Stack Management → Rules에서 삭제합니다.
