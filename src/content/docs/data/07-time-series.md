---
title: "메트릭은 로그와 어떻게 다르게 저장되는가"
description: time series data stream(TSDS)이 문서 ID를 만드는 방식, 받는 시간 범위와 늦게 온 데이터, 9.5의 과거 backing index 생성, 저장 크기, downsample을 공식 문서와 Elasticsearch 9.5.5 실측으로 정리합니다.
sidebar:
  label: 07. 메트릭과 TSDS
  order: 7
---

Elastic Agent로 수집하는 `metrics-*-*` data stream은 대부분 time series data stream(TSDS)입니다.
TSDS는 로그 data stream과 겉보기에는 같지만, 문서 ID를 만드는 방식과 받는 시간 범위가 다릅니다. 그래서 로그에서 쓰던 방법이 그대로 통하지 않는 경우가 있습니다.
fingerprint로 중복을 막는 방법은 쓸 수 없고, 수집기가 몇 시간 멈췄다가 밀린 metrics를 보내면 그 시각의 문서는 거부됩니다.

이 차이를 실측으로 확인하고, 메트릭을 설계하고 운영할 때 바꿔야 할 점을 봅니다.

:::note[기준]
- Elasticsearch 9.5.5 기준입니다. 공식 문서는 2026년 11월에 다시 확인했습니다.
- 실측은 로컬 Elasticsearch 9.5.5 단일 노드(vCPU 1, JVM heap 1GB)에서 했습니다. 시간 범위, 중복, 과거 index 실험은 basic 라이선스로, 저장 크기는 basic과 trial 양쪽으로, downsample은 trial로 했습니다. 실험 코드와 결과는 [`labs/data/time-series/`](https://github.com/Munsik/engineering-notes/tree/main/labs/data/time-series)에 있습니다.
:::

## TSDS의 구조

TSDS는 `index.mode: time_series`로 만든 data stream입니다. 매핑에서 어떤 필드가 시계열을 구별하는지(dimension), 어떤 필드가 측정값인지(metric)를 지정합니다([Time series data streams](https://www.elastic.co/docs/manage-data/data-store/data-streams/time-series-data-stream-tsds)).

| 요소 | 의미 | 예 |
| --- | --- | --- |
| dimension | 시계열을 구별하는 값. `time_series_dimension: true` | `host.name`, `metric.name` |
| metric | 측정값. `time_series_metric`이 `gauge`(오르내림) 또는 `counter`(누적 증가) | `cpu.pct`(gauge), `net.bytes`(counter) |
| `@timestamp` | 측정 시각 | |

같은 dimension 값을 가진 문서들이 하나의 시계열이 됩니다. Elasticsearch는 dimension 값으로 routing과 정렬을 하고, 이것이 저장 크기와 문서 ID에 영향을 줍니다.

## 중복과 문서 ID

TSDS는 문서 ID를 dimension 값과 `@timestamp`로 직접 만듭니다. 같은 시계열, 같은 시각의 문서를 넣었습니다.

| 넣은 문서 | 응답 |
| --- | --- |
| 첫 문서 | 201 |
| 같은 dimension, 같은 시각, **다른 값** | 409 version conflict |
| 같은 dimension, 1초 뒤 | 201 |
| 사용자가 정한 `_id`(`my-fingerprint`) | 400. `_id`는 비워 두거나 Elasticsearch가 만든 값과 같아야 한다는 오류 |

여기서 볼 것이 두 가지입니다.

- **fingerprint로 중복을 막는 방법은 TSDS에 쓸 수 없습니다.** 대신 같은 시계열, 같은 시각이면 자동으로 409가 됩니다. 수집기가 같은 metrics를 다시 보내도 중복이 생기지 않고, Agent에서는 `duplicates`로 셉니다([수집 05](../../ingest/05-count-reconciliation/#중복-찾기와-막기)).
- **값이 달라도 409입니다.** 먼저 들어온 값이 남고 뒤의 값은 버려집니다. dimension을 빠뜨려 서로 다른 시계열이 같은 시계열로 묶이면, 같은 시각의 측정값 중 하나만 남고 나머지는 409로 사라집니다. 예를 들어 디스크별 사용률에서 장치 이름을 dimension으로 지정하지 않으면 호스트당 디스크 하나의 값만 남습니다. dimension은 "이 값이 다르면 다른 시계열인가"를 기준으로 빠짐없이 지정합니다.

## 쓰기 허용 시간 범위

TSDS의 backing index는 각자 받을 수 있는 `@timestamp` 범위(`index.time_series.start_time`, `end_time`)를 가집니다. 범위는 data stream을 만들거나 rollover할 때 정해집니다. 기본값으로 첫 backing index는 만든 시각 2시간 전(`index.look_back_time`)부터, 이후 30분 뒤(`index.look_ahead_time`)까지 받습니다([Time-bound TSDS](https://www.elastic.co/docs/manage-data/data-store/data-streams/time-bound-tsds), [Time series index settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/time-series)).

방금 만든 TSDS에 시각을 바꿔 가며 넣었습니다.

| 문서 시각 | failure store 없음 | failure store 있음 |
| --- | --- | --- |
| 지금 | 201 | 201 |
| 1시간 전 | 201 | 201 |
| 3시간 전 | 400. 쓰기 가능한 index 범위 밖 | 201, failure store로 감 |
| 1시간 뒤 | 400. 같은 오류 | 201, failure store로 감 |

- 이 범위는 최근 데이터만 들어오는 정상 상황을 기준으로 잡혀 있습니다. **수집기가 몇 시간 멈췄다가 밀린 metrics를 한꺼번에 보내면, 범위를 벗어난 부분은 거부됩니다.** 로그 data stream에서는 생기지 않는 유실입니다.
- 소스 시계가 30분 이상 빠른 호스트의 metrics도 거부됩니다. NTP가 어긋난 호스트를 찾는 단서가 되기도 합니다.
- Agent는 거부된 문서를 기본으로 버립니다([수집 02](../../ingest/02-where-to-parse/#실패한-문서는-어디로-가나)). failure store가 켜져 있으면 남습니다. 내장 template으로 새로 만든 `logs-*-*` data stream은 failure store가 켜져 있었지만, `metrics-*-*`는 꺼져 있었습니다(실측, `GET _data_stream/<이름>`의 `failure_store.enabled`). metrics도 거부를 추적하려면 따로 켭니다.

### 늦게 온 데이터: 과거 backing index 자동 생성(9.5)

9.5부터 클러스터 설정 `data_stream.past_tsdb_index_creation_enabled`를 켜면, 범위 밖의 과거 문서가 오면 그 시각을 담는 backing index를 새로 만듭니다(같은 Time-bound TSDS 문서). 받을 수 있는 과거는 backing index를 read-only로 만드는 첫 lifecycle 동작(downsample, searchable snapshot 등)과 data stream 보존 기간 중 먼저 오는 것 이전까지입니다. 과거 backing index 하나가 담는 기간은 `data_streams.past_tsdb_index_interval`로 정합니다.

| 설정 | 5시간 전 문서 | 30일 전 문서 |
| --- | --- | --- |
| 끔(기본) | 400 | 400 |
| 켬 | 201. 하루 범위의 과거 backing index 생성 | 201. 하루 범위의 과거 backing index를 하나 더 생성 |

- lab에서 만들어진 과거 backing index는 범위가 하루였고, `index.lifecycle.indexing_complete: true`가 붙었습니다. 보존 기간을 지정하지 않은 data stream이라 30일 전 문서도 받았습니다.
- 과거 backing index는 새로 만든 index지만 `index.lifecycle.origination_date`가 `end_time`으로 잡혀, 보존 기간과 ILM 단계는 데이터 시각 기준으로 계산됩니다(같은 문서).
- 과거 문서가 띄엄띄엄 오면 그만큼 작은 backing index가 생깁니다. 다시 보내는 기간이 길면 shard 수가 늘어나는지 같이 봅니다([04](../04-shards-and-bulk/)).

## 저장 크기

호스트 200대가 10초마다 보내는 metrics 100분치(12만 건, 문서마다 dimension 2개, gauge 1개, counter 1개)를 세 가지 index mode로 저장하고 force merge 뒤 크기를 측정했습니다.

| index mode | basic: 크기 | basic: 문서당 | trial: 크기 | trial: 문서당 |
| --- | --- | --- | --- | --- |
| standard | 7.2MB | 60.2B | 7.2MB | 59.6B |
| logsdb | 4.9MB | 41.2B | 3.1MB | 25.8B |
| time_series | 4.2MB | 35.2B | 2.0MB | 16.7B |

- trial(Enterprise 기능 포함)에서 time_series는 standard의 약 28%였습니다. basic에서는 58%였습니다. 차이는 synthetic `_source`에서 옵니다. 라이선스가 없으면 synthetic `_source`가 오류 없이 stored `_source`로 바뀌는 것은 로그와 같습니다([03](../03-storage-footprint/#라이선스가-없으면-synthetic-_source가-경고-없이-stored로-바뀐다)).
- 적재 시간은 세 가지 모두 12만 건에 4초에서 7초로 큰 차이가 없었습니다.
- 문서가 작고 단순한 synthetic 데이터라 실제 integration의 metrics와는 비율이 다를 수 있습니다. 비율만 참고합니다.

## Downsample

downsample은 오래된 시계열을 더 긴 간격으로 묶어 저장합니다([Downsampling concepts](https://www.elastic.co/docs/manage-data/data-store/data-streams/downsampling-concepts)). 10초 간격 1시간치(호스트 200대, 7만 2천 건)를 5분 간격으로 downsample했습니다.

| | 원본 | 5분 downsample |
| --- | --- | --- |
| 문서 | 72,000 | 2,600 |
| 크기(force merge 후) | 967KB | 171KB |
| 걸린 시간 | | 1.4초 |

downsample된 문서 하나는 이런 형태입니다.

- gauge(`cpu.pct`)는 `min`, `max`, `sum`, `value_count` 네 값을 가진 `aggregate_metric_double`이 됩니다. 평균은 `sum / value_count`로 구합니다.
- counter(`net.bytes`)는 구간의 마지막 값 하나만 남습니다.
- dimension은 그대로 남고, 묶인 원본 수가 `_doc_count`(20)로 남습니다.

운영할 때 주의할 점입니다.

- downsample은 쓰기가 끝난(read-only) backing index에만 할 수 있습니다. ILM이나 data stream lifecycle의 downsample, force merge, searchable snapshot 같은 동작은 backing index의 `end_time`이 지나야 시작됩니다(Time-bound TSDS 문서).
- downsample한 뒤에는 원래 간격의 값이 사라집니다. 짧은 간격의 급등을 찾는 탐지나 용량 분석에 쓰는 기간은 downsample 전 단계에 둡니다.
- 문서 수가 줄어든 비율(약 28분의 1)에 비해 크기는 약 6분의 1로 줄었습니다. gauge 하나가 값 네 개로 늘어나기 때문입니다.

## 판단 기준

| 상황 | 권장 |
| --- | --- |
| metrics를 직접 설계 | TSDS로. dimension은 "값이 다르면 다른 시계열인가" 기준으로 빠짐없이 |
| 같은 시각 측정값 일부가 사라짐 | dimension 누락으로 409가 나는지 Agent의 `duplicates`로 확인 |
| 수집기가 몇 시간 멈출 수 있음 | 9.5 이후 `data_stream.past_tsdb_index_creation_enabled` 검토. 이전 버전은 밀린 metrics 일부를 잃는 것으로 봄 |
| metrics 거부를 추적해야 함 | metrics data stream에도 failure store를 켬 |
| metrics 중복 제거 | fingerprint 대신 TSDS의 자동 409에 맡김 |
| 장기 보관 | downsample. 짧은 간격이 필요한 분석 기간은 downsample 전 단계에 둠 |
| 저장 크기 추정 | 라이선스를 먼저 확인. synthetic `_source` 유무에 따라 두 배 가까이 달라짐 |

## 다음 글

- 데이터 설계 컬렉션은 여기까지입니다. 수집 단계는 [수집 컬렉션](../../ingest/)에서 다룹니다.
- 이 글의 실측 코드: [`labs/data/time-series/`](https://github.com/Munsik/engineering-notes/tree/main/labs/data/time-series)

## 참고 문서

- [Time series data streams](https://www.elastic.co/docs/manage-data/data-store/data-streams/time-series-data-stream-tsds)
- [Time-bound TSDS](https://www.elastic.co/docs/manage-data/data-store/data-streams/time-bound-tsds)
- [Time series index settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/time-series)
- [Downsampling concepts](https://www.elastic.co/docs/manage-data/data-store/data-streams/downsampling-concepts)
- [Failure store](https://www.elastic.co/docs/manage-data/data-store/data-streams/failure-store)
