# 1. 데이터를 얼마나, 어디에, 어떤 모양으로 둘 것인가

도입 초기 sizing과, 운영 중 비용 압박이 왔을 때 가장 먼저 부딪히는 질문을 다룹니다.
1-1, 1-2는 shard 내부 구조(segment, merge)를 먼저 설명합니다. 뒤의 세 글(1-3, 1-4, 1-5)은 이 내용을 전제로 하고, `labs/_datagen/`의 같은 synthetic 로그 데이터셋을 이어서 씁니다.

- 폴더: `src/content/docs/data/` (0-1 A안: 기존 AD URL은 유지하고 새 컬렉션은 문제 축 폴더에 둠)
- labs: `labs/data/`
- sidebar: `astro.config.mjs`에 "데이터 설계" 그룹(`autogenerate: { directory: 'data' }`)을 최상위 첫 번째로 추가했습니다(01, 02 발행과 함께, 2026-11-25).

---

## 1-1. Shard 안의 Lucene: segment가 생기고 사라지기까지

상태: `발행` (2026-11-25)
파일: `data/01-segments.md`, `labs/data/segments-and-merge/`

- 답하는 질문: 넣은 문서가 왜 바로 검색되지 않나, update만 했는데 디스크가 왜 늘어나나, merge 뒤에도 `store.size`가 왜 그대로인가, refresh와 flush와 commit은 무엇이 다른가
- 실측(ECH 9.5.5): `refresh_interval` 미설정/`1s`/`30s`/`-1` 비교(2회), 반복 update와 `only_expunge_deletes`(replica 0개, 1개), `_disk_usage`
- 소스로 확인한 것: `flush_threshold_age` 1m, indexing buffer 압박 시 segment 쓰기, 유휴 shard flush 5m, compound file 기준, `__soft_deletes`
- 발행 전 사실검증: 공식 문서, 9.5.5 소스, 로컬 9.5.5 재현으로 다시 확인하고 반영(2026-11-25)

## 1-2. Merge와 force merge: 언제 하고 언제 하지 말아야 하나

상태: `발행` (2026-11-25)
파일: `data/02-merge-and-force-merge.md`, `labs/data/segments-and-merge/`

- 답하는 질문: merge policy는 무엇이 다른가, merge가 indexing을 늦추는 조건, force merge를 해도 되는 때와 하면 안 되는 때, 디스크와 snapshot 영향
- 실측(ECH 9.5.5): `@timestamp` 유무와 dynamic `@timestamp`에 따른 policy 차이(2회), close/open 후 변화, force merge 중 `store.size` 최대 2.46배에서 2.96배(replica 0개, 1개), force merge 후 snapshot 전체 재업로드, segment 40개 대 1개 kNN 지연(384차원 3만 건에서는 차이 1ms 안쪽)
- 남은 확인: 디스크의 실제 segment 파일 목록(로컬 Elasticsearch 필요), 큰 vector 인덱스에서 segment 수에 따른 kNN 지연
- 소스로 확인한 것: policy 판정 조건과 시점, Tiered와 LogByteSize 기본값(9.5에서 `segments_per_tier` 10에서 8, `floor_segment` 2MB에서 16MB), merge IO throttle 범위, indexing throttle 방식
- 발행 전 사실검증: 공식 문서, 9.5.5 소스, 로컬 9.5.5 재현으로 다시 확인하고 반영(2026-11-25)

---

## 1-3. 로그 저장 용량은 무엇과 비교해 몇 % 줄어드는가

상태: `발행` (2026-11-26)
파일: `data/03-storage-footprint.md`, `labs/data/storage-footprint/`

- 실측(로컬 9.5.5 단일 노드, trial): 5개 설정 x 4개 데이터셋(1천만 건 대신 10만에서 30만 건) x 2회, `_disk_usage`, `_source` 차이
- 소스로 확인한 것: 라이선스 fallback(`LogsdbIndexModeSettingsProvider.java`, `LogsdbLicenseService.java`), template으로 줄 때만 `host.name` 정렬
- 남은 확인: 운영 하드웨어에서의 적재 비용 차이, 객체 배열 비율 축(fidelity 예시로 대체)

### 이 글이 답하는 질문

- logsdb를 켜면 디스크가 얼마나 줄어드나. 무엇과 비교한 숫자인가
- best_compression, synthetic source, logsdb, columnar 모드는 각각 무엇을 줄이고 무엇을 잃나
- 보관 기간을 늘리고 싶을 때 어떤 설정부터 바꿔야 하나
- 우리 데이터에서 절감률을 미리 가늠하려면 무엇을 측정해야 하나

### 독자와 전제

