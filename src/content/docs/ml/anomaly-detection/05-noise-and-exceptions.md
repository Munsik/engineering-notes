---
title: 노이즈와 예외 처리
description: 노이즈 유형별 1차 대응, custom rule(job rule)과 filter list, calendar와 scheduled event, 서머타임 calendar, model snapshot 복구와 재실행을 다룹니다.
sidebar:
  label: 05. 노이즈와 예외 처리
  order: 5
---

## 노이즈 유형별 대응

노이즈라고 부르는 현상은 원인이 서로 다릅니다. 원인을 먼저 나누면 쓸 수단이 정해집니다.
알고리즘 자체도 누락값과 노이즈에 견디도록 설계되어 있습니다. 아래는 그 위에 운영자가 더하는 수단입니다.

| 유형 | 1차 대응 | 적용 위치 |
| --- | --- | --- |
| 애초에 분석할 필요가 없는 데이터(수집기 자체 로그, 헬스체크 요청) | datafeed query에서 `must_not`으로 제외 | datafeed |
| 짧은 일회성 spike | 알고리즘이 긴 이상을 더 높게 평가합니다. 알림은 임계값(기본 75)과 Alert delay로 연속 N회 일치할 때만 보냅니다. | alert rule |
| 한쪽 방향만 필요한데 양쪽이 잡힘 | `high_*`, `low_*` one-sided function | detector(생성 시) |
| 통계적으로는 유의하지만 업무상 의미 없는 작은 변동 | custom rule의 condition으로 `actual`, `typical`, `diff_from_typical` 하한 설정 | detector rule |
| 알려진 정상 entity(배치 서버, crawler, 관리 도구) | filter list + custom rule scope | detector rule |
| 항상 자주 나타나는 entity가 결과를 지배 | `exclude_frequent`(`all`, `none`, `by`, `over`). rare 계열에는 쓰지 않습니다. | detector(생성 시) |
| 계속 이상한 값이 모델을 왜곡 | `skip_model_update` action. API 문서가 이 용도를 명시합니다. | detector rule |
| 성격이 다른 entity가 한 population에 섞임 | datafeed query로 job 분리 또는 `partition` 병행 | job 설계 |
| 알려진 이벤트(점검, 행사) | calendar scheduled event | calendar |
| 알림이 깜빡거림, 확정 전 오탐 | Flapping Detection, Include interim results 끄기 | alert rule |

:::caution["보기 싫다"와 "배우면 안 된다"는 다릅니다]
노이즈는 결과 화면뿐 아니라 모델 학습에도 영향을 줍니다.
결과만 지우는 `skip_result`는 그 값을 모델에 계속 반영합니다. `skip_model_update`는 결과는 남기되 모델에서 뺍니다.
어느 쪽이 필요한지를 먼저 정합니다.
:::

## Custom rule

custom rule(Kibana에서는 job rule)은 조건이 맞을 때 detector가 기본 동작 대신 지정한 action을 하게 합니다.
rule은 detector마다 따로 붙습니다. 운영 중에 update API나 Kibana의 Configure rules로 바꿀 수 있는 몇 안 되는 detector 설정이기도 합니다.

| 구성 | 내용(9.x API 정의) |
| --- | --- |
| `actions` | `skip_result`(기본값): 결과를 만들지 않습니다. `skip_model_update`를 같이 주지 않으면 모델은 그 값으로 평소처럼 갱신됩니다.<br/>`skip_model_update`: 그 값을 모델 갱신에 쓰지 않습니다. `skip_result`를 같이 주지 않으면 결과는 평소처럼 만들어집니다. 늘 이상한 값이 모델을 왜곡해 다른 결과를 해칠 때 적합합니다.<br/>둘을 함께 주면 효과가 합쳐집니다. |
| `scope` | rule을 적용할 시계열을 filter list로 정합니다. `filter_type`은 `include`(기본) 또는 `exclude`입니다. scope에 쓸 수 있는 field는 그 detector의 `by`, `over`, `partition` field뿐입니다. |
| `conditions` | `applies_to`(`actual`, `typical`, `diff_from_typical`, `time`)를 `gt`, `gte`, `lt`, `lte`로 비교합니다. 여러 condition은 AND로 묶입니다. rule에는 scope나 condition이 하나 이상 있어야 합니다. |
| function별 제약 | API 문서는 `lat_long`, `metric`, `rare`, `freq_rare` detector에는 `time` condition만 쓸 수 있다고 적고 있습니다. rare function 문서는 condition rule을 아예 넣을 수 없다고 적고 있습니다. 두 문서의 표현이 다르므로, rare 계열은 scope rule로 다루는 것이 안전합니다. |

### 상황별 rule 예시

| 상황 | rule |
| --- | --- |
| CPU iowait가 아주 낮은 수준에서 변화 | condition `actual lt 0.25`, `skip_result` (Elastic 제공 job의 기본값) |
| DNS 질의 정보량이 낮은 결과 | condition `actual lt 350`, `skip_result` (Elastic 제공 job의 기본값) |
| 하우스키핑 process의 드문 실행 | process 이름 filter list를 scope에 연결, `skip_result` (Elastic Security 문서의 예) |
| 건수가 적은 응답코드의 사소한 변동 | condition `actual lt N`, `skip_result` |
| 부하 테스트 대상 서버가 늘 이상하게 보여 다른 결과까지 흐림 | 해당 host filter list를 scope에 연결, `skip_result`와 `skip_model_update` |

