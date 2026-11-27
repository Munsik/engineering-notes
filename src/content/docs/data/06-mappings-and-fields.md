---
title: "필드 수와 mapping은 어떻게 관리할 것인가"
description: 필드 수가 heap과 master에 주는 비용, 필드 한도에 닿았을 때 standard, logsdb, failure store가 각각 어떻게 동작하는지, 이름에 값이 들어가는 필드를 다루는 법, template 계층과 integration 업그레이드 때의 매핑 충돌을 공식 문서와 Elasticsearch 9.5.5 실측으로 정리합니다.
sidebar:
  label: 06. Mapping과 필드 수
  order: 6
---

"필드 한도 초과" 오류가 나면 가장 먼저 나오는 대응이 `index.mapping.total_fields.limit`을 올리는 것입니다.
당장은 적재가 다시 되지만, 필드는 index를 만든 뒤에는 줄일 수 없습니다. 한도를 몇 번 올리다 보면 필드가 수만 개인 index가 수백 개 쌓이고, 그때부터는 heap과 master가 버티지 못합니다.
필드가 왜 늘어나는지 보면 대개 원인은 데이터 쪽에 있습니다. 필드 이름에 ID나 UUID 같은 값이 들어가는 경우가 가장 흔합니다.

이 글은 필드 하나가 무엇을 비싸게 만드는지, 한도에 닿으면 무슨 일이 생기는지, 필드 수를 처음부터 어떻게 묶어 두는지 정리합니다.

