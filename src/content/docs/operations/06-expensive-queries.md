---
title: "비싼 query로부터 클러스터를 어떻게 보호하는가"
description: 사용자 한 명의 query가 클러스터 전체를 느리게 만드는 유형(큰 집계, 깊은 페이지, 앞이 열린 wildcard, script, runtime field)과 이를 막는 Elasticsearch, Kibana 설정, 실행 중인 query를 찾아 취소하는 절차, 같은 결과를 싸게 얻는 대안을 정리합니다.
sidebar:
  label: 06. 비싼 query
  order: 6
---

로그 클러스터에서 장애 원인을 따라가 보면 사용자 한 명의 query인 경우가 꽤 있습니다. 30일치 데이터에 고유값이 수백만 개인 필드로 terms 집계를 걸거나, 앞이 열린 wildcard로 전체 index를 훑는 식입니다. 그 query 하나가 search thread와 heap을 잡는 동안 다른 사용자의 대시보드와 알림이 함께 느려집니다.
Elasticsearch는 이런 query를 기본으로 막지 않습니다. 막을지, 어디까지 막을지는 운영자가 정해야 합니다.

:::note[기준]
- Elasticsearch, Kibana 9.x 기준입니다. 공식 문서는 2026년 11월에 다시 확인했습니다. 기능마다 GA 버전이 다른 경우는 본문에 적었습니다.
- Serverless에서는 아래 클러스터 설정 대부분을 바꿀 수 없습니다. 이 글은 self-managed와 Elastic Cloud Hosted 기준입니다.
- 명령 모음은 [`labs/operations/expensive-queries.console`](https://github.com/Munsik/engineering-notes/blob/main/labs/operations/expensive-queries.console)에 있습니다.
:::

## 위험한 query 유형

| 유형 | 왜 비싼가 | 대안 |
| --- | --- | --- |
| 고유값이 많은 필드의 terms 집계, 큰 `size` | bucket마다 heap을 쓰고, keyword 필드는 global ordinals를 만듦 | composite 집계로 나눠 가져오기, 기간 줄이기 |
| 깊은 페이지(`from` + `size`가 큼) | shard마다 `from + size`개를 모아 정렬 | `search_after`와 PIT |
| 앞이 열린 wildcard(`*error`), 긴 regexp | term dictionary 전체를 훑음 | `wildcard` 필드 타입, 검색어 설계 변경 |
| `script` query, `script_score` | 문서마다 script 실행 | 색인 시점에 값 계산 |
| runtime field로 검색, 집계 | 문서마다 값을 계산 | 자주 쓰면 색인 필드로 |
| text 필드 집계(`fielddata: true`) | fielddata를 heap에 올림 | keyword multi-field |
| 넓은 기간 + 많은 index | 대상 shard 수만큼 일이 늘어남 | 기간 제한, data tier별 data view |

Elasticsearch가 "expensive"로 분류해 한꺼번에 막을 수 있는 query는 아래와 같습니다([Limit expensive queries](https://www.elastic.co/docs/reference/query-languages/querydsl#query-dsl-allow-expensive-queries)).

- 선형으로 훑어야 하는 query: `script` query, index되지 않고 doc values만 있는 숫자, 날짜, keyword 등의 필드 검색
- 시작 비용이 큰 query: `fuzzy`, `regexp`, `prefix`, `wildcard`(모두 `wildcard` 필드 타입은 예외), text와 keyword 필드의 `range`
- joining query(`nested`, `has_child` 등), runtime field 검색
- 문서마다 비용이 큰 query: `script_score`, `percolate`

terms 집계와 깊은 페이지는 이 목록에 없습니다. 이 둘은 아래의 개수 한도로 막습니다.

색인하지 않고 doc values만 있는 keyword 필드 검색도 expensive query입니다. `logsdb_columnar` index mode는 text가 아닌 필드를 기본으로 색인하지 않으므로, 이 mode를 쓰는 클러스터에서 `search.allow_expensive_queries: false`를 켜면 keyword term 검색까지 막힙니다([데이터 설계 03](../../data/03-storage-footprint/#저장-공간을-차지하는-네-가지-구조), 해석).

## 보호 설정

| 설정 | 기본값 | 막는 것 | 동적 변경 |
| --- | --- | --- | --- |
| `search.max_buckets` | 65,536 | 한 응답의 집계 bucket 수 | 가능 |
| `search.allow_expensive_queries` | `true` | 위의 expensive query 전체 | 가능 |
| `search.default_search_timeout` | 없음(`-1`) | 요청에 timeout이 없을 때 쓰는 기본 timeout. 넘으면 task 취소 | 가능 |
| `index.max_result_window` | 10,000 | `from + size` | index 설정 |
| `index.max_inner_result_window` | 100 | inner hits, top hits 집계의 `from + size` | index 설정 |
| `index.max_terms_count` | 65,536 | terms query의 term 수 | index 설정 |
| `index.max_regex_length` | 1,000 | regexp, prefix query의 값 길이 | index 설정 |
| `search.max_open_scroll_context` | 500 | 동시에 열린 scroll 수 | 가능 |
| `esql.query.result_truncation_max_size` | 10,000 | ES\|QL 결과 행 수 상한 | 가능 |

근거: [Search settings](https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/search-settings), [Index settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/index-modules), [The search API](https://www.elastic.co/docs/solutions/search/the-search-api#search-timeout), [ES|QL limitations](https://www.elastic.co/docs/reference/query-languages/esql/limitations).

공식 high JVM memory pressure 문서가 예로 드는 조합입니다.

```console
PUT _cluster/settings
{
  "persistent": {
    "search.max_buckets": 20000,
    "search.allow_expensive_queries": false,
    "search.default_search_timeout": "1m"
  }
}
```

설정마다 알아 둘 동작입니다.

- `search.allow_expensive_queries: false`는 해당 query를 실행하지 않고 설정 이름이 들어간 오류를 돌려줍니다. Kibana에서 wildcard 검색이나 runtime field를 쓰는 화면이 함께 막힐 수 있으므로 사용자에게 먼저 알립니다(해석).
- `search.default_search_timeout`은 요청에 `timeout`이 없을 때만 적용되고, 시간을 넘으면 task 취소 API로 요청을 취소합니다. 판정 해상도는 `thread_pool.estimated_time_interval`(기본 200ms)을 따르므로 200ms보다 짧은 값은 의미가 없습니다([The search API](https://www.elastic.co/docs/solutions/search/the-search-api#search-timeout)).
- 요청 본문의 `timeout`은 shard마다 query 단계에 적용되고, 넘으면 부분 결과를 돌려줍니다. 요청 전체를 끝내는 장치가 아닙니다(같은 문서).
- ES|QL의 `LIMIT`과 결과 상한은 돌려주는 행 수만 제한합니다. `WHERE`와 `STATS`는 대상 데이터 전체에서 돕니다. 상한이 있다고 비싼 ES|QL이 싸지지는 않습니다([ES|QL limitations](https://www.elastic.co/docs/reference/query-languages/esql/limitations)).
- `index.max_result_window`를 올려 깊은 페이지를 허용하지 않습니다. 공식 문서도 이 값을 올리는 대신 `search_after`를 쓰라고 적고 있습니다.

bucket이 많은 집계는 `search.max_buckets`에 걸리기 전에 request circuit breaker에 먼저 걸리기도 합니다. 429 `[request]` breaker 오류의 원인을 좁히는 방법은 [03](../03-node-failure-triage/#circuit-breaker-429)에 있습니다.

## Kibana 쪽 제한

Kibana에서 오는 query는 Kibana 설정으로도 줄일 수 있습니다. Advanced Settings에서 space마다 바꿉니다([Kibana advanced settings](https://www.elastic.co/docs/reference/kibana/advanced-settings)).

| 설정 | 기본값 | 내용 |
| --- | --- | --- |
| `search:timeout` | 9.0에서 9.5는 600,000ms(10분) | Kibana가 보내는 검색 요청의 최대 timeout. 0이면 제한 없음 |
| `histogram:maxBars` | 1,000 | 날짜, 숫자 histogram의 최대 막대 수. 넘으면 간격을 넓힘 |
| `discover:sampleSize` | 500 | Discover 문서 표에 가져오는 최대 문서 수 |
| `data_views:fields_excluded_data_tiers` | 없음 | 필드 목록을 읽을 때 뺄 tier(예: `data_cold,data_frozen`) |

`histogram:maxBars`는 `search.max_buckets`를 한 시각화의 최대 집계 수로 나눈 값보다 작게 둡니다(같은 문서). 대시보드 기본 시간 범위를 짧게 두는 것도 효과가 큽니다. 30일 범위로 열리는 대시보드는 열 때마다 30일치를 집계합니다(해석).

## 실행 중인 query를 찾아 취소하기

### Kibana Query activity

Stack 9.4부터 preview로 Kibana의 Query activity 화면에서 실행 중인 ES|QL, Query DSL, EQL, SQL, multi-search, async search를 한 번에 볼 수 있습니다. 실행 시간, 출처(Discover, Dashboard 등), query 본문을 보고 바로 취소할 수 있습니다. 기본으로 100ms 넘게 돈 query만 보이고, 값은 `query_activity:minRunningTime`으로 바꿉니다([Query activity](https://www.elastic.co/docs/deploy-manage/monitor/query-activity)).

| 동작 | Elasticsearch 권한 | Kibana 권한 |
| --- | --- | --- |
| 목록 보기 | `monitor` | Query activity read |
| 취소 | `manage` | Query activity all |

### task 관리 API

Query activity를 쓸 수 없는 버전에서는 task 관리 API를 씁니다([Find and cancel long-running queries](https://www.elastic.co/docs/reference/query-languages/query-task-management)).

```console
GET _tasks?detailed=true&human=true&group_by=parents&actions=indices:data/read/search*,indices:data/read/esql*,indices:data/read/eql*,indices:data/read/sql*,indices:data/read/msearch*,indices:data/read/async_search*

POST _tasks/<node_id>:<task_id>/_cancel
```

1. `running_time`이 긴 task를 고릅니다. `group_by=parents`로 보면 shard 단위 child task가 parent 아래에 묶입니다.
2. `description`의 query 본문과 `headers`의 `X-Opaque-Id`로 누가 보낸 요청인지 확인합니다.
3. `cancellable`이 `true`인지 보고, child가 아닌 parent task를 취소합니다. 한 query가 task를 여러 개 만들기 때문입니다.
4. `cancelled: true`는 취소 요청을 받았다는 뜻일 뿐입니다. 목록에서 사라질 때까지 다시 조회합니다. 사라지지 않으면 hot threads로 무엇이 멈춰 있는지 봅니다.

task 목록은 지금 도는 작업의 snapshot입니다. 이미 끝난 query는 보이지 않으므로, 반복되는 비싼 query는 [05의 query logging이나 slow log](../05-slow-cluster/#느린-요청을-기록해-두기)로 찾습니다.

## 같은 결과를 싸게 얻는 방법

**고유값이 많은 필드의 전체 목록**은 composite 집계로 나눠 가져옵니다. 한 번에 정해진 수만큼 bucket을 받고 `after_key`로 다음 묶음을 요청합니다.

```console
GET logs-app-*/_search
{
  "size": 0,
  "query": { "range": { "@timestamp": { "gte": "now-1d" } } },
  "aggs": {
    "by_user": {
      "composite": {
        "size": 1000,
        "sources": [ { "user": { "terms": { "field": "user.name" } } } ]
      }
    }
  }
}
```

**깊은 페이지**는 point in time(PIT)과 `search_after`를 씁니다. 공식 문서는 깊은 페이지에 scroll을 더 이상 권하지 않습니다([Paginate search results](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results)).

```console
POST logs-app-*/_pit?keep_alive=1m

GET _search
{
  "size": 1000,
  "pit": { "id": "<pit_id>", "keep_alive": "1m" },
  "sort": [ { "@timestamp": "asc" } ],
  "search_after": [ 1764000000000 ]
}
```

**부분 문자열 검색**이 자주 필요한 필드는 `wildcard` 필드 타입으로 매핑합니다. 이 타입의 wildcard, regexp, fuzzy, prefix query는 expensive query 목록에서 빠집니다.

**오래 걸리는 분석**은 async search로 보내 연결을 붙잡지 않게 합니다. Kibana의 background search도 async search로 돌고, Query activity에 Async search로 보입니다.

## 판단 기준

이 절은 위의 사실을 바탕으로 한 제 판단입니다(해석).

| 상황 | 권장 |
| --- | --- |
| 새로 운영을 시작함 | `search.default_search_timeout`을 1분에서 5분 사이로, `search.max_buckets`는 기본값 유지 |
| 사용자가 많은 로그 클러스터 | Kibana 대시보드 기본 시간 범위를 짧게, `histogram:maxBars` 기본값 유지 |
| 같은 사용자의 비싼 query가 반복됨 | query logging으로 찾아 대안을 안내. 그래도 반복되면 `search.allow_expensive_queries: false` |
| 앞이 열린 wildcard가 꼭 필요함 | 그 필드만 `wildcard` 타입으로 |
| 지금 클러스터가 느림 | Query activity나 tasks API로 찾아 취소, 그다음 원인 query를 고침 |
| breaker 한도를 올리자는 의견 | 올리지 않음. query를 고치거나 [03](../03-node-failure-triage/)의 heap 원인부터 |

## 참고 문서

- [Limit expensive queries](https://www.elastic.co/docs/reference/query-languages/querydsl)
- [Search settings](https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/search-settings)
- [Index settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/index-modules)
- [The search API](https://www.elastic.co/docs/solutions/search/the-search-api)
- [ES|QL limitations](https://www.elastic.co/docs/reference/query-languages/esql/limitations)
- [Kibana advanced settings](https://www.elastic.co/docs/reference/kibana/advanced-settings)
- [Query activity](https://www.elastic.co/docs/deploy-manage/monitor/query-activity)
- [Find and cancel long-running queries](https://www.elastic.co/docs/reference/query-languages/query-task-management)
- [Paginate search results](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results)
