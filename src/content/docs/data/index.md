---
title: 데이터 설계
description: 데이터를 얼마나, 어디에, 어떤 모양으로 둘지 정할 때 필요한 판단을 shard 내부 구조부터 저장 용량, shard와 bulk, 데이터 tier까지 순서대로 정리합니다.
sidebar:
  label: 개요
  order: 0
---

sizing을 하거나 비용 압박이 왔을 때 가장 먼저 부딪히는 질문은 대개 데이터 설계 질문입니다.
보관 기간을 늘리면 디스크가 얼마나 더 필요한지, shard를 몇 개로 나눌지, 오래된 데이터를 어디에 둘지 같은 것들입니다.
이 질문에 답하려면 먼저 shard 안에서 데이터가 어떻게 쌓이는지 알아야 합니다. 저장 용량을 재는 방법, bulk 성능, searchable snapshot 전의 force merge가 모두 같은 구조 위에서 움직이기 때문입니다.

그래서 이 컬렉션은 shard 내부 구조부터 시작합니다.

:::note[기준]
- Elasticsearch 9.x 기준입니다. 글마다 맨 위에 기준 버전과 실측 환경을 따로 적었습니다.
- 공식 문서로 확인한 내용에는 출처를 달았습니다. 출처가 없는 판단과 권장은 제 현장 경험에서 나온 것이고, 아직 확인하지 못한 내용에는 "확인 필요"라고 표시했습니다. 소스 코드나 직접 실행한 결과로 확인한 내용은 그 근거를 같이 적었습니다.
- 실측 코드와 결과는 저장소의 [`labs/data/`](https://github.com/Munsik/engineering-notes/tree/main/labs/data)에 있습니다.
:::

## 구성

| # | 주제 | 다루는 내용 |
| --- | --- | --- |
| 01 | [Segment의 생애](01-segments/) | shard와 Lucene index, segment 파일 구성, refresh와 search idle, indexing buffer, translog와 flush, 삭제와 update, soft delete와 retention lease |
| 02 | [Merge와 force merge](02-merge-and-force-merge/) | TieredMergePolicy와 LogByteSizeMergePolicy, merge가 indexing을 늦추는 조건, force merge를 해도 되는 때와 하면 안 되는 때, 디스크와 snapshot 영향 |
| 03 | [저장 용량 비교](03-storage-footprint/) | `best_compression`, synthetic `_source`, logsdb, `logsdb_columnar`가 무엇을 줄이고 무엇을 잃는지, 절감률을 읽는 baseline, 라이선스와 template에 따라 달라지는 동작 |
| 04 | [Shard와 bulk](04-shards-and-bulk/) | shard 크기 기준과 한도, bulk가 shard별로 쪼개지는 구조, bulk 크기, multi-tenant 설계, hot spotting 진단 순서 |
| 05 | [오래된 데이터](05-tiers-and-retention/) | data tier, fully mounted와 partially mounted searchable snapshot, frozen 조회 지연, `_tier`와 탐지 rule, repository 운영 규칙 |

## 자주 받는 질문

| 질문 | 짧은 답 | 자세히 |
| --- | --- | --- |
| 넣은 문서가 왜 바로 검색되지 않나 | refresh가 돼야 새 segment가 검색에 보입니다. 기본 1초지만 최근 30초 동안 검색이 없던 인덱스는 주기 refresh를 건너뜁니다. | [01](01-segments/#refresh와-search-idle) |
| update만 했는데 디스크가 늘어나는 이유 | update는 옛 문서에 삭제 표시를 붙이고 새 문서를 추가합니다. 옛 문서는 merge가 그 segment를 다시 쓸 때까지 남습니다. | [01](01-segments/#삭제와-update) |
| 대량 적재할 때 refresh를 꺼야 하나 | 공식 문서는 대량 적재 중 `-1`을 권합니다. 적재 중 아무도 검색하지 않는다면 기본값도 search idle 때문에 비슷하게 움직입니다. | [01](01-segments/#실측-refresh_interval에-따라-segment가-어떻게-생기나) |
| force merge를 정기적으로 돌려도 되나 | 쓰기가 끝난 인덱스에만 합니다. 쓰기 중인 인덱스에 하면 일반 merge에서 빠지는 큰 segment가 생기고 snapshot이 매번 전체 크기로 올라갑니다. | [02](02-merge-and-force-merge/#하면-안-되는-때) |
| force merge에 디스크가 얼마나 더 필요한가 | `max_num_segments=1`이면 shard 크기의 최대 세 배입니다. 실측에서는 2.5배에서 3배까지 올랐습니다. | [02](02-merge-and-force-merge/#실측-force-merge-전후) |
| 로그 인덱스와 카탈로그 인덱스의 merge가 다른가 | `@timestamp`가 있는 인덱스는 옆 segment끼리만 합치는 LogByteSizeMergePolicy를, 없는 인덱스는 TieredMergePolicy를 씁니다. | [02](02-merge-and-force-merge/#merge-policy는-두-가지다) |
| logsdb를 켜면 디스크가 얼마나 줄어드나 | 무엇과 비교하느냐에 따라 다릅니다. 실측에서 `default` codec 대비 65%, `best_compression` 대비 45%였습니다. host 수가 많으면 덜 줄었습니다. | [03](03-storage-footprint/#크기) |
| basic 라이선스에서 logsdb를 켜면 | index mode는 logsdb가 되지만 `_source`는 원래대로 저장됩니다. 오류나 경고는 없습니다. | [03](03-storage-footprint/#synthetic-_source는-라이선스가-없으면-조용히-stored가-된다) |
| bulk는 몇 건씩 보내야 하나 | 처리량이 평평해지는 크기를 직접 찾습니다. 실측에서는 약 750KB(1,000건) 근처였습니다. shard가 많으면 bulk가 shard별로 쪼개져 더 크게 보내야 합니다. | [04](04-shards-and-bulk/#실측-bulk-크기-x-primary-shard-수) |
| 고객사마다 data stream을 나눠도 되나 | 300개로 나눴더니 적재가 3.5배 느리고 저장 크기가 1.7배였습니다. 공용 data stream과 `tenant.id`를 기본으로 권합니다. | [04](04-shards-and-bulk/#실측-tenant별-data-stream-300개-대-공용-data-stream) |
| frozen 데이터는 얼마나 느린가 | 첫 조회만 느리고, cache에 올라간 뒤에는 regular index와 비슷했습니다. object storage에서는 첫 조회가 더 느립니다. | [05](05-tiers-and-retention/#첫-조회와-반복-조회) |
| 탐지 rule이 frozen 데이터를 건드리지 않게 하려면 | `_tier` 조건이나 `securitySolution:excludedDataTiersForRuleExecution`으로 frozen을 뺍니다. | [05](05-tiers-and-retention/#frozen-데이터를-건드리는-query와-rule) |

## 읽는 순서

01, 02를 먼저 읽기를 권합니다. 뒤의 글들이 저장 용량을 재는 방법과 force merge를 이 두 글의 내용을 전제로 설명합니다.
03, 04, 05는 같은 synthetic 로그 생성기([`labs/_datagen/`](https://github.com/Munsik/engineering-notes/tree/main/labs/_datagen))를 쓰지만 서로 독립적으로 읽어도 됩니다.