:::note[기준]
- Elasticsearch 9.5.5 기준입니다. 공식 문서는 2026년 11월에 다시 확인했습니다.
- 실측은 로컬 Elasticsearch 9.5.5 단일 노드(vCPU 1, JVM heap 1GB)에서 basic 라이선스로 했습니다. 실험 코드와 결과는 [`labs/data/mappings-and-fields/`](https://github.com/Munsik/engineering-notes/tree/main/labs/data/mappings-and-fields)에 있습니다.
:::

## 필드가 비용이 되는 지점

`index.mapping.total_fields.limit`(기본 1,000)은 leaf 필드만 세지 않습니다. object mapping, multi-field, field alias, 매핑된 runtime field가 모두 들어갑니다([Mapping limit settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/mapping-limit)). `host.os.name` 하나에도 `host`, `os` object mapper가 따라옵니다.

| 비용 | 내용 | 근거 |
| --- | --- | --- |
| cluster state | 모든 노드가 mapping을 cluster state로 들고 있음 | [Size your shards](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/size-shards) |
| data node heap | 데이터를 들고 있는 노드는 index의 매핑된 필드마다 heap을 더 씀. `_nodes/stats`의 `indices.mappings.total_estimated_overhead`로 봄 | 같은 문서 |
| segment | segment마다 매핑된 필드의 이름 복사본을 들고 있음. segment가 많고 필드가 많을수록 커짐 | 같은 문서 |
| master | 새 필드가 생길 때마다 mapping 갱신이 master를 거쳐 모든 노드에 퍼짐. 폭증하면 `put-mapping` 작업이 밀림 | [Mapping explosion](https://www.elastic.co/docs/troubleshoot/elasticsearch/mapping-explosion) |
| Kibana | data view가 필드 목록을 읽음. 필드가 많으면 Discover가 느려지거나 rule payload가 한도를 넘음 | 같은 문서 |

필드는 index를 만든 뒤에는 줄일 수 없습니다(같은 문서). 줄이려면 새 mapping으로 reindex하거나, 다음 rollover부터 새 template을 적용하고 옛 index가 보존 기간을 지나 지워지기를 기다려야 합니다.

### 실측: 필드 수에 따른 heap 추정치

index 하나에 숫자 필드를 n개 가진 문서를 넣고, 노드의 `total_estimated_overhead`가 얼마나 늘었는지 봤습니다.

| 필드 수 | mapping JSON 크기 | heap 추정치 증가 | 첫 문서(mapping 갱신 포함) | 같은 문서 두 번째 |
| --- | --- | --- | --- | --- |
| 100 | 2.9KB | 117KB | 50ms | 23ms |
| 1,000 | 27KB | 0.99MB | 130ms | 51ms |
| 5,000 | 137KB | 4.9MB | 363ms | 171ms |
| 20,000 | 547KB | 19.5MB | 1,202ms | 640ms |
| 50,000 | 1.3MB | 48.8MB | 2,764ms | 1,932ms |

- heap 추정치는 필드(mapper) 하나에 1,024 byte로 늘었습니다. 이 값이 **index 하나마다** 붙습니다. 필드 5만 개짜리 backing index가 data node에 300개 있으면 추정치만 약 14GB입니다(계산).
- 첫 문서와 두 번째 문서의 차이가 mapping 갱신에 든 시간입니다. 단일 노드라 노드 사이 전파 시간은 들어 있지 않습니다. 노드가 많으면 더 걸립니다.

### 한도를 올린 결과: 사내 사례

필드 한도를 30만으로 올려 둔 클러스터에서 indexing node가 반복해서 OutOfMemory로 내려간 사례가 있었습니다. OOM 시점은 merge와 겹쳤고, segment마다 들고 있는 필드 정보가 heap을 차지한 것으로 분석됐습니다. 위 실측처럼 필드 하나의 비용은 작지만, 필드 수와 index 수, segment 수가 곱해지면 heap 전체를 채웁니다.

다른 사례에서는 Agent 9.4.3의 모니터링 데이터에 UUID가 든 필드 이름이 생겨 필드가 계속 늘었습니다. 한도를 3,000으로 올려도 곧바로 다시 찼습니다. 원인을 고치지 않고 한도만 올리면 같은 일이 반복됩니다.

## 한도에 닿으면 무슨 일이 생기나

한도가 1,000인 상태에서 키 1,200개를 가진 문서 하나를 세 가지 대상에 넣었습니다.

| 대상 | 응답 | 결과 |
| --- | --- | --- |
| standard index | 400 | `Limit of total fields [1000] has been exceeded`. 문서 거부 |
| logsdb index | 201 | 키 498개만 매핑하고 702개는 `_ignored`에 기록. 매핑되지 않은 키로는 검색되지 않음 |
| standard data stream + failure store | 201 | 문서가 failure store로 감(`document_parsing_exception`) |

- logsdb와 `logsdb_columnar`는 `index.mapping.total_fields.ignore_dynamic_beyond_limit`이 기본 `true`입니다. 한도를 넘는 동적 필드를 매핑하지 않고 `_ignored`에 남깁니다. 다른 index mode는 기본 `false`라 거부합니다([Mapping limit settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/mapping-limit)). 원본 값은 `_source`에 남지만 그 키로 검색, 집계는 안 됩니다.
- 그래서 logsdb에서는 한도 초과가 오류가 아니라 **조용한 검색 누락**으로 나타납니다. data stream별 `_ignored` 비율을 지켜봅니다([수집 06](../../ingest/06-flow-dashboard/)).
- 키 1,200개 중 498개만 매핑된 이유는 동적 문자열 매핑이 `text`와 `.keyword` 두 필드를 만들기 때문입니다. index template 없이 만든 index의 기본 동작입니다. 내장 `logs` template을 쓰는 `logs-*-*` data stream에서는 새 문자열 필드가 `keyword` 하나로 매핑됐습니다(실측). 같은 한도라도 매핑 규칙에 따라 담을 수 있는 키 수가 두 배 차이 납니다.

## 이름에 값이 들어가는 필드

필드 폭증의 흔한 원인은 필드 이름에 값이 들어가는 구조입니다. `stats.<요청 ID>.latency`, `monitoring.dataset.<UUID>.events`처럼 키가 끝없이 새로 생깁니다. UUID 3,000개 중 문서마다 3개를 키로 쓰는 문서 2,000건을 넣었습니다.

| 매핑 | 적재된 문서 | 매핑된 필드 | 첫 문서의 키로 검색 | 마지막 문서의 키로 검색 |
| --- | --- | --- | --- | --- |
| object(기본, standard) | 123 / 2,000 | 997 | 됨 | 안 됨(문서가 거부됨) |
| object(logsdb) | 2,000 / 2,000 | 999 | 됨 | 안 됨(키가 `_ignored`로 감) |
| `flattened` | 2,000 / 2,000 | 4 | 됨 | 됨 |

`flattened`는 object 전체를 필드 하나로 매핑하고, 안의 값을 모두 keyword로 색인합니다([Flattened](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/flattened)). 대신 잃는 것이 있습니다.

- 값이 모두 keyword입니다. 숫자 range query도 문자열로 비교하고, 정렬도 사전순입니다.
- 키에 wildcard를 쓸 수 없고, highlight가 안 됩니다.
- 9.4부터 `properties`로 특정 키만 타입을 지정해 따로 매핑할 수 있습니다(같은 문서). 자주 쓰는 몇 개 키는 이렇게 살립니다.

가장 좋은 해법은 구조를 바꾸는 것입니다. 값을 키에서 꺼내 `{"dataset_id": "<UUID>", "events": 12}`처럼 배열이나 별도 문서로 두면 필드 수가 고정됩니다. 원천을 바꿀 수 없을 때 ingest pipeline에서 이렇게 바꾸거나, `flattened`로 받습니다.

## Mapper 수를 줄이는 설정

| 방법 | 효과 | 주의 |
| --- | --- | --- |
| 문자열을 `keyword` 하나로 매핑하는 dynamic template | 문자열 키당 mapper 2개가 1개로 | 전문 검색이 필요한 필드는 따로 `text`나 `match_only_text`로 지정 |
| `subobjects: false` | 중간 object mapper를 만들지 않음. ECS식 문서에서 mapper 37개가 30개로 줄었음(실측). `host.os.name` 검색은 그대로 됨 | 그 아래에 object를 둘 수 없음. 이미 만든 매핑에서는 바꿀 수 없어 새 index부터 적용([subobjects](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/subobjects)) |
| `dynamic: false` | 매핑에 없는 필드는 `_source`에만 남고 매핑되지 않음 | 나중에 필요하면 runtime field나 ES\|QL로 읽음. 검색은 느림 |
| `dynamic: strict` | 매핑에 없는 필드가 오면 문서 거부 | failure store와 같이 써야 유실을 피함 |

`subobjects: false`의 mapper 감소는 공식 문서에도 ECS식 매핑에서 효과가 크다고 나옵니다([Mapping limit settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/mapping-limit)).

## Template 계층과 이름

설정을 어디에 넣느냐에 따라 integration 업그레이드 때 살아남는지가 갈립니다.

- Elasticsearch 내장 template(`logs-*-*`, `metrics-*-*` 등)의 priority는 100이고, Fleet integration이 만드는 template은 200까지 씁니다. Fleet을 쓰는 클러스터에서 이 패턴에 직접 index template을 만들면 integration template을 덮어쓸 수 있습니다([Templates](https://www.elastic.co/docs/manage-data/data-store/templates)).
- 그래서 integration data stream의 설정과 매핑은 `@custom` component template에 넣습니다. 범위별로 세 가지가 있습니다([Data streams](https://www.elastic.co/docs/reference/fleet/data-streams)).

| 이름 | 범위 |
| --- | --- |
| `<type>@custom`(예: `logs@custom`) | 그 type의 모든 data stream |
| `<package>@custom`(예: `system@custom`, 9.1 GA) | 그 integration의 모든 data stream |
| `<type>-<dataset>@custom`(예: `logs-system.auth@custom`) | 그 data stream 하나 |

- template을 바꿔도 이미 있는 backing index는 그대로입니다. 다음 rollover부터 적용됩니다.
- namespace는 환경, 팀, 사업 단위로 나누는 데 씁니다(최대 100 byte). 권한을 namespace 패턴으로 줄 수 있습니다(같은 문서). 다만 namespace를 고객사처럼 수가 많은 단위로 나누면 data stream과 shard가 그만큼 늘어납니다([04](../04-shards-and-bulk/#실측-tenant별-data-stream-300개-대-공용-data-stream)).

## Integration 업그레이드와 타입 충돌

integration을 업그레이드하면 template이 바뀌고, 다음 backing index부터 새 매핑이 적용됩니다. 어떤 필드의 타입이 바뀌면 같은 data stream 안에서 backing index끼리 타입이 달라집니다.

- data view에서는 그 필드가 conflict로 보이고, 집계나 정렬이 안 될 수 있습니다. 사내 사례에서 업그레이드 뒤 필드 60여 개가 `keyword`와 `long` 사이 conflict로 나타났습니다.
- 바뀐 타입에 맞지 않는 값은 failure store로 갑니다. 업그레이드 직후 failure store에 수백만 건이 쌓인 사례도 있었습니다.
- 필드가 한도에 가까운 data stream은 새 template의 필드가 더해지면서 업그레이드가 실패할 수 있습니다.

업그레이드 전후의 확인 순서는 [수집 02](../../ingest/02-where-to-parse/#운영)에 정리했습니다. 이미 conflict가 생긴 필드는 ES|QL에서 타입을 변환해 읽거나, 옛 backing index가 보존 기간을 지나 지워지기를 기다립니다.

## 판단 기준

| 상황 | 권장 |
| --- | --- |
| 필드 한도 초과 오류 | 한도를 올리기 전에 어떤 키가 늘고 있는지부터 봄. 필드 이름에 값이 들어가면 구조를 바꾸거나 `flattened` |
| 한도를 올려야 함 | 1,000에서 조금씩. 수만 단위로 올리지 않음. data node heap과 index 수를 같이 계산 |
| logsdb data stream | `_ignored` 비율을 모니터링. 한도 초과가 오류로 드러나지 않음 |
| 키를 예측할 수 없는 object(labels, tags, 외부 API 응답) | `flattened`. 자주 쓰는 키만 `properties`로 타입 지정(9.4 이후) |
| 매핑을 직접 정의한 index | 문자열 dynamic template을 `keyword` 하나로. ECS식 깊은 구조면 `subobjects: false` 검토 |
| integration data stream 매핑 변경 | 직접 index template을 만들지 않고 `@custom` component template |
| integration 업그레이드 | 업그레이드 직후 failure store, `_ignored`, data view conflict 확인 |

## 다음 글

- [07. Metrics와 TSDS](../07-time-series/): metrics data stream은 문서 ID와 받는 시간 범위가 로그와 다릅니다.
- 이 글의 실측 코드: [`labs/data/mappings-and-fields/`](https://github.com/Munsik/engineering-notes/tree/main/labs/data/mappings-and-fields)

## 참고 문서

- [Mapping limit settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/mapping-limit)
- [Mapping explosion](https://www.elastic.co/docs/troubleshoot/elasticsearch/mapping-explosion)
- [Size your shards](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/size-shards)
- [Flattened field type](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/flattened)
- [subobjects](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/subobjects)
- [Templates](https://www.elastic.co/docs/manage-data/data-store/templates)
- [Elastic Agent data streams](https://www.elastic.co/docs/reference/fleet/data-streams)
