# Segment, merge, force merge 실측

데이터 설계 컬렉션의 [01. Segment의 생애](https://munsik.github.io/engineering-notes/data/01-segments/)와 [02. Merge와 force merge](https://munsik.github.io/engineering-notes/data/02-merge-and-force-merge/)에 나온 수치를 만든 실험 자료입니다.

| 경로 | 내용 |
| --- | --- |
| [`lab.js`](lab.js) | 실험 스크립트. Kibana에 로그인한 브라우저 탭의 개발자 도구 콘솔에 붙여 넣어 실행합니다 |
| [`segments-and-merge.console`](segments-and-merge.console) | 본문에 나온 점검 요청 모음. Kibana Dev Tools Console용 |
| [`results/`](results/) | 실측 결과. `raw.json`(1회차), `raw_run2.json`(2회차, replica 1 조건, kNN 기본 조건), `raw_run3.json`(replica 1 조건 force merge, kNN segment 40개 조건)이 원본이고 CSV는 원본에서 뽑은 표입니다 |

## 실행 환경

| 항목 | 값 |
| --- | --- |
| 배포 | Elastic Cloud Hosted 9.5.5 (Lucene 10.5.1) |
| 데이터 노드 | hot node 2대. 노드당 RAM 8GB, JVM heap 4GB, vCPU 2 |
| 인덱스 | primary 1개, replica 0개 |
| 데이터 | `lab.js`의 `genDocs()`로 만든 synthetic 로그. 문서당 약 350바이트, host 50개, service 5개, 단어 32개로 만든 message |
| 적재 방식 | 브라우저 client 하나가 2,000건씩 `_bulk` |
| 실행일 | 2026-11-25 |

절대값은 환경마다 다릅니다. 조건 사이의 차이를 보는 용도로 쓰세요.

## 실험과 결과 파일

| 실험 | 함수 | 결과 파일 | 본문 |
| --- | --- | --- | --- |
| A. `refresh_interval` 미설정, `1s`, `30s`, `-1`로 100만 건 적재. 2회 | `expRefresh()`, `expRefresh({ suffix: '-r2' })` | `A_refresh.csv`, `A_timeline.csv` | 01 |
| B. 20만 건을 같은 `_id`로 다섯 번 update, `only_expunge_deletes` | `expUpdate()` | `B_update.csv` | 01 |
| B'. B를 replica 1개로 | `expUpdate({ suffix: '-rep1', replicas: 1 })` | `B_update_replica1.csv` | 01 |
| C1. force merge 전후 snapshot 증분 | `expForceMergeSnapshot()` | `C_snapshot.csv` | 02 |
| C2. force merge 진행 중 `store.size`. replica 0개, 1개 | `expForceMergePeak(index)` | `C_forcemerge.csv`, `C_peak_samples.csv` | 02 |
| D. `@timestamp` 매핑 / `ts` 필드 / dynamic `@timestamp` 비교, close/open 후 추가 적재. 2회 | `expPolicy()`, `expPolicy({ suffix: '-r2' })` | `D_policy.csv`, `D_timeline.csv` | 02 |
| E. kNN 검색 지연, segment 여러 개와 1개. segment 40개 조건 2회 | `expKnn()`, `expKnnSegments()`, `expKnnSegments({ suffix: '-seg40-r2' })` | `E_knn.csv` | 02 |
| `_disk_usage` | 콘솔 요청 | `raw.json`의 `disk_usage` | 01 |

`raw.json`의 `timeline` 배열은 `[보낸 문서 수, 경과 초, segment 수, commit된 segment 수]`입니다. 실험 D와 close/open 뒤 timeline은 `[보낸 문서 수, 경과 초, 검색 가능 segment 수]`입니다.

## 실행 순서

1. Kibana에 로그인한 탭에서 개발자 도구 콘솔을 열고 `lab.js` 전체를 붙여 넣습니다.
2. `await expRefresh()`를 실행합니다. 약 9분 걸립니다. 반복하려면 `await expRefresh({ suffix: '-r2' })`처럼 이름을 바꿔 돌립니다.
3. `await expPolicy()`, `await expUpdate()`를 실행합니다.
4. `await expForceMergeSnapshot()`, `await expForceMergePeak('segments-lab-policy-dynamic-ts')`를 실행합니다. 각각 A와 D가 만든 인덱스를 씁니다.
5. `await expKnnSegments()`로 kNN 실험을 합니다.
6. 끝나면 `await cleanup()`으로 `segments-lab-*` 인덱스를 지웁니다.

## 실행하면서 알게 된 것

- `store.size`는 기본 10초 동안 캐시됩니다(`index.store.stats_refresh_interval`). 측정 전에 15초를 기다립니다. force merge 중간값을 보려면 그 인덱스의 이 설정을 `0s`로 바꿔야 하고, 정적 설정이라 `?reopen=true`가 필요합니다.
- 기본값(미설정) 인덱스는 만든 뒤 30초 안에 적재를 시작하면 아직 search idle이 아니라서 1초마다 refresh합니다. 그래서 40초를 기다린 뒤 적재합니다.
- console proxy로 보내는 `_bulk`는 2,000건(약 0.7MB)에서 성공하고 5,000건(약 1.8MB)에서 실패했습니다.
- 실험 C1의 첫 snapshot이 증분 0바이트인 이유는 Elastic Cloud Hosted의 기본 snapshot 정책이 이미 그 인덱스를 올려 두었기 때문입니다. 직접 구축 환경에서는 첫 snapshot이 전체 크기로 나옵니다.
- `_cat/segments`는 primary와 replica의 segment를 모두 나열합니다. `idxStats()`의 segment 수도 replica가 있으면 모든 copy를 합친 값입니다. replica 조건 CSV의 열 이름에 `all_copies`를 붙인 이유입니다.
- 실험 C2의 replica 1 조건은 2회차 D의 `segments-lab-policy-ts-field-r2`를 `number_of_replicas: 1`로 바꾼 뒤 `expForceMergePeak('segments-lab-policy-ts-field-r2')`로 쟀습니다.
- 실험 E를 기본 merge policy로 돌리면(`expKnn()`) 3만 건을 넣는 동안 segment가 2개로 합쳐져 비교가 되지 않았습니다. 그래서 `expKnnSegments()`는 `index.merge.policy.segments_per_tier: 64`, `refresh_interval: -1`로 만들고 750건마다 `_refresh`해서 segment 40개를 만든 뒤 비교합니다. `segments_per_tier`는 현재 공식 문서에 없는 설정이라 실험용으로만 썼습니다.
- 실험 D의 close/open 단계는 원래 실행에서 seed를 `7 + 절대 위치`로 줬습니다. `lab.js`는 `offset` 옵션을 써서 seed 계산이 조금 다릅니다. 문서 내용만 달라지고 크기와 분포는 같습니다.
