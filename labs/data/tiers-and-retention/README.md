# 오래된 데이터 실측

[05. 오래된 데이터는 어디에 두고 어떻게 꺼내 볼 것인가](https://munsik.github.io/engineering-notes/data/05-tiers-and-retention/)의 수치를 만든 실험 자료입니다.

| 단계 | 실행 | 결과 파일 |
| --- | --- | --- |
| repository 등록, 100만 건 적재, snapshot, fully/partially mount | `python3 run.py setup` | `results/setup.jsonl` |
| regular, fully mounted, partially mounted 조회 지연 | `python3 run.py latency 1`, 노드 재시작 뒤 `latency 2` | `results/latency.jsonl`, `cache_stats.jsonl` |
| `_tier`로 frozen 제외(Query DSL, ES\|QL `filter`) | `python3 run.py tier` | `results/tier.jsonl` |
| partially mounted 데이터를 regular index로 복원 | `python3 run.py restore` | `results/restore.jsonl` |
| ILM을 초 단위로 줄여 hot에서 frozen 전환 | `python3 run.py ilm` | `results/ilm.jsonl` |

## 실행 환경

| 항목 | 값 |
| --- | --- |
| Elasticsearch | 9.5.5 tarball, 단일 노드(모든 역할), JVM heap 1GB, trial 라이선스 |
| `elasticsearch.yml` | `path.repo: ["/home/claude/repo"]`, `xpack.searchable.snapshot.shared_cache.size: 1gb` |
| repository | `fs` 타입, 같은 디스크 |
| 실행일 | 2026-11-26 |

## 주의

- repository가 로컬 디스크라서 partially mounted index의 첫 조회 지연은 object storage보다 훨씬 작게 나옵니다.
- dedicated frozen node가 아니면 shared cache 기본값이 0이라 `xpack.searchable.snapshot.shared_cache.size`를 직접 잡아야 partially mounted index가 할당됩니다.
- 단일 노드라 frozen node 재시작 중 검색 결과 비교는 재현하지 못했습니다.
