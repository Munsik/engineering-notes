# Shard와 bulk 실측

[04. Shard 수와 크기, bulk 형태를 어떻게 정할 것인가](https://munsik.github.io/engineering-notes/data/04-shards-and-bulk/)의 수치를 만든 실험 자료입니다.

| 실험 | 실행 | 결과 파일 |
| --- | --- | --- |
| A. bulk 1, 10, 100, 1,000, 5,000건 x primary 1, 5, 20개 | `python3 run.py --exp A --run 1` (`--shards 1`로 일부만) | `results/A_bulk_shards.jsonl`, `A_bulk_shards.csv` |
| B. tenant 100 x dataset 3을 data stream 300개로 나눈 경우와 공용 data stream 3개 | `python3 run.py --exp B --run 1` | `results/B_multitenant.jsonl`, `B_multitenant.csv` |
| C. primary 4개, `routing: tenant.id`, 문서 70%를 tenant 하나에 몰기 | `python3 run.py --exp C` | `results/C_skew.json` |

## 실행 환경

| 항목 | 값 |
| --- | --- |
| Elasticsearch | 9.5.5 tarball, 단일 노드, JVM heap 1GB |
| 머신 | vCPU 1, RAM 3GB. 클라이언트 하나가 같은 머신에서 순서대로 `_bulk` |
| 인덱스 | replica 0개, `refresh_interval: 30s`, auto-generated id. B는 logsdb data stream |
| 실행일 | 2026-11-26 |

## 실행하면서 알게 된 것

- 실험 A 2회차는 노드 재시작 직후에 돌아서 primary 1개 행(매 라운드 첫 칸)이 warm-up 영향을 크게 받았습니다. 그 행만 JVM이 충분히 돈 뒤 3회차(`--run 3 --shards 1`)로 다시 쟀고, 본문에는 1회차와 3회차를 적었습니다.
- shard 단위 bulk 요청 수는 `_nodes/stats`의 `indices.bulk.total_operations` 증가분입니다.
- 기획 단계의 3노드 docker compose 구성은 쓰지 않았습니다. 노드 사이 분산(write queue 편중)은 다중 노드에서 따로 재현할 예정입니다.
