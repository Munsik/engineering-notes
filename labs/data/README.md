# 데이터 설계 Labs

[데이터 설계](https://munsik.github.io/engineering-notes/data/) 컬렉션의 실험 자료입니다.

| 경로 | 내용 | 설명 페이지 |
| --- | --- | --- |
| [`segments-and-merge/`](segments-and-merge/) | refresh 주기, update 누적, merge policy, force merge 실측 | [01. Segment의 생애](https://munsik.github.io/engineering-notes/data/01-segments/), [02. Merge와 force merge](https://munsik.github.io/engineering-notes/data/02-merge-and-force-merge/) |
| [`storage-footprint/`](storage-footprint/) | `best_compression`, synthetic `_source`, logsdb, `logsdb_columnar` 저장 크기, `_disk_usage`, 조회 지연, `_source` 차이 | [03. 저장 용량 비교](https://munsik.github.io/engineering-notes/data/03-storage-footprint/) |
| [`shards-and-bulk/`](shards-and-bulk/) | bulk 크기 x primary shard 수, tenant별 data stream 대 공용 data stream, routing 편중 | [04. Shard와 bulk](https://munsik.github.io/engineering-notes/data/04-shards-and-bulk/) |
| [`tiers-and-retention/`](tiers-and-retention/) | fully mounted, partially mounted 조회 지연, ILM frozen 전환, regular index 복원, `_tier` 제외 | [05. 오래된 데이터](https://munsik.github.io/engineering-notes/data/05-tiers-and-retention/) |
| [`mappings-and-fields/`](mappings-and-fields/) | 필드 수에 따른 heap 추정치, 필드 한도 초과 시 standard, logsdb, failure store 동작, UUID 키의 object 대 `flattened`, `subobjects: false` | [06. Mapping과 필드 수](https://munsik.github.io/engineering-notes/data/06-mappings-and-fields/) |
| [`time-series/`](time-series/) | TSDS 시간 범위, 자동 문서 ID와 409, 과거 backing index 생성, standard 대 logsdb 대 time_series 크기, downsample | [07. Metrics와 TSDS](https://munsik.github.io/engineering-notes/data/07-time-series/) |

03, 04, 05는 공통 synthetic 로그 생성기 [`../_datagen/loggen.py`](../_datagen/loggen.py)를 씁니다.

06, 07은 로컬 Elasticsearch 9.5.5 단일 노드(vCPU 1, heap 1GB, 보안 끔)에서 실행했습니다. 시험 디스크의 사용률이 96%라 merge가 멈췄기 때문에, 07의 크기 비교와 downsample은 `indices.merge.disk.watermark.high`를 99%로 올리고 실행했습니다(운영 권장 아님).
