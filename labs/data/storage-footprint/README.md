# 저장 용량 비교 실측

[03. 로그 저장 용량은 무엇과 비교해 몇 % 줄어드는가](https://munsik.github.io/engineering-notes/data/03-storage-footprint/)의 수치를 만든 실험 자료입니다.

| 경로 | 내용 |
| --- | --- |
| [`run.py`](run.py) | 5개 설정 x 4개 데이터셋 적재, 크기, `_disk_usage`, 조회 지연 측정 |
| [`fidelity.py`](fidelity.py) | 같은 문서를 4개 설정에 넣고 돌아오는 `_source` 비교 |
| [`results/raw_run1.jsonl`, `raw_run2.jsonl`](results/) | 조합별 원본 결과. `disk_usage`에 구조별 합계와 큰 필드 8개 |
| [`results/summary.csv`](results/summary.csv) | 본문 크기 표. 칸마다 "1회차 / 2회차" |
| [`results/disk_usage_run2.csv`](results/disk_usage_run2.csv) | 본문 `_disk_usage` 표 |
| [`results/fidelity.json`](results/fidelity.json) | `_source` 비교 결과 |

## 실행 환경

| 항목 | 값 |
| --- | --- |
| Elasticsearch | 9.5.5 tarball, 단일 노드, JVM heap 1GB |
| 머신 | vCPU 1, RAM 3GB. 적재 클라이언트도 같은 머신 |
| 라이선스 | trial. basic 라이선스 동작은 같은 노드에서 trial 시작 전에 확인 |
| 인덱스 | index template으로 만든 data stream, primary 1개, replica 0개, `refresh_interval: 30s` |
| 실행일 | 2026-11-26 |

## 실행

```bash
pip install requests
python3 run.py --es http://localhost:9200 --run 1
python3 run.py --es http://localhost:9200 --run 2
python3 fidelity.py http://localhost:9200 > results/fidelity.json
```

조합 하나에 1분 안팎, 전체 한 회차에 20분 정도 걸렸습니다. 데이터셋 NDJSON은 `/tmp/sf-work`에 한 번 만들어 재사용합니다.

## 실행하면서 알게 된 것

- 1회차의 첫 조합들은 JVM warm-up 영향으로 적재 속도가 낮게 나왔습니다. 적재 속도와 CPU는 2회차 값으로 봅니다. 크기는 두 회차가 1% 안쪽으로 같았습니다.
- create index 요청이나 `data_stream`이 없는 index template으로 `index.mode: logsdb`를 주면 `host.name` 정렬이 붙지 않습니다. 그래서 모든 조합을 `data_stream: {}`가 있는 index template으로 만든 data stream으로 했습니다.
- basic 라이선스에서 `index.mapping.source.mode: synthetic`은 HTTP 200으로 받아들여지지만 실제 값은 STORED였습니다.