- 로그 보관 기간과 디스크 비용을 같이 고민하는 운영자, sizing을 하는 도입 담당자
- 기준: Elasticsearch 9.x 최신 patch. columnar 모드는 문서상 일부 항목이 9.5 preview, 다수가 planned로 표기되어 있으므로 실험 시점 상태를 다시 확인

### 범위

다룸:

- 같은 데이터를 5가지 조합으로 적재해 비교: standard + default codec, standard + best_compression, standard + synthetic source, logsdb, logsdb_columnar
- 데이터 특성(host cardinality, 필드 수, message 길이, 배열과 객체 비율)에 따라 절감률이 어떻게 달라지는지
- 절감과 맞바꾸는 것: `_source` 충실도(객체 배열 묶음, unmapped 필드, 배열 순서), 매핑 제약, indexing 처리량, 조회 지연
- 공개 자료의 절감률 수치를 읽을 때 baseline을 확인하는 법

다루지 않음:

- 가격과 라이선스 비용 계산
- 특정 제품과의 경쟁 비교

### 목차 초안

1. 업무 문제: "보관 기간을 두 배로 늘리면 디스크가 두 배 필요한가"
2. 비교의 함정: 절감률은 항상 baseline과 함께 읽어야 한다
3. 저장 공간을 차지하는 요소: inverted index, doc values, stored `_source`, points (`_disk_usage`로 필드별 분해)
4. 설정 조합별 설계 결정과 trade-off
5. 구현: index template과 `logs@custom` component template 예시
6. 검증: labs 실측 결과 표와 해석
7. 운영 고려사항: 기존 data stream 전환 시 rollover 이후부터 적용, 통합(integration) data stream 적용 방법, 전환 전 `_source` 소비자 점검
8. 판단 기준 요약

### labs 실험 설계

- 데이터: `labs/_datagen/`로 생성. 기본 1천만 문서. 아래 축을 바꾼 데이터셋 3~4종
  - 저 cardinality(host 50) / 고 cardinality(host 5만)
  - 필드 20개 / 200개
  - message 평균 200B / 2KB
  - 객체 배열 포함 여부
- 조합: 위 5가지 index 설정
- 절차: 같은 순서로 bulk 적재, refresh 후 측정, `_forcemerge?max_num_segments=1` 후 다시 측정
- 지표:
  - `store.size`, 문서당 bytes
  - `_disk_usage` API의 필드별 분해
  - 적재 처리량(docs/s), 적재 중 CPU
  - 조회 지연: term filter, range + terms aggregation, `_source` fetch 100건
  - `_source` 차이: 같은 문서를 각 조합에서 꺼내 원본과 diff
- 반복: 조합별 2회 이상
- 산출물: `results/*.csv`, 결과 요약 표, 재현 스크립트

### 공식 출처

