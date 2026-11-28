---
title: Elasticsearch 데이터 정의를 바꿀 때
description: index template, component template, mapping, ingest pipeline, ILM policy, data stream lifecycle, synonym set, enrich policy, inference endpoint를 바꿀 때 변경이 반영되는 시점, 적용 전에 결과를 미리 확인하는 API, 깨지는 변경과 깨지지 않는 변경, 필드 변경의 영향 분석, integration과 Agent 버전 변경이 데이터 구조에 주는 영향을 정리합니다.
sidebar:
  label: 04. 데이터 정의 변경
  order: 4
---

template을 고쳤는데 데이터는 그대로입니다. 반대로 pipeline 하나를 고쳤을 뿐인데 그때부터 적재가 실패합니다. 데이터 정의의 변경은 반영되는 시점이 제각각이라, 바꾼 사람이 기대한 시점과 실제로 영향이 나타나는 시점이 다릅니다.
이 글은 데이터 정의 종류별로 언제 반영되는지, 적용 전에 어떻게 확인하는지, 무엇이 같이 깨지는지를 정리합니다. managed 자산을 어디에 고칠지는 [03](../03-managed-assets/)에서 다룹니다.

:::note[기준]
- Elasticsearch 9.5.x 기준입니다. 공식 문서와 API reference는 2026년 11월에 다시 확인했습니다.
- `_ingest/_simulate`(simulate ingest API)는 Elasticsearch REST API spec에서 experimental로 표시돼 있습니다.
- 명령 모음은 [`labs/change/data-definitions.console`](https://github.com/Munsik/engineering-notes/blob/main/labs/change/data-definitions.console)에 있습니다.
:::

## 언제 반영되나

| 정의 | 반영 시점 | 기존 데이터 |
| --- | --- | --- |
| index template, component template | 새 index나 새 backing index가 만들어질 때 | 바뀌지 않음 |
| data stream mappings override(`PUT _data_stream/<name>/_mappings`) | 다음 rollover로 만들어지는 write index | 바뀌지 않음 |
| data stream settings override(`PUT _data_stream/<name>/_settings`) | 가능하면 모든 backing index에 바로, 아니면 다음 rollover | 허용된 설정만 바로 반영 |
| 기존 index의 mapping에 필드 추가(`PUT <index>/_mapping`) | 바로 | 이미 색인된 문서는 다시 색인하기 전까지 새 필드로 검색되지 않음 |
| ingest pipeline | 바로. 다음 요청부터 | 이미 색인된 문서는 그대로 |
| ILM policy | 현재 phase는 캐시된 정의로 계속, 다음 phase부터 새 정의 | phase 진행에 따라 |
| data stream lifecycle | 다음 lifecycle 실행부터 | 보관 기간 변경은 기존 backing index에도 적용 |
| synonym set | 갱신하면 그 set을 쓰는 search analyzer가 다시 읽음 | 색인 시점 synonym이면 다시 색인해야 반영 |
| enrich policy | policy를 다시 execute해야 enrich index가 갱신됨 | 이미 enrich된 문서는 그대로 |

template 변경이 기존 index에 영향을 주지 않는다는 것은 API reference에 명시돼 있습니다. component template도 index를 만들 때만 쓰이고, 기존 index와 data stream의 backing index에는 영향이 없습니다([Create or update an index template](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-put-index-template), [Create or update a component template](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-cluster-put-component-template)).

그래서 template을 바꾼 뒤에는 rollover로 새 backing index를 만들어 결과를 확인합니다. 다음 자동 rollover를 기다리면 문제가 업무 시간이 아닐 때 드러납니다.

```console
POST logs-app-default/_rollover
GET logs-app-default/_mapping
```

## 적용 전에 확인하는 API

| 확인할 것 | API | 비고 |
| --- | --- | --- |
| 새 index에 어떤 template이 이기고, 결과 설정과 mapping이 무엇인지 | `POST _index_template/_simulate_index/<index>` | 우선순위 경쟁 확인 |
| 아직 저장하지 않은 template의 결과 | `POST _index_template/_simulate` (본문에 template 정의) | 저장 전 검증 |
| pipeline 하나의 처리 결과 | `POST _ingest/pipeline/<id>/_simulate` 또는 본문에 pipeline 정의 | 단일 pipeline 개발 |
| default pipeline, final pipeline, reroute까지 포함한 실제 흐름과 mapping 검증 | `POST _ingest/_simulate` | experimental. template과 pipeline을 대체 정의로 바꿔서 시험 가능 |

`_ingest/_simulate`가 가장 쓸모 있습니다. 대상 index의 default pipeline과 final pipeline을 실제처럼 실행하고, reroute processor가 있으면 따라가고, 결과 문서를 적용될 mapping으로 검증해서 오류를 알려 줍니다. 아직 저장하지 않은 pipeline이나 component template, index template을 대체 정의로 넣어서 시험할 수 있습니다([Simulate data ingestion](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-simulate-ingest)).

```console
POST _ingest/_simulate
{
  "docs": [
    {
      "_index": "logs-app-default",
      "_source": {
        "@timestamp": "2026-11-28T01:00:00Z",
        "message": "GET /api/orders?id=1 200 35ms",
        "http": { "response": { "time": "35ms" } }
      }
    }
  ],
  "pipeline_substitutions": {
    "logs@custom": {
      "processors": [
        { "gsub": { "field": "http.response.time", "pattern": "ms$", "replacement": "" } },
        { "convert": { "field": "http.response.time", "type": "long" } }
      ]
    }
  },
  "component_template_substitutions": {
    "logs@custom": {
      "template": {
        "mappings": {
          "properties": {
            "http.response.time": { "type": "long" }
          }
        }
      }
    }
  }
}
```

응답에 처리된 문서, 실행된 pipeline 목록, 저장될 index 이름이 나오고, mapping과 맞지 않으면 그 오류가 문서마다 붙습니다. 운영에서 실제로 들어오는 문서 몇 건을 표본으로 넣어 CI에서 돌리면, pipeline이나 template 변경으로 적재가 깨지는 것을 배포 전에 잡을 수 있습니다. experimental API이므로 CI 단계는 실패해도 배포를 막지 않는 경고로 시작하는 편이 안전합니다.

## 깨지는 변경과 깨지지 않는 변경

| 변경 | 깨지나 | 처리 방법 |
| --- | --- | --- |
| 새 필드 추가 | 아니오 | template에 추가하고 rollover |
| 기존 필드에 multi-field 추가(예: `keyword` 하위 필드) | 아니오. 다만 기존 문서는 다시 색인해야 하위 필드가 채워짐 | template 추가 후 rollover, 과거 데이터가 필요하면 update by query |
| 필드 type 변경(`keyword`를 `long`으로 등) | 예 | 새 backing index부터 적용되도록 rollover. data stream 안에서 backing index마다 type이 달라지면 검색, 집계에서 충돌. 과거 데이터까지 맞추려면 reindex |
| 필드 이름 변경 | 예. 그 필드를 쓰는 모든 곳 | `alias` 필드 타입으로 이전 이름을 남겨 두고 단계적으로 이전 |
| 필드 제거 | 그 필드를 쓰는 곳 | mapping에서는 지울 수 없음. 수집을 멈추고 소비하는 곳을 먼저 정리 |
| analyzer 변경 | 검색 결과가 달라짐 | 새 index로 reindex. 색인 시점 analyzer는 기존 index에서 바꿀 수 없음 |
| `index.mode` 변경(standard, LogsDB, TSDS) | 저장 방식과 일부 기능 | rollover로 새 backing index부터. 저장 효과는 [데이터 설계 03](../../data/03-storage-footprint/) |
| `number_of_shards` 변경 | 아니오 | rollover로 새 backing index부터 |

검색할 때만 필요한 계산 필드는 runtime field로 먼저 만들어 보는 방법이 있습니다. mapping을 바꾸지 않고 query 시점에 값을 만들기 때문에 되돌리기 쉽고, 쓸모가 확인되면 그때 색인 필드로 옮깁니다.

필드 수가 늘어나는 변경은 [데이터 설계 06](../../data/06-mappings-and-fields/)의 기준을 같이 봅니다.

### type을 바꿔야 할 때

data stream에서 type을 바꾸면 이전 backing index와 새 backing index의 type이 다릅니다. 같은 data stream을 검색하면 그 필드는 index마다 type이 달라 집계나 정렬에서 오류가 나거나 일부 index만 결과에 들어갑니다. 선택지는 셋입니다.

| 방법 | 절차 | 비용 |
| --- | --- | --- |
| 새 필드 이름으로 추가 | `http.response.time_ms`(long)를 새로 만들고 둘 다 채우다가 이전 필드를 쓰는 곳을 정리 | 저장 공간 일시 증가, 소비처 수정 |
| rollover 후 이전 데이터 보관 기간이 지나길 기다림 | template 변경, rollover, 이전 backing index가 ILM으로 지워질 때까지 혼재 | 혼재 기간의 검색 오류 |
| reindex | 새 data stream으로 reindex 후 전환 | reindex 시간과 부하, 디스크 2배 |

reindex는 [reindex data stream API](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reindex-data-stream)와 일반 reindex의 차이를 확인하고 고릅니다. reindex data stream API는 주로 업그레이드 호환성을 위해 이전 버전에서 만든 backing index를 다시 만드는 용도입니다.

## ingest pipeline 변경

pipeline은 저장하는 순간 다음 요청부터 적용됩니다. 되돌리기는 쉽지만, 잘못된 pipeline으로 처리된 문서는 그대로 남습니다.

- 배포 전에 `_ingest/_simulate`로 운영 표본 문서를 돌립니다.
- 모든 processor에 `tag`를 붙이면 실패한 문서의 오류 정보에서 어느 processor가 실패했는지 바로 보입니다.
- failure store가 켜져 있으면 pipeline이 실패한 문서는 failure store로 갑니다. 고친 뒤에 다시 넣을 수 있습니다([수집 03](../../ingest/03-no-gap-ingest/)).
- `on_failure`로 실패를 삼키면 데이터는 들어가지만 문제가 숨습니다. 실패 사실을 필드로 남기는 것까지 하고, 그 필드를 alert로 봅니다.
- `version`과 `_meta`를 PR마다 갱신합니다([01](../01-change-map/#drift-확인)).

## ILM policy 변경

ILM은 index가 phase에 들어갈 때 그 phase의 정의를 index 메타데이터에 캐시합니다. policy를 바꾸면 안전하게 바꿀 수 있는 경우에만 캐시를 갱신하고, 아니면 캐시된 정의로 phase를 마칩니다. 다음 phase로 넘어갈 때 새 정의를 씁니다([Update or switch a lifecycle policy](https://www.elastic.co/docs/manage-data/lifecycle/index-lifecycle-management/policy-updates)).

- `min_age` 변경은 캐시에 반영되지 않습니다. 이미 그 phase를 실행 중인 index에는 영향이 없습니다.
- index에 다른 policy를 지정하면, 현재 phase는 이전 policy의 캐시로 마치고 다음 phase부터 새 policy를 따릅니다.
- 보관 기간을 줄이는 변경은 다음 phase 진입 시점에 대량 삭제가 한꺼번에 일어날 수 있습니다. 삭제 대상이 많으면 시간대를 고르고 디스크와 master 부하를 봅니다.

```console
# 각 index가 어느 policy의 어느 phase, 어느 버전에 있는지
GET logs-app-default/_ilm/explain?filter_path=indices.*.policy,indices.*.phase,indices.*.phase_execution.version,indices.*.phase_execution.modified_date_in_millis
```

`phase_execution.version`이 policy의 현재 version보다 낮으면 그 index는 이전 정의로 phase를 실행 중입니다.

ILM과 data stream lifecycle 중 무엇을 쓸지는 [데이터 설계 05](../../data/05-tiers-and-retention/)에서 다룹니다. 같은 data stream에서 둘을 바꿔 탈 때는 `index.lifecycle.prefer_ilm` 설정이 어느 쪽을 쓸지 정합니다.

## 영향 분석

필드 이름이나 type, index 이름을 바꾸기 전에 그것을 쓰는 곳을 찾습니다.

| 소비처 | 찾는 방법 |
| --- | --- |
| dashboard, visualization, Discover session | saved objects를 export해서 필드 이름으로 검색. ES\|QL 패널은 query 문자열에 필드 이름이 들어 있음 |
| data view의 runtime field, field format | data view 정의 |
| detection rule, alerting rule | rule을 export해서 query 검색 |
| ML anomaly detection job | job의 `analysis_config`, datafeed의 query와 index |
| transform | source query, pivot의 group_by와 aggregation |
| enrich policy | `match_field`, `enrich_fields` |
| 애플리케이션, 보고서 | 코드 저장소 검색. 가장 놓치기 쉬움 |

```console
# 필드 이름이 들어간 ML job과 datafeed, transform을 찾기 위한 원본
GET _ml/anomaly_detectors?filter_path=jobs.job_id,jobs.analysis_config
GET _ml/datafeeds?filter_path=datafeeds.datafeed_id,datafeeds.indices,datafeeds.query
GET _transform?filter_path=transforms.id,transforms.source,transforms.pivot
```

Kibana의 saved objects 화면에서 객체마다 Relationships를 보면 data view와 dashboard 사이의 참조를 따라갈 수 있습니다. 다만 ES\|QL 패널처럼 data view 없이 index를 직접 쓰는 패널은 참조 관계에 나오지 않으므로, export한 파일에서 문자열로 찾는 방법을 같이 씁니다.

## integration과 Agent 버전 변경도 데이터 정의 변경이다

integration을 업그레이드하면 그 integration의 template, pipeline, mapping이 바뀝니다. Agent를 업그레이드하면 같은 integration이라도 보내는 필드 구조가 바뀔 수 있습니다. 둘 다 데이터 정의 변경으로 다룹니다.

현장에서 겪은 사례를 업종 수준으로 옮기면 이렇습니다. 일부 Windows Agent를 업그레이드했더니 업그레이드한 Agent에서 온 이벤트만 그 시점부터 failure store로 들어가기 시작했습니다. Agent 상태는 정상으로 표시됐습니다. 새 Agent가 보낸 필드의 type이 기존 data stream의 mapping, 또는 설치된 integration pipeline의 기대와 맞지 않았던 경우입니다. Agent는 정상인데 데이터가 실패한다면 이 방향부터 봅니다.

- integration 업그레이드는 검증 환경에서 먼저 하고, 업그레이드한 Agent 몇 대의 데이터로 failure store와 mapping 충돌을 확인한 뒤 넓힙니다.
- 운영에서는 Agent policy 단위로 단계적으로 배포합니다. Fleet의 자동 업그레이드는 비율을 정해 단계적으로 올릴 수 있습니다(9.1부터, 구독 조건 있음)([Auto-upgrade agents](https://www.elastic.co/docs/reference/fleet/upgrade-elastic-agent#auto-upgrade-agents)).
- 자동으로 업그레이드되는 integration이 무엇인지 알아 둡니다([03](../03-managed-assets/#managed-자산은-누가-언제-덮어쓰나)).
- 업그레이드 뒤에는 rollover로 새 backing index를 만들어 새 mapping으로 데이터가 들어가는지 확인합니다.

Agent 운영 전반은 [수집 08](../../ingest/08-fleet-at-scale/)에 있습니다.

## 함께 관리해야 하는 정의

| 정의 | 변경 시 주의할 점 |
| --- | --- |
| synonym set | 갱신하면 그 set을 쓰는 analyzer가 다시 읽습니다. search time synonym이면 바로 검색 결과가 바뀌므로 검색 품질 측정과 같이 바꿉니다 |
| enrich policy | 정의를 바꾸거나 원본 index가 바뀌면 `_execute`로 enrich index를 다시 만들어야 합니다. 실행 중에는 이전 enrich index가 쓰입니다 |
| inference endpoint | 모델을 바꾸면 이미 만든 embedding과 새 query의 embedding이 맞지 않습니다. 데이터를 다시 처리해야 하므로 사실상 reindex입니다 |
| stored script, search template | 애플리케이션이 이름으로 호출하므로 이름을 바꾸지 말고 새 이름으로 추가한 뒤 전환합니다 |
| query ruleset | 검색 결과의 순서를 바로 바꿉니다. 변경 전후 결과를 표본 query로 비교합니다 |
| transform | 정의를 바꾸면 destination index의 의미가 바뀝니다. 새 transform과 새 destination으로 만들고 전환하는 편이 안전합니다 |

## 참고 문서

- [Create or update an index template](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-put-index-template)
- [Create or update a component template](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-cluster-put-component-template)
- [Update data stream mappings](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-put-data-stream-mappings)
- [Update data stream settings](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-put-data-stream-settings)
- [Simulate data ingestion](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-simulate-ingest)
- [Modify a data stream](https://www.elastic.co/docs/manage-data/data-store/data-streams/modify-data-stream)
- [Update or switch a lifecycle policy](https://www.elastic.co/docs/manage-data/lifecycle/index-lifecycle-management/policy-updates)
- [Reindex data stream API](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reindex-data-stream)
