# Metrics와 TSDS 실측

[07. Metrics와 TSDS](https://munsik.github.io/engineering-notes/data/07-time-series/)의 실험 코드입니다.

```bash
python3 run.py --exp A   # 받는 시간 범위(지금, 1시간 전, 3시간 전, 1시간 뒤), failure store 유무
python3 run.py --exp B   # 같은 dimension과 시각의 중복, 사용자 지정 _id
python3 run.py --exp C   # data_stream.past_tsdb_index_creation_enabled(9.5)
python3 run.py --exp D   # 같은 metrics를 standard, logsdb, time_series로 저장한 크기
python3 run.py --exp E   # 5분 downsample 전후
```

- 환경: 로컬 Elasticsearch 9.5.5 단일 노드(vCPU 1, heap 1GB), 보안 끔.
- A, B, C는 basic 라이선스, D는 basic과 trial 양쪽(`results/exp_d_size_basic.json`, `exp_d_size_trial.json`), E는 trial로 실행했습니다.
- 시험 디스크 사용률이 96%라 D, E는 `indices.merge.disk.watermark.high`를 99%로 올리고 실행했습니다. 그대로 두면 force merge가 끝나지 않습니다.
- 시간 범위 실험은 실행 시각 기준으로 문서를 만듭니다. 결과 파일의 시각은 실행한 날의 값입니다.
