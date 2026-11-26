# 흐름 대시보드 정의

06의 흐름 대시보드를 만들기 위한 패널 정의입니다. 모든 패널은 ES|QL로 정의해 data view 의존이 없습니다.

- [`panels.esql`](panels.esql): 패널별 쿼리. Discover의 ES|QL에서 하나씩 실행해 볼 수 있습니다.
- [`dashboard.json`](dashboard.json): Dashboards API(Stack 9.5 GA)에 그대로 보내는 정의입니다.

```bash
curl -X PUT "$KIBANA_URL/api/dashboards/lab-ingest-flow" \
  -H "Authorization: ApiKey $KIBANA_API_KEY" \
  -H "kbn-xsrf: true" -H "Content-Type: application/json" \
  -d @dashboard.json
```

| ID | 패널 | 차트 | 상태(lab 9.5.5, `compose/` 실행) |
| --- | --- | --- | --- |
| P1 | 단계별 처리량(Agent acked, Logstash `events.in`, Elasticsearch 저장) | 선 3개를 한 패널에 | 확인. counter라 `TS` + `INCREASE`. Agent는 monitoring과 `elasticsearch-*` component를 빼야 두 배로 세지 않음 |
| P2 | 수집 지연 p50, p95 | 선 | 확인 |
| P3 | Agent queue 사용률 상위 | 표 | 확인. `filled.pct`는 0에서 1 사이 비율 |
| P4 | Logstash worker 사용률(노드별) | 선 | 확인. `logstash.pipeline.total.flow.*` 아래에 있고, `worker_utilization`은 0에서 100 사이 백분율 |
| P5 | UDP drop 증가분 | 선 | 쿼리 확인. lab에서는 유실이 있었는데도 값이 0이었음(04 참고) |
| P6 | 실패 문서 | 표 | 확인. `document.index`로 묶음 |
| P7 | 원천별 마지막 수신 | 표 | 확인 |

배치: 1행 P1(넓게), 2행 P2, P3 / 3행 P4, P5 / 4행 P6, P7. 시간 범위 기본값은 최근 6시간.