```json
POST _ml/anomaly_detectors/<job_id>/_update
{
  "detectors": [
    {
      "detector_index": 0,
      "custom_rules": [
        {
          "actions": ["skip_result"],
          "conditions": [ { "applies_to": "actual", "operator": "lt", "value": 20 } ]
        }
      ]
    }
  ]
}
```

- **rule은 이후 결과에만 적용됩니다.** 이미 만들어진 anomaly는 계속 보입니다. 과거 결과까지 정리하려면 job을 clone해서 다시 돌립니다.
- **반영 시점은 문서에 명시되어 있지 않습니다.** 9.x update API 문서에서 job을 닫았다가 다시 열어야 반영된다고 명시된 항목은 `background_persist_interval`뿐입니다. `custom_rules`는 반영 시점이 적혀 있지 않으므로, datafeed를 멈추고 job을 닫은 뒤 수정하는 절차를 권장합니다(확인 필요).
- **`time` condition은 신중하게 씁니다.** API에 값으로 나열되어 있지만 단위와 의미에 대한 설명이 없습니다(확인 필요). 시간대 예외는 calendar가 더 명확합니다.

## Calendar와 scheduled event

점검, 행사, 공휴일처럼 알고 있는 이벤트 구간은 calendar에 scheduled event로 등록합니다.
calendar는 job이나 job group에 연결하고, event는 연결된 job의 모든 detector에 적용됩니다.

- event에는 시작 시각, 종료 시각, 설명이 필요합니다. 보통 몇 시간에서 하루 정도의 드문 이벤트에 씁니다.
- event 구간에도 bucket 결과는 만들어지지만 anomaly score는 0입니다. event마다 `skip_result`(기본 true), `skip_model_update`, `force_time_shift`(초 단위)를 줄 수 있습니다.
- **소급되지 않습니다.** event는 job이 그 구간을 분석하기 전에 등록해야 합니다.
- 매주 정기 점검처럼 반복되는 패턴은 알고리즘이 이미 학습하므로 event가 필요 없습니다. 길거나 잦은 event를 많이 넣으면 오히려 학습이 늦어집니다.
- iCalendar(`.ics`)를 가져오면 반복 이벤트는 첫 번째 발생분만 들어옵니다.
- calendar와 filter list는 Kibana의 모든 space에서 보입니다.

```json
PUT _ml/calendars/planned-maintenance
{ "description": "계획된 점검", "job_ids": ["web-jobs"] }

POST _ml/calendars/planned-maintenance/events
{
  "events": [
    { "description": "DB 점검", "start_time": "2026-12-01T01:00:00Z", "end_time": "2026-12-01T03:00:00Z" }
  ]
}
```

Kibana에서는 Machine Learning → Anomaly Detection → Settings의 Calendars, DST Calendars, Filter Lists 패널에서 관리합니다.

## 서머타임(DST)

시계가 한 시간 바뀌면 모델이 적응하는 데 며칠이 걸려 오탐이 몰릴 수 있습니다.
DST calendar는 데이터가 발생한 지역의 시간대를 고르면 그 시간대의 전환 일정에 맞춘 `force_time_shift` event를 자동으로 만듭니다. Elasticsearch 8.16부터 제공됩니다.

- 고르는 시간대는 내가 있는 곳이 아니라 **데이터가 발생한 곳**의 시간대입니다.
- 미국이나 호주처럼 한 나라 안에 여러 시간대와 규칙이 섞이면 시간대별로 job을 나누고, datafeed query로 데이터를 나눠 보냅니다.
- 한국은 서머타임이 없어서 국내 데이터만 분석하면 해당 사항이 없습니다. 해외 법인 데이터를 함께 보거나, [평소와 다른 시각의 로그인](../07-scenarios/#평소와-다른-시각의-로그인)처럼 시각 자체를 보는 분석에서 검토합니다.

## 모델 복구와 재실행

| 수단 | 용도 | 소급 여부와 주의 |
| --- | --- | --- |
| custom rule | 특정 조건의 결과나 모델 갱신 건너뛰기 | 새 결과에만 적용. 과거 anomaly는 남음 |
| calendar event | 알려진 이벤트 구간 제외 | 분석 전에 등록해야 함 |
| model snapshot revert | 일회성 이벤트로 오염된 모델을 과거 시점으로 복구 | job을 닫은 뒤 실행. 기본 보존은 10일(1일이 지나면 하루 첫 snapshot만). 필요하면 retain |
| job reset | 같은 설정으로 처음부터 다시 학습 | 결과와 모델 상태가 지워짐. 실습 데이터를 다시 분석할 때 편리 |
| clone and rerun | 설정을 바꿔 새로 학습(detector 추가, bucket span 변경 포함) | 학습 기간이 다시 필요함. rule 변경을 끝낸 뒤 실행 |

## 참고 문서

- [Customizing detectors with custom rules](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-configuring-detector-custom-rules)
- [Update an anomaly detection job (API)](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-ml-update-job)
- [Optimizing anomaly results (Elastic Security)](https://www.elastic.co/docs/solutions/security/advanced-entity-analytics/optimizing-anomaly-results)
- [Daylight saving time calendars](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-ad-dst-calendars)
- [Manage seasonal time changes smoothly in Elasticsearch (Elastic Blog)](https://www.elastic.co/blog/daylight-saving-time-calendar-elasticsearch)
- [Anomaly detection limitations](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-limitations)
