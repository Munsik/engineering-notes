# 데이터 설계 Labs

[데이터 설계](https://munsik.github.io/engineering-notes/data/) 컬렉션의 실험 자료입니다.

| 경로 | 내용 | 설명 페이지 |
| --- | --- | --- |
| [`segments-and-merge/`](segments-and-merge/) | refresh 주기, update 누적, merge policy, force merge 실측 | [01. Segment의 생애](https://munsik.github.io/engineering-notes/data/01-segments/), [02. Merge와 force merge](https://munsik.github.io/engineering-notes/data/02-merge-and-force-merge/) |
| [`storage-footprint/`](storage-footprint/) | `best_compression`, synthetic `_source`, logsdb, `logsdb_columnar` 저장 크기, `_disk_usage`, 조회 지연, `_source` 차이 | [03. 저장 용량 비교](https://munsik.github.io/engineering-notes/data/03-storage-footprint/) |
| [`shards-and-bulk/`](shards-and-bulk/) | bulk 크기 x primary shard 수, tenant별 data stream 대 공용 data stream, routing 편중 | [04. Shard와 bulk](https://munsik.github.io/engineering-notes/data/04-shards-and-bulk/) |
| [`tiers-and-retention/`](tiers-and-retention/) | fully mounted, partially mounted 조회 지연, ILM frozen 전환, regular index 복원, `_tier` 제외 | [05. 오래된 데이터](https://munsik.github.io/engineering-notes/data/05-tiers-and-retention/) |

03, 04, 05는 공통 synthetic 로그 생성기 [`../_datagen/loggen.py`](../_datagen/loggen.py)를 씁니다.