- [Logs data streams](https://www.elastic.co/docs/manage-data/data-store/data-streams/logs-data-stream)
- [Configure a logs data stream](https://www.elastic.co/docs/manage-data/data-store/data-streams/logs-data-stream-configure)
- [Enable logsdb for integrations](https://www.elastic.co/docs/manage-data/data-store/data-streams/logs-data-stream-integrations)
- [_source field](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/mapping-source-field)
- [Columnar index mode](https://www.elastic.co/docs/reference/elasticsearch/columnar)
- [Analyze the index disk usage API](https://www.elastic.co/docs/api/elasticsearch/operation/operation-indices-disk-usage)
- Search Labs: [LogsDB index mode](https://www.elastic.co/search-labs/blog/elasticsearch-logsdb-index-mode)
- Search Labs: [Columnar storage](https://www.elastic.co/search-labs/blog/elasticsearch-columnar-storage)

### 확인할 사실

- [x] `logs-*-*` data stream에서 logsdb가 기본으로 켜지는 조건(버전, 배포 형태, 라이선스)
- [x] synthetic source를 쓸 수 있는 라이선스 조건과, 조건이 안 될 때의 동작
- [x] logsdb의 기본 index sorting 필드와 `index.mapping.synthetic_source_keep` 기본값
- [x] columnar 모드의 버전별, 배포 형태별 상태(preview, planned)와 라이선스에 따른 `_source` 모드
- [x] 공식 문서와 Labs 글에 나오는 절감률 수치의 baseline(index mode, codec)
- [ ] best_compression 사용 시 압축 알고리즘(zstd 적용 버전) (글 범위에서 뺌. codec 비교는 `best_compression`과 `default`만 다룸)

### 작업 항목

- [x] 0-3의 공통 datagen이 위 데이터 축을 모두 지원하도록 구현 (`labs/_datagen/loggen.py`)
- [x] 5개 조합의 index template 작성, 라이선스가 필요한 조합은 trial로 실행하고 README에 명시
- [x] 측정 스크립트 작성 및 2회 이상 실행
- [x] 결과 표 작성, 실측과 예시 구분
- [x] `_source` diff 예시 1~2개 선정해 본문에 수록
- [x] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)

---

## 1-4. Shard 수와 크기, bulk 형태를 어떻게 정할 것인가

상태: `발행` (2026-11-26)
파일: `data/04-shards-and-bulk.md`, `labs/data/shards-and-bulk/`

- 실측(로컬 9.5.5 단일 노드): 실험 A 3회(primary 1개 행은 1, 3회차), 실험 B 2회, 실험 C 1회. 3노드 구성은 쓰지 않음
- 남은 확인: 다중 노드에서 write queue 편중 재현

### 이 글이 답하는 질문

- primary shard는 몇 개로 잡아야 하나. 크기 기준은 무엇인가
- bulk 요청은 몇 건, 몇 MB로 보내야 하나. 작게 자주 보내면 무엇이 비싸지나
- tenant나 dataset마다 data stream을 나누면 shard가 얼마나 늘어나나
- 특정 노드만 느리거나 바쁠 때 무엇부터 봐야 하나

### 독자와 전제

- 인덱스 설계를 정하는 도입 담당자, indexing 지연을 겪는 운영자
- 기준: Elasticsearch 9.x, self-managed와 ECH 위주. Serverless의 자동 sharding은 차이만 짧게 언급

### 범위

다룸:

- shard 크기와 개수 기준(공식 가이드), 노드당 shard 수 제한
- bulk 크기와 shard 수의 조합이 처리량과 CPU에 미치는 영향
- multi-tenant 설계 3가지: tenant별 data stream, 공용 data stream + tenant 필드, routing
- hot spotting 진단 순서: shard 크기 편차, write load, 노드 자원

다루지 않음:

- 검색 쪽 shard 튜닝 상세(3-3과 6장으로)

### 목차 초안

1. 업무 문제: "처음 정한 shard 수를 몇 년째 그대로 쓰고 있다"
2. shard가 비용이 되는 지점: 요청 분산, cluster state, 노드당 한도
3. bulk와 shard의 관계: 한 bulk가 여러 shard로 쪼개지는 구조
4. 설계 결정: shard 크기 목표, rollover 조건, bulk 크기
5. multi-tenant 설계 비교 표
6. 검증: labs 실측
7. 운영: hot spotting 진단 순서, 노드당 shard 한도에 다가갈 때의 신호
8. 판단 기준 요약

### labs 실험 설계

- 환경: 3노드 docker compose (`labs/_env/`)
- 실험 A, bulk와 shard:
  - primary 1 / 5 / 20, bulk 크기 1 / 10 / 100 / 1,000 / 5,000 문서
  - 지표: docs/s, 노드 CPU, write thread pool queue와 rejected, 요청 지연
- 실험 B, multi-tenant:
  - tenant 100 × dataset 3을 별도 data stream으로 만든 경우와 공용 data stream + tenant 필드
  - 지표: 총 shard 수, cluster state 크기, tenant 단일 조회 지연
- 실험 C, hot spotting 재현:
  - 한 data stream에 쓰기를 몰고, shard 크기가 불균형한 상태를 만들어 `_cat/shards`, `_nodes/stats`로 진단하는 과정 기록
- 산출물: 결과 CSV, 진단 명령 모음

### 공식 출처

- [Size your shards](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/size-shards)
- [Tune for indexing speed](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/indexing-speed)
- [Hot spotting](https://www.elastic.co/docs/troubleshoot/elasticsearch/hotspotting)
- [Total number of shards for an index on a single node exceeded](https://www.elastic.co/docs/troubleshoot/elasticsearch/increase-shard-limit)

### 확인할 사실

- [x] 현재 공식 문서의 shard 크기 권장 범위와 문서 수 기준
- [x] `cluster.max_shards_per_node` 기본값과 tier별 적용 방식
- [x] data stream rollover 기본 조건(관리형 lifecycle과 ILM 각각)
- [x] bulk 크기에 대한 공식 권장(문서 수가 아니라 크기 기준인지)
- [x] Serverless 자동 sharding의 공개 문서 범위

### 작업 항목

- [x] 실험 A, B, C 스크립트 작성과 실행
- [x] multi-tenant 비교 표 작성
- [x] hot spotting 진단 순서를 체크리스트로 정리
- [x] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)

---

## 1-5. 오래된 데이터는 어디에 두고 어떻게 꺼내 볼 것인가

상태: `발행` (2026-11-26)
파일: `data/05-tiers-and-retention.md`, `labs/data/tiers-and-retention/`

- 실측(로컬 9.5.5 단일 노드, shared cache 1GB, `fs` repository): mount 방식별 크기와 조회 지연 2회, ILM 전환 단계, regular index 복원, `_tier` 제외(Query DSL, ES|QL filter)
- 남은 확인: S3 또는 MinIO에서의 첫 조회 지연, 다중 노드에서 frozen node 재시작 중 검색 결과

### 이 글이 답하는 질문

- 1년치 데이터를 싸게 보관하면서도 검색할 수 있나
- hot, warm, cold, frozen은 각각 언제 쓰나. frozen을 쓰면 무엇이 달라지나
- frozen 데이터를 query나 탐지 rule이 건드릴 때 어떤 실패가 생기고 어떻게 피하나
- snapshot repository를 운영할 때 지켜야 할 것은 무엇인가
- frozen보다 더 싸게, 검색은 거의 안 하는 데이터는 어떻게 하나

### 독자와 전제

- 장기 보관 요구가 있는 운영자, 규제 산업의 보관 정책 담당자
- 기준: Elasticsearch 9.x, self-managed는 S3 호환 저장소, ECH 비교는 차이점만

### 범위

다룸:

- tier별 역할과 선택 기준, ILM 정책 설계
- fully mounted와 partially mounted searchable snapshot의 차이
- frozen 조회 지연(첫 조회와 캐시 이후), 노드 재시작 중 동작
- query와 탐지 rule에서 cold, frozen 데이터를 제외하는 방법
- snapshot repository 운영 규칙: 여러 클러스터의 쓰기 금지, read-only 등록, 저장소 점검 시 SLM과 ILM 처리
- frozen 이후 보관 대안(공개 Labs 글 범위)

다루지 않음:

- 특정 제품과의 비교
- 클라우드 저장소 가격

### 목차 초안

1. 업무 문제: "최근 2주는 자주, 1년은 가끔, 3년은 감사 때만 본다"
2. tier별 비용과 조회 특성
3. 설계 결정: ILM 단계와 min_age, searchable snapshot 종류
4. 구현: ILM 정책, repository 등록 예시
5. 검증: frozen 조회 지연 실측, 재시작 시나리오
6. 운영: frozen을 피해야 할 query와 rule, repository 운영 규칙, 복원 절차
7. 판단 기준 요약

### labs 실험 설계

- 환경: `labs/_env/` + MinIO
- ILM을 분 단위로 줄여 hot → frozen 이동을 빠르게 재현
- 측정:
  - 같은 query를 hot, cold(fully mounted), frozen(partially mounted)에서 실행. 첫 실행과 반복 실행 지연
  - frozen 노드 재시작 중 넓은 index pattern query와 tier 제외 query의 결과 비교
- 복원: searchable snapshot을 일반 index로 복원하는 절차와 소요 시간
- 산출물: ILM 정책, 측정 결과, 절차 기록

### 공식 출처

- [Data tiers](https://www.elastic.co/docs/manage-data/lifecycle/data-tiers)
- [ILM searchable snapshot action](https://www.elastic.co/docs/reference/elasticsearch/index-lifecycle-actions/ilm-searchable-snapshot)
- [Searchable snapshots](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/searchable-snapshots)
- [Snapshot and restore](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore)
- [Restore searchable snapshot data to a regular index](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/restore-searchable-snapshot-to-regular-index)
- [Security: Set rule data sources](https://www.elastic.co/docs/solutions/security/detect-and-alert/set-rule-data-sources)
- Search Labs: [S3 Glacier archiving with Deepfreeze](https://www.elastic.co/search-labs/blog/s3-glacier-archiving-elasticsearch-deepfreeze)

### 확인할 사실

- [x] frozen tier 사용 가능 라이선스 조건
- [x] partially mounted index의 로컬 캐시 크기 설정과 기본값
- [x] ILM searchable snapshot action의 force merge 관련 옵션과 기본값
- [x] 한 repository에 여러 클러스터가 쓰면 안 된다는 공식 문구와 read-only 등록 방법
- [x] query에서 tier를 제외하는 공식 방법(`_tier` 필드 등)과 ES|QL에서의 동작
- [x] Deepfreeze의 지원 상태(공식 기능인지, 공개 도구인지)

### 작업 항목

- [ ] MinIO 포함 compose 구성 (하지 않음. 같은 디스크의 `fs` repository로 측정하고 object storage 지연은 남은 확인으로 둠)
- [x] 측정 스크립트와 재시작 시나리오 작성, 실행
- [x] repository 운영 규칙을 공식 문구 기준으로 정리
- [x] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)
