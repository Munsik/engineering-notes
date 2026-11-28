# Roadmap

Elastic을 도입하고 운영하는 사람이 실제로 마주치는 순서대로 주제를 나눴습니다.
최상위 분류는 제품 기능이 아니라 실무자가 묻는 질문입니다.

마지막 계획 갱신: 2026-11-28

## 현재 상태

| 구분 | 대상 |
| --- | --- |
| 완료 | 설계 1-1에서 1-7, 수집 2-1에서 2-8, 안정성 운영 3-1에서 3-10, 변화 관리 4-1에서 4-10, Anomaly Detection 01에서 09. 공개 컬렉션 5개, 글 44편 |
| 진행 중 | 없음 |
| 다음 착수 | 5-1-10(2단계에서 남은 글), 이어서 5-1-11, 5-2 |
| 예정 | 6-1, 6-2 |
| 보류 | 6-3 |
| 남은 재검증 | 3-5에서 3-10, 4-1에서 4-10의 API와 스크립트를 lab에서 실행 확인(발행 때는 공식 문서와 소스 기준으로만 확인). 4-x의 화면 캡처는 `planning/captures/change-captures.md` |

사이트 구조는 영역 > 컬렉션 > 글입니다. 아래 tree는 Elastic Stack 영역의 컬렉션입니다. 다음 영역은 아직 정하지 않았습니다([0-6](collections/00-site-structure.md#0-6-영역-단계-도입)).

홈의 "다음에 쓸 글" 목록(`src/site-upcoming.mjs`)은 위 "다음 착수"와 "예정"을 같은 순서로 보여 줍니다. 이 표를 바꾸면 그 파일도 같이 바꿉니다.

## 주제 tree

```
Engineering Notes
│
└─ Elastic Stack   (영역. 개요 /elastic/, 컬렉션 URL은 영역 도입 전 그대로)
    ├─ 1. 데이터를 얼마나, 어디에, 어떤 모양으로 둘 것인가   (설계)
    │   ├─ 1-1. Shard 안의 Lucene: segment가 생기고 사라지기까지 (발행)
    │   ├─ 1-2. Merge와 force merge: 언제 하고 언제 하지 말아야 하나 (발행)
    │   ├─ 1-3. 로그 저장 용량은 무엇과 비교해 몇 % 줄어드는가 (발행)
    │   ├─ 1-4. Shard 수와 크기, bulk 형태를 어떻게 정할 것인가 (발행)
    │   └─ 1-5. 오래된 데이터는 어디에 두고 어떻게 꺼내 볼 것인가 (발행)
    │
    ├─ 2. 데이터를 어떻게 안정적으로 들여올 것인가   (수집)
    │   ├─ 2-1. 수집기는 무엇으로 고를 것인가 (발행)
    │   ├─ 2-2. 파싱은 어디서 할 것인가 (발행)
    │   ├─ 2-3. 수집기가 멈춰도 로그가 끊기지 않게 하려면 (발행)
    │   ├─ 2-4. UDP syslog를 유실 없이 받으려면 (발행)
    │   ├─ 2-5. 원본을 빠짐없이 받았다는 것을 어떻게 증명하는가 (발행)
    │   ├─ 2-6. 수집 흐름을 대시보드로 어떻게 보는가 (발행)
    │   ├─ 2-7. 수집 계층에 자원은 얼마나 필요한가 (발행)
    │   └─ 2-8. 수백에서 수만 대 Agent를 어떻게 운영할 것인가 (발행)
    │
    ├─ 3. 클러스터가 죽지 않게, 죽어도 돌아오게   (운영)
    │   ├─ 3-1. 평소에 무엇을 보고 있어야 하는가 (발행)
    │   ├─ 3-2. 클러스터가 RED나 YELLOW일 때 무엇부터 보는가 (발행)
    │   ├─ 3-3. 노드가 왜 죽었는지 어떻게 좁혀 가는가 (발행)
    │   ├─ 3-4. 디스크가 차면 무슨 일이 생기고 어떻게 푸는가 (발행)
    │   ├─ 3-5. 클러스터가 느려질 때 어디서 막혔는지 어떻게 찾는가 (발행)
    │   ├─ 3-6. 비싼 query로부터 클러스터를 어떻게 보호하는가 (발행)
    │   ├─ 3-7. 노드가 클러스터에서 자꾸 빠질 때 (발행)
    │   ├─ 3-8. 노드 하나를 잃어도 데이터를 잃지 않으려면 (발행)
    │   ├─ 3-9. 진단 파일을 밖으로 낼 수 없을 때 어떻게 점검하는가 (발행)
    │   └─ 3-10. 장애가 났을 때 첫 30분에 무엇을 하는가 (발행)
    │
    ├─ 4. 바꿀 때   (변화 관리)
    │   ├─ 4-1. 바뀌는 것의 지도: 네 층과 기준 원본 (발행)
    │   ├─ 4-2. 변경을 안전하게 흘려보내는 절차 (발행)
    │   ├─ 4-3. managed 자산은 고치지 말고 위에 얹는다 (발행)
    │   ├─ 4-4. Elasticsearch 데이터 정의를 바꿀 때 (발행)
    │   ├─ 4-5. Kibana 객체와 설정을 바꿀 때 (발행)
    │   ├─ 4-6. Dashboard를 코드로 관리하고 CI/CD로 배포하기 (발행)
    │   ├─ 4-7. 버전은 그대로 두고 클러스터 구성을 바꿀 때 (발행)
    │   ├─ 4-8. 메이저 업그레이드는 되돌릴 수 없다는 전제로 (발행)
    │   ├─ 4-9. 보안 공지가 나왔을 때 어느 버전으로 가는가 (발행)
    │   └─ 4-10. 다른 플랫폼이나 구버전 데이터를 옮겨 올 때 (발행)
    │
    ├─ 5. 데이터에서 신호를 뽑아 행동으로 연결하기   (탐지와 알림)
    │   ├─ 5-1. Anomaly Detection in Production (01에서 09 발행)
    │   │   ├─ 10. 결과를 triage와 행동으로 연결하기 (다음 착수)
    │   │   └─ 11. job이 수백 개를 넘을 때 (예정)
    │   └─ 5-2. "alert가 없다 = 정상"을 보장하는 alerting 설계 (예정)
    │
    └─ 6. 검색 품질을 측정하고 개선하기   (검색)
        ├─ 6-1. semantic search를 도입하기 전에 무엇을 측정해야 하는가 (예정)
        ├─ 6-2. 외부 embedding, LLM 제공자가 바뀌어도 버티는 설계 (예정)
        └─ 6-3. (보류) Agent Builder, Workflows를 프로덕션에 올릴 때
```

## 진행 단계

| 단계 | 대상 | 이유 | 상태 |
| --- | --- | --- | --- |
| 0 | 사이트 구조와 공통 규칙 | 새 컬렉션을 넣을 자리와 URL 정책을 먼저 정해야 글을 옮길 일이 없음 | 부분 완료. 0-1 결정, 0-5 구현. 0-2, 0-3은 일부, 0-4는 남음 |
| 1 | 1-1, 1-2, 1-3, 1-4, 1-5 | 1-1, 1-2가 shard 내부 구조를 먼저 설명하고, 나머지는 같은 synthetic 로그 데이터셋과 labs 환경을 이어서 씀. 이후 단계의 기반 | 완료 |
| 2 | 3-1, 3-2, 5-1 10편 | 1단계 labs 환경을 재사용. 운영 관점 독자에게 가장 수요가 큼 | 일부 완료. 3-1, 3-2 발행, 5-1 10편 남음 |
| 3 | 2-1에서 2-8, 3-3, 5-2 | 수집과 보호 장치. 2-3에서 2-6은 같은 송신기와 유실 측정 방법을 공유. Fleet labs는 별도 환경이 필요 | 일부 완료. 2-1에서 2-8, 3-3 발행, 5-2 남음 |
| 4 | 4-1에서 4-10, 6-1, 6-2, 3-4, 5-1 11편 | 서로 독립적이라 시기에 맞춰 끼워 넣기 | 일부 완료. 3-4 발행, 변화 관리 10편 발행(managed 자산, Kibana 객체, dashboard CI/CD, 클러스터 구성 변경으로 범위 확장), 나머지 예정 |
| 보류 | 6-3 | 배포 형태별 GA 상태가 공식 문서에서 안정된 뒤 착수 | 보류 |

## TO-DO 요약

상세 계획은 각 컬렉션 문서에 있습니다. 공통 진행 항목은 [ARTICLE-CHECKLIST.md](ARTICLE-CHECKLIST.md)를 따릅니다.

### 0. 사이트 구조 ([상세](collections/00-site-structure.md))

- [x] 0-1. 최상위 sidebar와 URL 정책: 기존 AD URL 유지, 새 컬렉션은 문제 축 폴더. 공개 목록은 한 곳에서 관리 `결정` (sidebar 구조는 0-6으로 대체)
- [x] 0-6. 영역 단계 도입: 영역 > 컬렉션 > 글, 화면에는 한 영역만, 기존 URL 유지, 목록은 `src/site-areas.mjs` `결정`
- [ ] 0-2. 컬렉션별 `index.md`(draft) 뼈대 만들기 `부분 완료` (공개한 4개 컬렉션은 완료. 나머지는 첫 글을 쓸 때 만든다)
- [ ] 0-3. `labs/` 디렉터리 규칙과 공통 docker compose 환경 만들기 `부분 완료` (폴더 규칙, `labs/_datagen/`, 수집용 compose 완료. 공통 `labs/_env/`와 MinIO는 남음)
- [ ] 0-4. `templates/use-case.md`에 출처 등급과 경험 서술 안내 반영 `미착수`
- [ ] 0-5. 검색 유입과 AI agent 대응: 구조화 데이터, sitemap lastmod, RSS, llms.txt, .md 원문 구현. Search Console 등록과 root 파일, 영문판은 남음 `부분 결정`

### 1. 설계 ([상세](collections/01-data-design.md))

- [x] 1-1. Shard 안의 Lucene: segment가 생기고 사라지기까지 `발행` (`data/01-segments.md`)
- [x] 1-2. Merge와 force merge: 언제 하고 언제 하지 말아야 하나 `발행` (`data/02-merge-and-force-merge.md`)
- [x] 1-3. 로그 저장 용량은 무엇과 비교해 몇 % 줄어드는가 `발행` (`data/03-storage-footprint.md`)
- [x] 1-4. Shard 수와 크기, bulk 형태를 어떻게 정할 것인가 `발행` (`data/04-shards-and-bulk.md`)
- [x] 1-5. 오래된 데이터는 어디에 두고 어떻게 꺼내 볼 것인가 `발행` (`data/05-tiers-and-retention.md`)

### 2. 수집 ([상세](collections/02-ingest.md))

- [x] 2-1. 수집기는 무엇으로 고를 것인가 `발행` (`ingest/01-choose-collector.md`)
- [x] 2-2. 파싱은 어디서 할 것인가 `발행` (`ingest/02-where-to-parse.md`)
- [x] 2-3. 수집기가 멈춰도 로그가 끊기지 않게 하려면 `발행` (`ingest/03-no-gap-ingest.md`)
- [x] 2-4. UDP syslog를 유실 없이 받으려면 `발행` (`ingest/04-syslog-udp.md`)
- [x] 2-5. 원본을 빠짐없이 받았다는 것을 어떻게 증명하는가 `발행` (`ingest/05-count-reconciliation.md`)
- [x] 2-6. 수집 흐름을 대시보드로 어떻게 보는가 `발행` (`ingest/06-flow-dashboard.md`)
- [x] 2-7. 수집 계층에 자원은 얼마나 필요한가 `발행` (`ingest/07-collector-sizing.md`)
- [x] 2-8. 수백에서 수만 대 Agent를 어떻게 운영할 것인가 `발행` (`ingest/08-fleet-at-scale.md`)

### 3. 안정성 운영 ([상세](collections/03-cluster-stability.md))

- [x] 3-1. 평소에 무엇을 보고 있어야 하는가 `발행` (`operations/01-daily-checks.md`)
- [x] 3-2. 클러스터가 RED나 YELLOW일 때 무엇부터 보는가 `발행` (`operations/02-red-yellow.md`)
- [x] 3-3. 노드가 왜 죽었는지 어떻게 좁혀 가는가 `발행` (`operations/03-node-failure-triage.md`)
- [x] 3-4. 디스크가 차면 무슨 일이 생기고 어떻게 푸는가 `발행` (`operations/04-disk-full.md`)
- [x] 3-5. 클러스터가 느려질 때 어디서 막혔는지 어떻게 찾는가 `발행` (`operations/05-slow-cluster.md`)
- [x] 3-6. 비싼 query로부터 클러스터를 어떻게 보호하는가 `발행` (`operations/06-expensive-queries.md`)
- [x] 3-7. 노드가 클러스터에서 자꾸 빠질 때 `발행` (`operations/07-unstable-cluster.md`)
- [x] 3-8. 노드 하나를 잃어도 데이터를 잃지 않으려면 `발행` (`operations/08-recoverability.md`)
- [x] 3-9. 진단 파일을 밖으로 낼 수 없을 때 어떻게 점검하는가 `발행` (`operations/09-offline-diagnostics.md`)
- [x] 3-10. 장애가 났을 때 첫 30분에 무엇을 하는가 `발행` (`operations/10-incident-runbook.md`)

### 4. 변화 관리 ([상세](collections/04-change-management.md))

- [x] 4-1. 바뀌는 것의 지도 `발행` (`change/01-change-map.md`)
- [x] 4-2. 변경 절차 `발행` (`change/02-change-process.md`)
- [x] 4-3. managed 자산 `발행` (`change/03-managed-assets.md`)
- [x] 4-4. 데이터 정의 변경 `발행` (`change/04-data-definitions.md`)
- [x] 4-5. Kibana 객체와 설정 `발행` (`change/05-kibana-objects.md`)
- [x] 4-6. Dashboard CI/CD `발행` (`change/06-dashboards-as-code.md`)
- [x] 4-7. 클러스터 구성 변경 `발행` (`change/07-cluster-config.md`)
- [x] 4-8. 메이저 업그레이드 `발행` (`change/08-major-upgrade.md`)
- [x] 4-9. 보안 공지 대응 `발행` (`change/09-security-advisory.md`)
- [x] 4-10. 데이터 이관 `발행` (`change/10-data-migration.md`)
- [ ] 4-x 화면 캡처 18건 `미착수` ([목록](captures/change-captures.md))
- [ ] 4-x labs 실행 확인 `미착수`

### 5. 탐지와 알림 ([상세](collections/05-detection-alerting.md))

- [x] 5-1. Anomaly Detection in Production 01에서 09 `발행`
- [ ] 5-1-10. 결과를 triage와 행동으로 연결하기 `미착수` (다음 착수)
- [ ] 5-1-11. job이 수백 개를 넘을 때 `미착수`
- [ ] 5-2. "alert가 없다 = 정상"을 보장하는 alerting 설계 `미착수`

### 6. 검색 ([상세](collections/06-search.md))

- [ ] 6-1. semantic search를 도입하기 전에 무엇을 측정해야 하는가 `미착수`
- [ ] 6-2. 외부 embedding, LLM 제공자가 바뀌어도 버티는 설계 `미착수`
- [ ] 6-3. Agent Builder, Workflows를 프로덕션에 올릴 때 `보류`
